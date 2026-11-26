// The directory: the listings in the Supabase database. One search for the page and for the WebMCP tools, so the
// list on screen and a tool answer cannot disagree.
// Pure logic: the Supabase client and the session are passed in, and the caller passes the current time.
//
// The database filters, ranks and pages (search_listings in supabase/migrations). What stays here is everything
// that needs the page's own text rules: the words of a query, and the search words of a new listing.

import { normalize, wordIndex, queryTokens, stem } from "./text.js";
import { computeAvailability, vilniusNow } from "./availability.js";
import { createListingReader, inputOfListing } from "./listing-input.js";

export const SORT_OPTIONS = ["relevance", "rating", "price_asc", "price_desc", "soonest"];

const MIXED_UNITS_WARNING =
  "Prices were compared across different units (per hour, job, m2, visit or day). Pass priceUnit to compare like with like.";

const ID = /^svc-(\d{1,9})$/;
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/** The database could not be reached, or it refused the request. */
export class DirectoryError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "DirectoryError";
    this.status = status;
  }
}

/** The sort a search with these filters uses: "relevance" needs search words, and without them it is "rating". */
export function sortFor(filters) {
  const hasQuery = queryTokens(filters?.query).length > 0;
  const sortBy = SORT_OPTIONS.includes(filters?.sortBy) ? filters.sortBy : hasQuery ? "relevance" : "rating";
  return sortBy === "relevance" && !hasQuery ? "rating" : sortBy;
}

/**
 * The words a listing is found by, as the database stores them next to it: " word1 word2 ...".
 * A match in `strong` (title and category) counts double.
 * @param {object} listing
 * @param {{ categories: object[], countries: object[], cityAliases?: Record<string, string[]> }} catalog
 * @returns {{ strong: string, weak: string }}
 */
export function searchWords(listing, catalog) {
  const category = catalog.categories.find((entry) => entry.id === listing.category);
  const country = catalog.countries.find((entry) => entry.code === listing.location.country);
  const cityNames = [listing.location.city, ...(catalog.cityAliases?.[listing.location.city] ?? [])];
  return {
    strong: wordIndex([listing.title, listing.titleEn, category?.nameLt, category?.nameEn].join(" ")),
    weak: wordIndex(
      [
        listing.description, listing.descriptionEn, listing.provider.name, listing.tags.join(" "),
        cityNames.join(" "), country?.nameLt, country?.nameEn,
      ].join(" "),
    ),
  };
}

/**
 * @param {object} options
 * @param {object} options.client  The Supabase client, see createSupabase in supabase.js.
 * @param {object} options.catalog  The vocabulary: categories, countries, cities, cityAliases, PRICE_UNITS, LANGUAGES, WEEKDAYS.
 * @param {() => Promise<string | null>} [options.token]  The signed-in person's token, see createAuth. Needed by add() only.
 * @returns {{
 *   search: (filters: object | undefined, now: Date) => Promise<{ total: number, all: number, offset: number, sortBy: string, items: Array<{ listing: object, availability: object, score: number }>, warnings: string[] }>,
 *   get: (number: number) => Promise<object | null>,
 *   counts: () => Promise<{ total: number, categories: object, cities: object, priceUnits: object, languages: object }>,
 *   add: (listing: object) => Promise<{ ok: true, listing: object } | { ok: false, reason: "signedOut" | "limit" | "refused" | "unavailable" }>,
 * }}
 *   search, get and counts reject with a DirectoryError when the database cannot be reached.
 */
