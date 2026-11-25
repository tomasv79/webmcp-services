// One search function for the page and for the WebMCP tools, so the list on screen and a tool answer cannot disagree.
// Pure: no DOM, no clock of its own. The caller passes the current time.

import { normalize, wordIndex, queryTokens, hasWordStartingWith } from "./text.js";
import { computeAvailability, vilniusNow } from "./availability.js";

export const SORT_OPTIONS = ["relevance", "rating", "price_asc", "price_desc", "soonest"];

const MIXED_UNITS_WARNING =
  "Prices were compared across different units (per hour, job, m2, visit or day). Pass priceUnit to compare like with like.";

// Search words per listing, built once per catalog.
const indexes = new WeakMap();

function indexOf(catalog) {
  let index = indexes.get(catalog);
  if (index) return index;

  const categoryById = new Map((catalog.categories ?? []).map((category) => [category.id, category]));
  const countryByCode = new Map((catalog.countries ?? []).map((country) => [country.code, country]));
  const aliases = catalog.cityAliases ?? {};

  // Names a city can be found by: shared by all listings of that city.
  const cities = new Map();
  const cityOf = (name) => {
    if (!cities.has(name)) {
      const names = [name, ...(aliases[name] ?? [])];
      cities.set(name, { text: names.join(" "), keys: new Set(names.map(normalize)) });
    }
    return cities.get(name);
  };

  index = catalog.listings.map((listing) => {
    const category = categoryById.get(listing.category);
    const country = countryByCode.get(listing.location.country);
    const city = cityOf(listing.location.city);
    return {
      listing,
      // The number in the id ("svc-001" -> 1, "svc-00061" -> 61): the last tie-breaker of every sort.
      order: Number(listing.id.slice(4)) || 0,
      // Title and category matches count double.
      strong: wordIndex([listing.title, listing.titleEn, category?.nameLt, category?.nameEn].join(" ")),
      weak: wordIndex(
        [
          listing.description, listing.descriptionEn, listing.provider.name, listing.tags.join(" "),
          city.text, country?.nameLt, country?.nameEn,
        ].join(" "),
      ),
      cityKeys: city.keys,
    };
  });
  indexes.set(catalog, index);
  return index;
}

function score(entry, tokens) {
  let total = 0;
  for (const token of tokens) {
    if (hasWordStartingWith(entry.strong, token)) total += 2;
    else if (hasWordStartingWith(entry.weak, token)) total += 1;
  }
  return total;
}

const byRating = (a, b) =>
  b.listing.rating.average - a.listing.rating.average || b.listing.rating.count - a.listing.rating.count;
const byId = (a, b) => a.order - b.order || (a.listing.id < b.listing.id ? -1 : a.listing.id > b.listing.id ? 1 : 0);

const SORTERS = {
  relevance: (a, b) => b.score - a.score || byRating(a, b),
  rating: byRating,
  price_asc: (a, b) => a.listing.price.from - b.listing.price.from,
  price_desc: (a, b) => b.listing.price.from - a.listing.price.from,
  soonest: (a, b) =>
    a.availability.daysUntilFree - b.availability.daysUntilFree ||
    Number(b.availability.openNow) - Number(a.availability.openNow) ||
    byRating(a, b),
};

/**
 * @param {{ listings: object[], categories?: object[], countries?: object[], cityAliases?: Record<string, string[]> }} catalog
 * @param {object} [filters]  query, category, country, city, priceMax, priceUnit, minRating, language,
 *                            travelsToClient, openNow, availableWithinDays, sortBy, limit, offset. All optional.
 * @param {Date} now
 * @returns {{ total: number, offset: number, sortBy: string, items: Array<{ listing: object, availability: object, score: number }>, warnings: string[] }}
 *          sortBy is the sort that was actually used.
 */
export function searchServices(catalog, filters, now) {
  const f = filters ?? {};
  const clock = vilniusNow(now);
  const tokens = queryTokens(f.query);
  const hasQuery = tokens.length > 0;
  const cityKey = f.city === undefined ? undefined : normalize(f.city);
  const language = f.language === undefined ? undefined : normalize(f.language);
  const country = f.country === undefined ? undefined : String(f.country).toUpperCase();

  let sortBy = SORT_OPTIONS.includes(f.sortBy) ? f.sortBy : hasQuery ? "relevance" : "rating";
  if (sortBy === "relevance" && !hasQuery) sortBy = "rating";

  // Availability costs a little per listing, so it is worked out only where a filter or the sort needs it,
  // and otherwise just for the listings that are returned.
  const filtersOnAvailability = f.openNow === true || f.availableWithinDays !== undefined;
  const needsAvailability = filtersOnAvailability || sortBy === "soonest";

  const matched = [];
  for (const entry of indexOf(catalog)) {
    const { listing } = entry;
    if (f.category !== undefined && listing.category !== f.category) continue;
    if (country !== undefined && listing.location.country !== country) continue;
    if (cityKey !== undefined && !entry.cityKeys.has(cityKey)) continue;
    if (f.priceUnit !== undefined && listing.price.unit !== f.priceUnit) continue;
    if (f.priceMax !== undefined && listing.price.from > f.priceMax) continue;
    if (f.minRating !== undefined && listing.rating.average < f.minRating) continue;
    if (language !== undefined && !listing.languages.includes(language)) continue;
    if (typeof f.travelsToClient === "boolean" && listing.serviceArea.travelsToClient !== f.travelsToClient) continue;

    const relevance = hasQuery ? score(entry, tokens) : 0;
    if (hasQuery && relevance === 0) continue;

    let availability;
    if (needsAvailability) {
      availability = computeAvailability(listing.availability, clock);
      if (f.openNow === true && !availability.openNow) continue;
      if (f.availableWithinDays !== undefined && availability.daysUntilFree > f.availableWithinDays) continue;
    }

    matched.push({ listing, availability, score: relevance, order: entry.order });
  }

  const sorter = SORTERS[sortBy];
  matched.sort((a, b) => sorter(a, b) || byId(a, b));

  const warnings = [];
  const comparesPrices = f.priceMax !== undefined || sortBy === "price_asc" || sortBy === "price_desc";
  if (comparesPrices && f.priceUnit === undefined && new Set(matched.map((m) => m.listing.price.unit)).size > 1) {
    warnings.push(MIXED_UNITS_WARNING);
  }

  const offset = Number.isInteger(f.offset) && f.offset > 0 ? f.offset : 0;
  const end = Number.isInteger(f.limit) ? offset + Math.max(0, f.limit) : undefined;
  const items = matched.slice(offset, end);
  if (!needsAvailability) {
    for (const item of items) item.availability = computeAvailability(item.listing.availability, clock);
  }
  return { total: matched.length, offset, sortBy, items, warnings };
}
