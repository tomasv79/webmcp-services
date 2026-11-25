// Where the listings a person added are kept: a SQLite database with one table.
// There is no backend, so the database lives in memory and its whole image (the bytes of a normal SQLite file) is
// written to one localStorage value after every change. One value is written in one step, so another tab of the
// site never sees half a change.
// Pure logic: the SQLite engine and the storage are passed in, so the tests run it with Node's own SQLite.
//
// What is stored is the form input, not the listing: see user-listings.js.

export const STORAGE_KEY = "webmcp-services.db";
/** Before SQLite the listings were a JSON list under this key. It is moved into the database once and removed. */
export const LEGACY_KEY = "webmcp-services.listings";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS listings (
    number INTEGER PRIMARY KEY CHECK (number BETWEEN 1 AND 999999999),  -- the 61 of svc-61; an id has up to 9 digits
    added_by TEXT NOT NULL,                                             -- username, or '' where it is not known
    input TEXT NOT NULL CHECK (json_valid(input))                       -- the form input as JSON
  ) STRICT`;

const ID = /^svc-(\d{1,9})$/;
const MAX_NUMBER = 999_999_999;
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const CHUNK = 0x8000;
function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/**
 * @typedef {object} Database  An open in-memory SQLite database.
 * @property {(sql: string, params?: Array<string | number>) => void} exec
 * @property {(sql: string, params?: Array<string | number>) => object[]} rows  One object per row, keyed by column name.
 * @property {() => Uint8Array} image  The database as the bytes of a SQLite file.
 * @property {() => void} close
 *
 * @param {object} options
 * @param {{ open: (image?: Uint8Array) => Database }} options.sqlite  An empty database, or one read from an image.
 *        The page's engine is in sqlite.js.
 * @param {Storage} [options.storage]  Without a working storage the database lasts until the page is reloaded.
 * @returns {{
 *   records: () => Array<{ number: number, addedBy: string, input: unknown }>,
 *   append: (record: { number: number, addedBy: string, input: object }) => boolean,
 * }}
 */
export function createListingStore({ sqlite, storage }) {
  let storageWorks = Boolean(storage);
  let db = null;
  // The stored value the open database was read from or last written as. Another tab has written when it differs.
  let seen = null;

  function stored() {
    if (!storageWorks) return null;
    try {
      return storage.getItem(STORAGE_KEY);
    } catch {
      storageWorks = false;
      return null;
    }
  }

  /** An open database with the table in it, or null when the stored value is not a database this page can use. */
  function openImage(value) {
    let opened = null;
    try {
      opened = sqlite.open(fromBase64(value));
      opened.exec(SCHEMA);
      // A table of the same name with other columns fails here.
      opened.rows("SELECT number, added_by, input FROM listings LIMIT 1");
      return opened;
    } catch {
      opened?.close();
      return null;
    }
  }

  /** Make the open database the stored one: at the start, and again whenever another tab has written. */
  function refresh() {
    const value = stored();
    // A storage that has stopped answering says nothing about other tabs: keep what is open.
    if (db && (value === seen || !storageWorks)) return;
    db?.close();
    seen = value;
    db = value === null ? null : openImage(value);
    // Nothing stored yet, or a damaged value: start empty and let the next write replace it.
    if (!db) {
      db = sqlite.open();
      db.exec(SCHEMA);
    }
  }

  function save() {
    if (!storageWorks) return false;
    try {
      const value = toBase64(db.image());
      storage.setItem(STORAGE_KEY, value);
      seen = value;
      return true;
    } catch {
      // Full or blocked: the stored database stays as it was.
      return false;
    }
  }

  function moveLegacyListings() {
    if (!storageWorks) return;
    try {
      const text = storage.getItem(LEGACY_KEY);
      if (text === null) return;
      let list = [];
      try {
        list = JSON.parse(text);
      } catch {
        // Unreadable: there is nothing to move.
      }
      let moved = 0;
      for (const record of Array.isArray(list) ? list : []) {
        const number = isPlainObject(record) && typeof record.id === "string" ? Number(ID.exec(record.id)?.[1] ?? 0) : 0;
        if (number === 0 || !isPlainObject(record.input)) continue;
        const addedBy = typeof record.addedBy === "string" ? record.addedBy : "";
        db.exec("INSERT OR IGNORE INTO listings (number, added_by, input) VALUES (?, ?, ?)", [number, addedBy, JSON.stringify(record.input)]);
        moved += 1;
      }
      // The old list goes only after the database that holds its listings is stored.
      if (moved === 0 || save()) storage.removeItem(LEGACY_KEY);
    } catch {
      // The old list stays where it is and is tried again on the next page load.
    }
  }

  refresh();
  moveLegacyListings();

  return {
    /** Every stored listing, lowest number first. Read from the storage again when another tab has written. */
    records() {
      refresh();
      const records = [];
      for (const row of db.rows("SELECT number, added_by, input FROM listings ORDER BY number")) {
        // The table is STRICT, but an image made elsewhere may hold a table that is not.
        if (!Number.isInteger(row.number) || row.number < 1 || row.number > MAX_NUMBER) continue;
        if (typeof row.added_by !== "string" || typeof row.input !== "string") continue;
        try {
          records.push({ number: row.number, addedBy: row.added_by, input: JSON.parse(row.input) });
        } catch {
          // Not JSON: left out.
        }
      }
      return records;
    },

    /** Add one listing. True when it reached the storage; false when it is kept for this page only, or not at all. */
    append({ number, addedBy, input }) {
      refresh();
      try {
        db.exec("INSERT INTO listings (number, added_by, input) VALUES (?, ?, ?)", [number, addedBy, JSON.stringify(input)]);
      } catch {
        return false;
      }
      return save();
    },
  };
}
