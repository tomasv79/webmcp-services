// Adds "?v=<version>" to every address by which the page's own files load each other, in place:
//
//   node scripts/stamp.js public 302a636
//
// GitHub Pages tells browsers to keep every file for ten minutes and that cannot be changed. Right after a deploy a
// browser could so run the new index.html with an old script out of its cache. With the version in the addresses,
// a new index.html asks for files the browser has never seen, and an old one keeps getting the old ones: the files
// of a page always come from one deploy.
//
// Only the Pages workflow runs this, on its own checkout. The files in the repository stay as they are written, and
// the container serves them with "Cache-Control: no-cache", which needs no version.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const VERSION = /^[\w.-]+$/;

function checked(version) {
  if (typeof version !== "string" || !VERSION.test(version)) throw new Error(`Not a version: ${JSON.stringify(version)}`);
  return version;
}

/** The imports of a script: from "./text.js" becomes from "./text.js?v=...". One module must have one address, so every import gets the same version. */
export function stampScript(source, version) {
  const v = checked(version);
  return source.replace(/(\b(?:from|import)\s*\(?\s*")(\.{1,2}\/[\w./-]+\.js)(")/g, `$1$2?v=${v}$3`);
}

/** The page's own scripts and style sheets. An address with a scheme, a host or a query of its own is left alone. */
export function stampHtml(html, version) {
  const v = checked(version);
  return html.replace(/(\b(?:src|href)=")(?![a-z][a-z0-9+.-]*:|\/)([^"?#]+\.(?:js|css))(")/gi, `$1$2?v=${v}$3`);
}

/** Stamp index.html and the scripts in js/ of the folder; returns the names of the files that changed. */
export function stampFolder(folder, version) {
  const files = [["index.html", stampHtml], ...readdirSync(join(folder, "js")).filter((name) => name.endsWith(".js")).sort().map((name) => [join("js", name), stampScript])];
  const changed = [];
  for (const [name, stamp] of files) {
    const path = join(folder, name);
    const before = readFileSync(path, "utf8");
    const after = stamp(before, version);
    if (after === before) continue;
    writeFileSync(path, after);
    changed.push(name);
  }
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [folder, version] = process.argv.slice(2);
  if (!folder || !version) {
    console.error("Usage: node scripts/stamp.js <folder> <version>");
    process.exit(1);
  }
  try {
    const changed = stampFolder(folder, version);
    console.log(`Version ${version} in ${changed.length} files: ${changed.join(", ")}`);
  } catch (error) {
    console.error(`Stamping failed. ${error.message}`);
    process.exit(1);
  }
}