export function createDirectory({ client, catalog, token }) {
  const read = createListingReader(catalog);
  // A city is found by its name and by its other spellings, with or without diacritics.
  const cityByKey = new Map(
    catalog.cities.flatMap(({ name }) => [name, ...(catalog.cityAliases?.[name] ?? [])].map((spelling) => [normalize(spelling), name])),
  );

  function unwrap(answer) {
    if (answer.ok) return answer.data;
    throw new DirectoryError(answer.data?.message ?? "The directory database could not be reached.", answer.status);
  }

  /**
   * A row of the database as a listing of the page. A listing of the catalog is taken as it is. One that a visitor
   * added goes through the checks of the form again, so a row that was written past the form is left out instead of
   * breaking the page.
   */
  function listingOf(row) {
    const data = row?.data;
    if (!isPlainObject(data) || typeof data.id !== "string" || !ID.test(data.id)) return null;
    if (row.added !== true) return data;
    try {
      const result = read(inputOfListing(data));
      return result.ok ? { ...result.listing, id: data.id, added: true } : null;
    } catch {
      return null;
    }
  }

  return {
    /**
     * @param {object} [filters]  query, category, country, city, priceMax, priceUnit, minRating, language,
     *                            travelsToClient, openNow, availableWithinDays, sortBy, limit, offset. All optional.
     * @param {Date} now
     *        `total` counts every match and `all` every listing. `sortBy` is the sort that was actually used.
     */
    async search(filters, now) {
      const f = filters ?? {};
      const sortBy = sortFor(f);
      const offset = Number.isInteger(f.offset) && f.offset > 0 ? f.offset : 0;
      const result = unwrap(
        await client.rpc("search_listings", {
          p_stems: queryTokens(f.query).map(stem),
          p_category: f.category,
          p_country: f.country === undefined ? undefined : String(f.country).toUpperCase(),
          // A city the directory does not have matches nothing.
          p_city: f.city === undefined ? undefined : cityByKey.get(normalize(f.city)) ?? String(f.city),
          p_price_max: f.priceMax,
          p_price_unit: f.priceUnit,
          p_min_rating: f.minRating,
          p_language: f.language === undefined ? undefined : normalize(f.language),
          p_travels: typeof f.travelsToClient === "boolean" ? f.travelsToClient : undefined,
          p_open_now: f.openNow === true,
          p_within_days: f.availableWithinDays,
          p_sort: sortBy,
          p_limit: Number.isInteger(f.limit) ? Math.max(0, f.limit) : undefined,
          p_offset: offset,
          // The database reads "open now" off the same moment as the availability worked out below.
          p_now: now.toISOString(),
        }),
      );
      if (!isPlainObject(result) || !Array.isArray(result.items)) throw new DirectoryError("The directory database gave an answer this page cannot read.");

      const clock = vilniusNow(now);
      const items = [];
      for (const row of result.items) {
        const listing = listingOf(row);
        if (listing) items.push({ listing, availability: computeAvailability(listing.availability, clock), score: Number(row.score) || 0 });
      }
      const comparesPrices = f.priceMax !== undefined || sortBy === "price_asc" || sortBy === "price_desc";
      const warnings = comparesPrices && f.priceUnit === undefined && result.mixedUnits === true ? [MIXED_UNITS_WARNING] : [];
      return { total: Number(result.total) || 0, all: Number(result.all) || 0, offset, sortBy, items, warnings };
    },

    /** The listing with this number (the 61 of "svc-00061"), or null when there is none. */
    async get(number) {
      if (!Number.isInteger(number) || number < 1) return null;
      const rows = unwrap(await client.select("listings", { select: "data,added", number: `eq.${number}` }));
      return Array.isArray(rows) && rows.length > 0 ? listingOf(rows[0]) : null;
    },

    /** How many listings there are, and how many each category, city, price unit and language has. */
    async counts() {
      const counts = unwrap(await client.rpc("listing_counts"));
      const table = (value) => (isPlainObject(value) ? value : {});
      return {
        total: Number(counts?.total) || 0,
        categories: table(counts?.categories),
        cities: table(counts?.cities),
        priceUnits: table(counts?.priceUnits),
        languages: table(counts?.languages),
      };
    },

    /**
     * Save a listing the form reader returned, as the signed-in person. The database gives it its id.
     * Never rejects: `reason` says why it was not saved.
     */
    async add(listing) {
      const accessToken = await token?.();
      if (!accessToken) return { ok: false, reason: "signedOut" };
      const answer = await client.insert("listings", { data: listing, ...searchWords(listing, catalog) }, { token: accessToken, select: "data,added" });
      if (answer.ok) {
        const saved = listingOf(Array.isArray(answer.data) ? answer.data[0] : answer.data);
        return saved ? { ok: true, listing: saved } : { ok: false, reason: "unavailable" };
      }
      if (answer.status === 401) return { ok: false, reason: "signedOut" };
      // Raised by the database when one person has added too many.
      if (answer.data?.code === "P0001") return { ok: false, reason: "limit" };
      if (answer.status === 0 || answer.status >= 500 || answer.status === 429) return { ok: false, reason: "unavailable" };
      return { ok: false, reason: "refused" };
    },
  };
}
