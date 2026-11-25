// Listings a person added with the form. There is no backend, so they are kept in this browser's localStorage
// and appended to the page's catalog, where the list and the WebMCP tools find them like any other listing.
// Pure logic: the catalog, the storage and the form reader are passed in.
//
// What is stored is the form input, not the listing: reading it again on load runs the same checks as the form,
// so a damaged or hand-edited entry is left out instead of breaking the page.

export const STORAGE_KEY = "webmcp-services.listings";

const ID = /^svc-(\d{1,9})$/;
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {object} options
 * @param {{ listings: object[] }} options.catalog  New listings are pushed to the end of catalog.listings.
 * @param {(input: unknown) => { ok: boolean, listing?: object, input?: object, errors?: object[] }} options.read
 *        The form reader, see createListingReader.
 * @param {Storage} [options.storage]  Without a working storage a new listing lasts until the page is reloaded.
 * @returns {{
 *   sync: () => object[],
 *   add: (input: unknown, addedBy: string) =>
 *     { ok: true, listing: object, saved: boolean } | { ok: false, errors: Array<{ field: string, message: string }> },
 * }}
 */
export function createUserListings({ catalog, read, storage }) {
  // Ids are compared by their number, as the tools do: "svc-00061" and "svc-61" are the same listing.
  const numberOf = (id) => Number(ID.exec(id)?.[1] ?? 0);
  const known = new Set();
  let nextNumber = 1;
  const remember = (id) => {
    known.add(numberOf(id));
    nextNumber = Math.max(nextNumber, numberOf(id) + 1);
  };
  for (const listing of catalog.listings) remember(listing.id);

  let storageWorks = Boolean(storage);

  function stored() {
    if (!storageWorks) return [];
    try {
      const records = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
      return Array.isArray(records) ? records.filter(isPlainObject) : [];
    } catch (error) {
      // Unreadable JSON is a damaged entry, not a broken storage: carry on and let the next write replace it.
      if (!(error instanceof SyntaxError)) storageWorks = false;
      return [];
    }
  }

  function write(records) {
    if (!storageWorks) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch {
      return false;
    }
  }

  function append(record, listing) {
    const added = { ...listing, id: record.id, addedBy: record.addedBy };
    catalog.listings.push(added);
    remember(record.id);
    return added;
  }

  /**
   * Append every stored listing the catalog does not have yet: the saved ones at page load, and later the ones
   * added in another tab. Returns the listings that were appended.
   */
  function sync() {
    const appended = [];
    for (const record of stored()) {
      if (typeof record.id !== "string" || !ID.test(record.id) || known.has(numberOf(record.id))) continue;
      const result = read(record.input);
      if (!result.ok) continue;
      appended.push(append({ id: record.id, addedBy: typeof record.addedBy === "string" ? record.addedBy : "" }, result.listing));
    }
    return appended;
  }

  /** Check the form input and, when it is valid, add the listing under the next free id. */
  function add(input, addedBy) {
    const result = read(input);
    if (!result.ok) return { ok: false, errors: result.errors };
    // Another tab may have added listings since the last look; take them first so the id is not used twice.
    sync();
    const record = { id: `svc-${nextNumber}`, addedBy: String(addedBy ?? ""), input: result.input };
    const listing = append(record, result.listing);
    return { ok: true, listing, saved: write([...stored(), record]) };
  }

  return { sync, add };
}
