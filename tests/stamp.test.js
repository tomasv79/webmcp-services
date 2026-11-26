import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stampFolder, stampHtml, stampScript } from "../scripts/stamp.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const RELAY = '<script src="https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@6.2.0/dist/browser/embed.js" integrity="sha384-x" crossorigin="anonymous"></script>';

test("stamp: every import of a script gets the version, and nothing else changes", () => {
  const source = [
    'import * as catalog from "./vocabulary.js";',
    'import { a,',
    '  b } from "./text.js";',
    'import "./side-effect.js";',
    'const later = await import("../js/later.js");',
    'const text = "from here to ./there.js";',
    'const url = "https://example.test/a.js";',
  ].join("\n");
  assert.equal(stampScript(source, "abc123"), [
    'import * as catalog from "./vocabulary.js?v=abc123";',
    'import { a,',
    '  b } from "./text.js?v=abc123";',
    'import "./side-effect.js?v=abc123";',
    'const later = await import("../js/later.js?v=abc123");',
    'const text = "from here to ./there.js";',
    'const url = "https://example.test/a.js";',
  ].join("\n"));
});

test("stamp: the page's own scripts and style sheets get the version; other addresses are left alone", () => {
  const html = ['<link rel="stylesheet" href="styles.css">', '<script src="vendor/webmcp-polyfill.js"></script>', '<script type="module" src="js/app.js"></script>', '<a href="#main">x</a>', '<a href="page.html">y</a>', '<script src="/absolute.js"></script>', '<script src="//host.test/a.js"></script>', RELAY].join("\n");
  assert.equal(stampHtml(html, "abc123"), ['<link rel="stylesheet" href="styles.css?v=abc123">', '<script src="vendor/webmcp-polyfill.js?v=abc123"></script>', '<script type="module" src="js/app.js?v=abc123"></script>', '<a href="#main">x</a>', '<a href="page.html">y</a>', '<script src="/absolute.js"></script>', '<script src="//host.test/a.js"></script>', RELAY].join("\n"));
});

test("stamp: stamping twice changes nothing more, and a version that could break an address is refused", () => {
  const once = stampScript('import { a } from "./a.js";', "v1");
  assert.equal(stampScript(once, "v2"), once);
  const html = stampHtml('<script type="module" src="js/app.js"></script>', "v1");
  assert.equal(stampHtml(html, "v2"), html);
  for (const version of ["", "a b", 'a"b', "a&b", "a/b", undefined, 5]) {
    assert.throws(() => stampScript("", version), /Not a version/);
    assert.throws(() => stampHtml("", version), /Not a version/);
  }
});

test("stamp: in the real page every file that loads another one asks for it with the version", () => {
  const folder = mkdtempSync(join(tmpdir(), "stamp-"));
  try {
    cpSync(publicDir, folder, { recursive: true });
    const changed = stampFolder(folder, "abc123");
    const scripts = readdirSync(join(publicDir, "js")).filter((name) => name.endsWith(".js"));

    // index.html: its style sheet and both of its own scripts, and not the relay script from the CDN.
    const html = readFileSync(join(folder, "index.html"), "utf8");
    const addresses = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(addresses.filter((a) => a.includes("?v=")).sort(), ["js/app.js?v=abc123", "styles.css?v=abc123", "vendor/webmcp-polyfill.js?v=abc123"]);
    assert.deepEqual(addresses.filter((a) => !a.includes("?v=") && /\.(js|css)$/.test(a)).map((a) => new URL(a).host), ["cdn.jsdelivr.net"]);

    // The scripts: no import is left without the version, so no module can be loaded under two addresses.
    const importers = [];
    for (const name of scripts) {
      const before = readFileSync(join(publicDir, "js", name), "utf8");
      const after = readFileSync(join(folder, "js", name), "utf8");
      const imports = [...before.matchAll(/^import\b[^;]*?"([^"]+)";/gms)].map((m) => m[1]);
      for (const address of imports) assert.ok(after.includes(`"${address}?v=abc123"`), `${name} imports ${address}`);
      assert.equal(after.split("?v=abc123").length - 1, imports.length, name);
      assert.equal(after.replaceAll("?v=abc123", ""), before, `${name} is otherwise unchanged`);
      if (imports.length > 0) importers.push(join("js", name));
    }
    assert.ok(importers.length >= 3);
    assert.deepEqual(changed, ["index.html", ...importers.sort()]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("stamp: the Pages workflow stamps the files with the commit before it uploads them", () => {
  const workflow = readFileSync(join(root, ".github/workflows/pages.yml"), "utf8");
  const stamp = workflow.indexOf('node scripts/stamp.js public "$GITHUB_SHA"');
  assert.ok(stamp !== -1, "the stamp step");
  assert.ok(workflow.indexOf("actions/checkout") < stamp && stamp < workflow.indexOf("actions/upload-pages-artifact"));
});
