// A directory without a database, for the tests: the same answers as createDirectory in public/js/directory.js,
// worked out by the reference search over a list of listings in memory.

import { searchServices } from "./reference-search.js";
import { notesFor } from "../../catalog/notes.js";

/**
 * @param {object} catalog  The vocabulary plus `listings`; a listing pushed to catalog.listings is found at once.
 * @returns {{ search: Function, get: Function, counts: Function, notes: Function }}
 */
export function createMemoryDirectory(catalog) {
  const countOf = (keys) => {
    const counts = {};
    for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  };
  return {
    async search(filters, now) {
      const result = searchServices(catalog, filters, now);
      return { ...result, all: catalog.listings.length, items: result.items.map(({ listing, availability, score }) => ({ listing, availability, score })) };
    },
    async get(number) {
      return catalog.listings.find((listing) => Number(listing.id.slice(4)) === number) ?? null;
    },
    /** A listing of the catalog has notes; one that a visitor added has none. */
    async notes(number) {
      const listing = catalog.listings.find((each) => Number(each.id.slice(4)) === number);
      return listing && listing.added !== true ? notesFor(listing) : null;
    },
    async counts() {
      const { listings } = catalog;
      return {
        total: listings.length,
        categories: countOf(listings.map((l) => l.category)),
        cities: countOf(listings.map((l) => l.location.city)),
        priceUnits: countOf(listings.map((l) => l.price.unit)),
        languages: countOf(listings.flatMap((l) => l.languages)),
      };
    },
  };
}
