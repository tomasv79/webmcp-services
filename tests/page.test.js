import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const read = (path) => readFileSync(join(publicDir, path), "utf8");
const html = read("index.html");
const authModule = await import("../public/js/auth.js");

const RELAY_URL = "https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@6.2.0/dist/browser/embed.js";
const POLYFILL_SHA256 = "e6d042e734e1dd08a455f249936ab045575c19fddf860f7e120a0dcaf350f05c";
// SHA-384 of embed.js in @mcp-b/webmcp-local-relay@6.2.0. The browser refuses the script if the CDN serves other bytes.
const RELAY_INTEGRITY = "sha384-TdRkxKVAOiJ9BvMYRwxw+u7/H9nqwfD2Ovc2wXVGXrmWiqjGH+ONecZxIfnfqQIa";
// dist/index.mjs (kept here as sqlite3.js) and dist/sqlite3.wasm of @sqlite.org/sqlite-wasm@3.54.1-build1.
const SQLITE_SHA256 = {
  "vendor/sqlite3.js": "0dcdd860e6ec672623b13b8b8e41bb6c78be7a5df80ec553fc4f69160161c8af",
  "vendor/sqlite3.wasm": "b8a92a19f441a90ff2339fe988fbe317c4adf3ed844096f12aee04aa72d58257",
};

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

