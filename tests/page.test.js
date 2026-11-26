import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const read = (path) => readFileSync(join(publicDir, path), "utf8");
const html = read("index.html");
const config = await import("../public/js/config.js");

const RELAY_URL = "https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@6.2.0/dist/browser/embed.js";
const POLYFILL_SHA256 = "e6d042e734e1dd08a455f249936ab045575c19fddf860f7e120a0dcaf350f05c";
// SHA-384 of embed.js in @mcp-b/webmcp-local-relay@6.2.0. The browser refuses the script if the CDN serves other bytes.
const RELAY_INTEGRITY = "sha384-TdRkxKVAOiJ9BvMYRwxw+u7/H9nqwfD2Ovc2wXVGXrmWiqjGH+ONecZxIfnfqQIa";
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].slice(1).map((m) => [m[1], m[2] ?? ""]));
const tags = (name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => ({ index: m.index, attrs: attributes(m[0]) }));
const ownScripts = readdirSync(join(publicDir, "js")).filter((file) => file.endsWith(".js"));

test("AC1.6 every src and href is relative, except the one pinned relay script", () => {
  const urls = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(urls.length >= 3);
  const external = urls.filter((url) => /^[a-z][a-z0-9+.-]*:|^\/\//i.test(url));
  assert.deepEqual(external, [RELAY_URL]);
  for (const url of urls.filter((u) => u !== RELAY_URL)) {
    assert.ok(!url.startsWith("/"), `${url} is an absolute path`);
    assert.ok(existsSync(join(publicDir, url)), `${url} does not exist in public/`);
  }
});

test("the page names its own icon, so the browser never asks the host for /favicon.ico", () => {
  const icons = tags("link").filter((link) => link.attrs.rel === "icon");
  assert.deepEqual(icons.map((link) => link.attrs.href), ["favicon.svg"]);
  assert.equal(icons[0].attrs.type, "image/svg+xml");
  const svg = read("favicon.svg");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  // The icon is a picture and nothing else: no script and no address to load.
  assert.doesNotMatch(svg, /<script|\bon[a-z]+\s*=|href=|url\(/i);
});

test("AC7.1 no hard-coded host, port or absolute path in the page files", () => {
  assert.equal((html.match(/https?:\/\//g) ?? []).length, 1, "index.html has exactly one absolute URL");
  const css = read("styles.css");
  assert.doesNotMatch(css, /https?:\/\/|url\(\s*["']?\//, "styles.css");
  for (const file of ownScripts) {
    const source = read(`js/${file}`);
    assert.doesNotMatch(source, /localhost|127\.0\.0\.1|:5175|:5173/, `js/${file}`);
    const urls = source.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
    // The one address the scripts know is the Supabase project, and it is written in one place.
    if (file === "config.js") assert.deepEqual(urls, [config.SUPABASE_URL], "config.js has the project URL and no other");
    else assert.deepEqual(urls, [], `js/${file} contains a URL`);
    for (const [, specifier] of source.matchAll(/\bfrom\s+"([^"]+)"/g)) {
      assert.match(specifier, /^\.\//, `js/${file} imports ${specifier}`);
      assert.ok(existsSync(join(publicDir, "js", specifier)), `js/${file} imports a missing file ${specifier}`);
    }
  }
});

test("AC1.7 page code never turns text into markup", () => {
  for (const file of ownScripts) {
    assert.doesNotMatch(read(`js/${file}`), /innerHTML|outerHTML|insertAdjacentHTML|setHTML|DOMParser|createContextualFragment|srcdoc|document\.write|\beval\(|new Function/, `js/${file}`);
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "no inline event handlers");
});

test("AC8.1 scripts: polyfill first as a classic script, then the app module, relay last with an integrity hash", () => {
  const scripts = tags("script");
  assert.equal(scripts.length, 3);
  const [polyfill, app, relay] = scripts;
  const headEnd = html.indexOf("</head>");

  assert.equal(polyfill.attrs.src, "vendor/webmcp-polyfill.js");
  assert.equal(polyfill.attrs.type, undefined);
  assert.equal(polyfill.attrs.defer, undefined);
  assert.equal(polyfill.attrs.async, undefined);
  assert.ok(polyfill.index < headEnd, "polyfill is in <head>");

  assert.equal(app.attrs.src, "js/app.js");
  assert.equal(app.attrs.type, "module");
  assert.ok(app.index < headEnd, "app module is in <head>");

  assert.equal(relay.attrs.src, RELAY_URL);
  assert.equal(relay.attrs.integrity, RELAY_INTEGRITY);
  assert.equal(relay.attrs.crossorigin, "anonymous");
  assert.ok(relay.index > app.index);
});

test("AC8.2 the vendored polyfill is unchanged and ships with its licence", () => {
  const hash = createHash("sha256").update(readFileSync(join(publicDir, "vendor/webmcp-polyfill.js"))).digest("hex");
  assert.equal(hash, POLYFILL_SHA256);
  assert.match(read("vendor/LICENSE-webmcp-polyfill.txt"), /Apache License\s+Version 2\.0/);
});

test("supabase: the page knows one project, by HTTPS, and holds no key that could write past the database rules", () => {
  assert.match(config.SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  const key = config.SUPABASE_KEY;
  assert.equal(typeof key, "string");
  assert.doesNotMatch(key, /^sb_secret_/, "a secret key must never be in the page");
  // An older project has JWT keys: the one in the page must be the anon key, not the service role key.
  if (key.split(".").length === 3) {
    const { role } = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    assert.equal(role, "anon", "the key in the page must be the anon key");
  } else if (key !== "") {
    assert.match(key, /^sb_publishable_/, "the key in the page must be the publishable key");
  }
  // Only config.js and the script that starts the page know the project.
  for (const file of ownScripts.filter((name) => name !== "config.js" && name !== "app.js")) {
    assert.doesNotMatch(read(`js/${file}`), /config\.js|SUPABASE_/, `js/${file}`);
  }
  // Nothing is loaded on request any more: the page has no SQLite and no other late script.
  assert.deepEqual(ownScripts.flatMap((file) => [...read(`js/${file}`).matchAll(/\bimport\(/g)].map(() => file)), []);
  assert.equal(existsSync(join(publicDir, "vendor/sqlite3.js")), false);
});

test("supabase: the page asks for the list and registers the tools without waiting for the database", () => {
  const appSource = read("js/app.js");
  const start = appSource.indexOf("// ── Start");
  const asked = appSource.indexOf("\nrender();", start);
  const registered = appSource.indexOf("\nawait registerTools(tools);", start);
  assert.ok(start !== -1 && start < asked && asked < registered, `${start} < ${asked} < ${registered}`);
  // An agent that lists the tools right after the page loads must find them, however slow the database is.
  assert.doesNotMatch(appSource.slice(start, registered), /\bawait\b/);
});

test("AC1.4 and AC1.5 the page has a demo banner, no outside links and no form except the sign-in and the new service", () => {
  assert.match(html, /<html lang="lt">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /id="demo-banner"[^>]*>[^<]*išgalvot/);
  assert.deepEqual(tags("form").map((form) => form.attrs.id), ["login-form", "service-form"]);
  assert.doesNotMatch(html, /<a\b/i);
  assert.doesNotMatch(html, /<iframe\b/i);
});

test("login: the sign-in form is sent by the script alone and sits in a dialog", () => {
  const [form] = tags("form");
  // method="dialog" and no action: the browser itself sends the fields nowhere and never puts them into the address
  // bar. The script sends them to Supabase Auth.
  assert.equal(form.attrs.method, "dialog");
  assert.equal(form.attrs.action, undefined);
  const dialogStart = html.indexOf('<dialog id="login-dialog"');
  const dialogEnd = html.indexOf("</dialog>");
  assert.ok(dialogStart !== -1 && dialogStart < form.index && form.index < dialogEnd, "the form is inside #login-dialog");

  const inputs = Object.fromEntries(tags("input").map((input) => [input.attrs.id, input.attrs]));
  // Not type="email": the demo account signs in with the plain name "jonas", which the browser would refuse.
  assert.equal(inputs["login-email"].type, "text");
  assert.equal(inputs["login-email"].inputmode, "email");
  assert.equal(inputs["login-email"].autocomplete, "username");
  assert.equal(inputs["login-password"].type, "password");
  assert.equal(inputs["login-password"].autocomplete, "current-password");
  // The name is asked for only when an account is created, and is never required.
  assert.equal(inputs["login-name"].required, undefined);
  assert.match(html, /<div id="login-name-field"[^>]*\shidden>/);
  // No value may be written into the markup.
  for (const id of ["login-name", "login-email", "login-password"]) assert.equal(inputs[id].value, undefined, id);
});

test("login: the page has the account controls the script expects, hidden until the script decides", () => {
  for (const id of ["account-user", "sign-in", "sign-out", "login-dialog", "login-form", "login-title", "login-name-field", "login-name", "login-email", "login-password", "login-error", "login-mode", "login-cancel", "login-submit"]) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
    assert.match(read("js/app.js"), new RegExp(`\\$\\("${id}"\\)`), `app.js uses #${id}`);
  }
  for (const id of ["account-user", "sign-in", "sign-out", "login-error"]) {
    assert.match(html, new RegExp(`<[^>]*id="${id}"[^>]*\\shidden[\\s>]`), `#${id} starts hidden`);
  }
});

test("login: the password is handed to Supabase and kept nowhere in the page", () => {
  const appSource = read("js/app.js");
  // Read from the field in one place, for the one call; never written to the storage or the address.
  assert.equal(appSource.split("dom.loginPassword.value").length - 1, 2, "read once, cleared once");
  assert.doesNotMatch(read("js/auth.js"), /password[^\n]*setItem|setItem[^\n]*password/i);
  // The dialog forgets what was typed whenever it closes.
  assert.match(appSource, /dom\.loginDialog\.addEventListener\("close", \(\) => \{\s+dom\.loginForm\.reset\(\);/);
  // The session that comes back with the confirmation link is taken out of the address bar.
  assert.match(appSource, /history\.replaceState\(null, "", `\$\{location\.pathname\}\$\{location\.search\}`\)/);
});

test("new service: the form is sent by the script alone, sits in a dialog and says that the listing will be public", () => {
  const form = tags("form").find((tag) => tag.attrs.id === "service-form");
  assert.equal(form.attrs.method, "dialog");
  assert.equal(form.attrs.action, undefined);
  // The script checks the fields and shows the messages in the language of the page, so the browser's own check is off.
  assert.equal(form.attrs.novalidate, "");
  const dialogStart = html.indexOf('<dialog id="service-dialog"');
  const dialogEnd = html.indexOf("</dialog>", dialogStart);
  assert.ok(dialogStart !== -1 && dialogStart < form.index && form.index < dialogEnd, "the form is inside #service-dialog");
  assert.match(html.slice(dialogStart, dialogEnd), /viešoje duomenų bazėje[^<]*matoma visiems/, "the form says where the listing is kept and who sees it");
});

test("new service: the page has every element the script expects, and a label for every field", () => {
  const appSource = read("js/app.js");
  const ids = [...appSource.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
  for (const id of ["add-service", "service-dialog", "service-form", "service-error", "service-draft", "service-cancel", "service-submit", "s-languages", "s-hours", "login-reason"]) {
    assert.ok(ids.includes(id), `app.js uses #${id}`);
  }
  for (const id of ids) assert.equal(html.split(`id="${id}"`).length - 1, 1, `#${id} is in the page once`);
  for (const id of ids.filter((name) => /^s-(?!languages$|hours$)/.test(name))) {
    assert.match(html, new RegExp(`<label[^>]*\\sfor="${id}"`), `#${id} has a label`);
  }
  for (const id of ["service-error", "service-draft", "login-reason"]) {
    assert.match(html, new RegExp(`<[^>]*id="${id}"[^>]*\\shidden[\\s>]`), `#${id} starts hidden`);
  }
});

test("new service: the form reader knows every field of the form, by the same name", async () => {
  const { INPUT_FIELDS } = await import("../public/js/listing-input.js");
  const dialogStart = html.indexOf('<dialog id="service-dialog"');
  const dialog = html.slice(dialogStart, html.indexOf("</dialog>", dialogStart));
  const names = [...dialog.matchAll(/\sname="([^"]+)"/g)].map((m) => m[1]);
  // Languages and working hours are built by the script from the catalog.
  assert.deepEqual([...names, "languages", "hours"].sort(), [...INPUT_FIELDS].sort());
  const appSource = read("js/app.js");
  for (const name of names) assert.match(appSource, new RegExp(`\\b${name}: \\$\\("s-`), `app.js reads ${name}`);
});

test("AC1.2 and AC1.3 the page has the controls the script expects", () => {
  for (const id of ["f-query", "f-category", "f-country", "f-city", "f-sort", "f-open", "result-count", "chips", "clear-all", "agent-notice", "pinned", "results", "pager", "page-prev", "page-info", "page-next", "empty"]) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
  }
  const appSource = read("js/app.js");
  for (const [, id] of appSource.matchAll(/getElementById\("([^"]+)"\)/g)) {
    assert.match(html, new RegExp(`id="${id}"`), `app.js looks for #${id}`);
  }
});

test("a listing has an address: the page opens the listing named after the #, and gives the tools that address", () => {
  const appSource = read("js/app.js");
  // Relative to wherever the page is hosted, like everything else.
  assert.match(appSource, /const listingUrl = \(id\) => `\$\{pageAddress\(\)\}#\$\{id\}`;/);
  assert.match(appSource, /\/\^#\(svc-\\d\{1,9\}\)\$\/i\.exec\(location\.hash\)/);
  // On load and when a link is followed in the open page; the tools are still registered without waiting for it.
  assert.match(appSource, /\nshowLinked\(\);\nwindow\.addEventListener\("hashchange", showLinked\);/);
});

test("agent notes: the page itself never asks for them and has no words for them", () => {
  // Only tools.js reads the notes, through directory.notes; nothing that draws the page knows they exist.
  for (const file of ownScripts.filter((name) => !["tools.js", "directory.js"].includes(name))) {
    assert.doesNotMatch(read(`js/${file}`), /agent_notes|agentNotes|agentOffer|\.notes\(/, file);
  }
  assert.doesNotMatch(html + read("styles.css"), /agent_notes|agentNotes|agentOffer|MCP-\d/);
  assert.equal([...read("js/tools.js").matchAll(/directory\.notes\(/g)].length, 1);
  assert.equal([...read("js/directory.js").matchAll(/"agent_notes"/g)].length, 1);
});

test("only the temporary check tool is gone: the page registers the real tools with all three page effects", () => {
  const appSource = read("js/app.js");
  assert.doesNotMatch(appSource, /ping_services/);
  assert.match(appSource, /createTools\(\{[^}]*\blistingUrl, showFilters, showListing, showDraft \}\)/);
  assert.match(appSource, /registerTools\(/);
});
