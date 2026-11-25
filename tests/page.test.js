import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const read = (path) => readFileSync(join(publicDir, path), "utf8");
const html = read("index.html");

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

test("AC1.4 and AC1.5 the page has a demo banner and no forms or outside links", () => {
  assert.match(html, /<html lang="lt">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /id="demo-banner"[^>]*>[^<]*išgalvot/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<a\b/i);
  assert.doesNotMatch(html, /<iframe\b/i);
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

test("only the temporary check tool is gone: the page registers the three real tools", () => {
  const appSource = read("js/app.js");
  assert.doesNotMatch(appSource, /ping_services/);
  assert.match(appSource, /createTools\(/);
  assert.match(appSource, /registerTools\(/);
});
