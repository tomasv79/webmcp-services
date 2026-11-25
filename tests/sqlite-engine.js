// The engine listing-store.js expects, on Node's built-in SQLite, so the tests run real SQL without the browser build.
// The page's own engine is public/js/sqlite.js. Here a database image is simply the database's file.

import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "webmcp-services-"));
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
let files = 0;

export const sqlite = {
  /** @param {Uint8Array} [image] */
  open(image) {
    files += 1;
    const file = join(directory, `${files}.db`);
    if (image && image.length > 0) writeFileSync(file, image);
    const db = new DatabaseSync(file);
    return {
      exec: (sql, params = []) => void db.prepare(sql).run(...params),
      rows: (sql, params = []) => db.prepare(sql).all(...params).map((row) => ({ ...row })),
      image: () => new Uint8Array(readFileSync(file)),
      close: () => db.close(),
    };
  },
};
