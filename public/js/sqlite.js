// The page's SQLite engine: the official WebAssembly build in vendor/, wrapped into the few calls listing-store.js needs.
// It is about 1.5 MB, so it is loaded on request, after the page is already showing the catalog.

/**
 * Download and start SQLite. Rejects where WebAssembly is switched off or the files cannot be fetched.
 * @returns {Promise<{ open: (image?: Uint8Array) => object }>}  open() gives a Database as listing-store.js describes it.
 */
export async function loadSqlite() {
  const { default: sqlite3InitModule } = await import("../vendor/sqlite3.js");
  const { capi, wasm, oo1 } = await sqlite3InitModule();
  const bound = (params) => (params.length > 0 ? params : undefined);

  return {
    /** An empty in-memory database, or one that starts as a copy of the given SQLite file image. */
    open(image) {
      const db = new oo1.DB(":memory:");
      if (image && image.length > 0) {
        try {
          // SQLite takes over the copy: it frees it when the database closes and may grow it on a write.
          const flags = capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE;
          db.checkRc(capi.sqlite3_deserialize(db.pointer, "main", wasm.allocFromTypedArray(image), image.length, image.length, flags));
        } catch (error) {
          db.close();
          throw error;
        }
      }
      return {
        exec: (sql, params = []) => void db.exec({ sql, bind: bound(params) }),
        rows: (sql, params = []) => db.selectObjects(sql, bound(params)),
        image: () => capi.sqlite3_js_db_export(db.pointer),
        close: () => db.close(),
      };
    },
  };
}
