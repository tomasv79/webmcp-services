// Listings a person added with the form. There is no backend, so they are kept in this browser, in the SQLite
// database of listing-store.js, and appended to the page's catalog, where the list and the WebMCP tools find them
// like any other listing.
// Pure logic: the catalog, the store and the form reader are passed in.
//
// What is stored is the form input, not the listing: reading it again on load runs the same checks as the form,
// so a damaged or hand-edited entry is left out instead of breaking the page.

const ID = /^svc-(\d{1,9})$/;

/**
 * @param {object} options
 * @param {{ listings: object[] }} options.catalog  New listings are pushed to the end of catalog.listings.
 * @param {(input: unknown) => { ok: boolean, listing?: object, input?: object, errors?: object[] }} options.read
 *        The form reader, see createListingReader.
 * @param {{ records: () => Array<{ number: number, addedBy: string, input: unknown }>, append: (record: object) => boolean }} [options.store]
 *        See createListingStore. Without a store a new listing lasts until the page is reloaded.
 * @returns {{
 *   sync: () => object[],
 *   add: (input: unknown, addedBy: string) =>
 *     { ok: true, listing: object, saved: boolean } | { ok: false, errors: Array<{ field: string, message: string }> },
 * }}
 */
export function createUserListings({ catalog, read, store }) {
  // Ids are compared by their number, as the tools do: "svc-00061" and "svc-61" are the same listing.
  const numberOf = (id) => Number(ID.exec(id)?.[1] ?? 0);
  const known = new Set();
  let nextNumber = 1;
  const remember = (number) => {
    known.add(number);
    nextNumber = Math.max(nextNumber, number + 1);
  };
  for (const listing of catalog.listings) remember(numberOf(listing.id));

  function append(number, addedBy, listing) {
    const added = { ...listing, id: `svc-${number}`, addedBy };
    catalog.listings.push(added);
    return added;
  }

  /**
   * Append every stored listing the catalog does not have yet: the saved ones at page load, and later the ones
   * added in another tab. Returns the listings that were appended.
   */
  function sync() {
    const appended = [];
    for (const record of store?.records() ?? []) {
      if (known.has(record.number)) continue;
      // A stored listing that no longer passes the checks is left out, but its number stays taken.
      remember(record.number);
      const result = read(record.input);
      if (result.ok) appended.push(append(record.number, record.addedBy, result.listing));
    }
    return appended;
  }

  /** Check the form input and, when it is valid, add the listing under the next free id. */
  function add(input, addedBy) {
    const result = read(input);
    if (!result.ok) return { ok: false, errors: result.errors };
    // Another tab may have added listings since the last look; take them first so the id is not used twice.
    sync();
    const record = { number: nextNumber, addedBy: String(addedBy ?? ""), input: result.input };
    remember(record.number);
    const listing = append(record.number, record.addedBy, result.listing);
    return { ok: true, listing, saved: store?.append(record) ?? false };
  }

  return { sync, add };
}