test("AC7.1 no hard-coded host, port or absolute path in the page files", () => {
  assert.equal((html.match(/https?:\/\//g) ?? []).length, 1, "index.html has exactly one absolute URL");
  const css = read("styles.css");
  assert.doesNotMatch(css, /https?:\/\/|url\(\s*["']?\//, "styles.css");
  for (const file of ownScripts) {
    const source = read(`js/${file}`);
    assert.doesNotMatch(source, /localhost|127\.0\.0\.1|:5175|:5173/, `js/${file}`);
    const urls = source.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
    if (file === "data.js" || file === "generate.js") {
      // Fictional provider websites: fixed in data.js, built from a name in generate.js.
      for (const url of urls) assert.match(url, /^https:\/\/([a-z0-9-]+|\$\{[A-Za-z]+\})\.example$/, `${file} ${url}`);
    } else {
      assert.deepEqual(urls, [], `js/${file} contains a URL`);
    }
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

test("sqlite: the vendored build is unchanged, ships with its licence and is loaded by sqlite.js alone", () => {
  for (const [file, expected] of Object.entries(SQLITE_SHA256)) {
    assert.equal(createHash("sha256").update(readFileSync(join(publicDir, file))).digest("hex"), expected, file);
  }
  assert.match(read("vendor/LICENSE-sqlite-wasm.txt"), /Apache License\s+Version 2\.0/);
  // sqlite3.js fetches the .wasm file from beside itself, under this name.
  assert.match(read("vendor/sqlite3.js"), /new URL\("sqlite3\.wasm", import\.meta\.url\)/);

  // Loaded on request and not from index.html, so the page never waits for it to show the catalog.
  assert.doesNotMatch(html, /sqlite3/);
  const loaded = ownScripts.flatMap((file) => [...read(`js/${file}`).matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)].map((m) => `${file}: ${m[1]}`));
  assert.deepEqual(loaded, ["sqlite.js: ../vendor/sqlite3.js"]);
});

test("sqlite: the page shows the catalog first and registers the tools without waiting for the stored listings", () => {
  const appSource = read("js/app.js");
  const start = appSource.indexOf("// ── Start");
  const shown = appSource.indexOf("\nrender();", start);
  const loading = appSource.indexOf("\nconst stored = openUserListings();", start);
  const registered = appSource.indexOf("\nawait registerTools(answeringAfter(stored, tools));", start);
  assert.ok(start !== -1 && start < shown && shown < loading && loading < registered, `${start} < ${shown} < ${loading} < ${registered}`);
  // An agent that lists the tools right after the page loads must find them: SQLite takes seconds to arrive.
  assert.doesNotMatch(appSource.slice(start, registered), /await (openUserListings\(|stored\b)/);
});

test("AC1.4 and AC1.5 the page has a demo banner, no outside links and no form except the sign-in and the new service", () => {
  assert.match(html, /<html lang="lt">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /id="demo-banner"[^>]*>[^<]*išgalvot/);
  assert.deepEqual(tags("form").map((form) => form.attrs.id), ["login-form", "service-form"]);
  assert.doesNotMatch(html, /<a\b/i);
  assert.doesNotMatch(html, /<iframe\b/i);
});

test("login: the sign-in form sends nothing anywhere and sits in a dialog", () => {
  const [form] = tags("form");
  // method="dialog" only closes the dialog; a plain form would put the fields into the address bar.
  assert.equal(form.attrs.method, "dialog");
  assert.equal(form.attrs.action, undefined);
  const dialogStart = html.indexOf('<dialog id="login-dialog"');
  const dialogEnd = html.indexOf("</dialog>");
  assert.ok(dialogStart !== -1 && dialogStart < form.index && form.index < dialogEnd, "the form is inside #login-dialog");

  const inputs = Object.fromEntries(tags("input").map((input) => [input.attrs.id, input.attrs]));
  assert.equal(inputs["login-username"].autocomplete, "username");
  assert.equal(inputs["login-password"].type, "password");
  assert.equal(inputs["login-password"].autocomplete, "current-password");
  // No value may be written into the markup.
  assert.equal(inputs["login-username"].value, undefined);
  assert.equal(inputs["login-password"].value, undefined);
});

test("login: the page has the account controls the script expects, hidden until the script decides", () => {
  for (const id of ["account-user", "sign-in", "sign-out", "login-dialog", "login-form", "login-username", "login-password", "login-error", "login-cancel"]) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
    assert.match(read("js/app.js"), new RegExp(`\\$\\("${id}"\\)`), `app.js uses #${id}`);
  }
  for (const id of ["account-user", "sign-in", "sign-out", "login-error"]) {
    assert.match(html, new RegExp(`<[^>]*id="${id}"[^>]*\\shidden[\\s>]`), `#${id} starts hidden`);
  }
});

test("login: the demo passwords are only in auth.js and the README", () => {
  const { USERS } = authModule;
  const readme = readFileSync(join(publicDir, "../README.md"), "utf8");
  for (const user of USERS) {
    assert.ok(readme.includes(`\`${user.username}\``), `README lists ${user.username}`);
    assert.ok(readme.includes(`\`${user.password}\``), `README lists the password of ${user.username}`);
    assert.ok(!html.includes(user.password), "index.html");
    for (const file of ownScripts.filter((name) => name !== "auth.js")) {
      assert.ok(!read(`js/${file}`).includes(user.password), `js/${file}`);
    }
  }
});

test("new service: the form sends nothing anywhere and sits in a dialog", () => {
  const form = tags("form").find((tag) => tag.attrs.id === "service-form");
  assert.equal(form.attrs.method, "dialog");
  assert.equal(form.attrs.action, undefined);
  // The script checks the fields and shows the messages in the language of the page, so the browser's own check is off.
  assert.equal(form.attrs.novalidate, "");
  const dialogStart = html.indexOf('<dialog id="service-dialog"');
  const dialogEnd = html.indexOf("</dialog>", dialogStart);
  assert.ok(dialogStart !== -1 && dialogStart < form.index && form.index < dialogEnd, "the form is inside #service-dialog");
  assert.match(html.slice(dialogStart, dialogEnd), /tik šioje naršyklėje/, "the form says where the listing is kept");
});

test("new service: the page has every element the script expects, and a label for every field", () => {
  const appSource = read("js/app.js");
  const ids = [...appSource.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
  for (const id of ["add-service", "service-dialog", "service-form", "service-error", "service-draft", "service-cancel", "s-languages", "s-hours", "login-reason"]) {
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

test("only the temporary check tool is gone: the page registers the real tools with all three page effects", () => {
  const appSource = read("js/app.js");
  assert.doesNotMatch(appSource, /ping_services/);
  assert.match(appSource, /createTools\(\{[^}]*\bshowFilters, showListing, showDraft \}\)/);
  assert.match(appSource, /registerTools\(/);
});
