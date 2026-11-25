// The three WebMCP tools. Pure logic: the page effects (showFilters, showListing) and the clock are passed in,
// so everything here runs in Node tests without a browser.
//
// A tool never throws: the WebMCP polyfill would turn a thrown error into a bare "OperationError" with no message.
// Wrong input is answered with { error: { field, message, validValues? } } so the agent can correct itself.

import { normalize } from "./text.js";
import { computeAvailability, TIME_ZONE } from "./availability.js";
import { searchServices, SORT_OPTIONS } from "./search.js";

export const LIMIT_DEFAULT = 10;
export const LIMIT_MAX = 20;
const QUERY_MAX_LENGTH = 200;
// Lead times go up to 60 days and the next working day can be up to 6 days later, so 90 reaches every listing.
const WITHIN_DAYS_MAX = 90;

const ENVELOPE = { notice: "Fictional demo data", currency: "EUR", timeZone: TIME_ZONE };
const answer = (body) => ({ ...ENVELOPE, ...body });
const failure = (field, message, validValues) =>
  answer({ error: validValues ? { field, message, validValues } : { field, message } });

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const given = (value) => value !== undefined && value !== null;

class InputError extends Error {
  constructor(field, message, validValues) {
    super(message);
    this.field = field;
    this.validValues = validValues;
  }
}

/** Valid values of every enumerated filter, with a lookup that ignores case and diacritics. */
function buildVocabulary(catalog) {
  const lookup = (pairs) => new Map(pairs.map(([key, value]) => [normalize(key).trim(), value]));
  const cities = [...new Set(catalog.listings.map((listing) => listing.location.city))];
  const aliases = catalog.cityAliases ?? {};
  return {
    category: {
      values: catalog.categories.map((c) => c.id),
      find: lookup(catalog.categories.map((c) => [c.id, c.id])),
    },
    country: {
      values: catalog.countries.map((c) => c.code),
      find: lookup(catalog.countries.flatMap((c) => [[c.code, c.code], [c.nameLt, c.code], [c.nameEn, c.code]])),
    },
    city: {
      values: cities,
      find: lookup(cities.flatMap((city) => [[city, city], ...(aliases[city] ?? []).map((alias) => [alias, city])])),
    },
    language: { values: [...catalog.LANGUAGES], find: lookup(catalog.LANGUAGES.map((code) => [code, code])) },
    priceUnit: { values: [...catalog.PRICE_UNITS], find: lookup(catalog.PRICE_UNITS.map((unit) => [unit, unit])) },
    sortBy: { values: [...SORT_OPTIONS], find: lookup(SORT_OPTIONS.map((sort) => [sort, sort])) },
  };
}

function readSearchInput(input, vocabulary) {
  const args = isPlainObject(input) ? input : {};
  const filters = {};

  if (given(args.query)) {
    if (typeof args.query !== "string") throw new InputError("query", "query must be a string.");
    const query = args.query.trim().slice(0, QUERY_MAX_LENGTH);
    if (query) filters.query = query;
  }

  for (const field of ["category", "country", "city", "language", "priceUnit", "sortBy"]) {
    if (!given(args[field])) continue;
    const { values, find } = vocabulary[field];
    const value = typeof args[field] === "string" ? find.get(normalize(args[field]).trim()) : undefined;
    if (value === undefined) throw new InputError(field, `${field} must be one of the valid values.`, values);
    filters[field] = value;
  }

  if (given(args.priceMax)) {
    if (typeof args.priceMax !== "number" || !Number.isFinite(args.priceMax) || args.priceMax <= 0) {
      throw new InputError("priceMax", "priceMax must be a number greater than 0 (EUR).");
    }
    filters.priceMax = args.priceMax;
  }

  if (given(args.minRating)) {
    if (typeof args.minRating !== "number" || !(args.minRating >= 1 && args.minRating <= 5)) {
      throw new InputError("minRating", "minRating must be a number from 1 to 5.");
    }
    filters.minRating = args.minRating;
  }

  if (given(args.availableWithinDays)) {
    const days = args.availableWithinDays;
    if (!Number.isInteger(days) || days < 0 || days > WITHIN_DAYS_MAX) {
      throw new InputError("availableWithinDays", `availableWithinDays must be a whole number from 0 to ${WITHIN_DAYS_MAX}; 0 means today.`);
    }
    filters.availableWithinDays = days;
  }

  for (const field of ["travelsToClient", "openNow"]) {
    if (!given(args[field])) continue;
    if (typeof args[field] !== "boolean") throw new InputError(field, `${field} must be true or false (a boolean, not a string).`);
    filters[field] = args[field];
  }

  let limit = LIMIT_DEFAULT;
  if (given(args.limit)) {
    if (!Number.isInteger(args.limit)) throw new InputError("limit", `limit must be a whole number from 1 to ${LIMIT_MAX}.`);
    limit = Math.min(LIMIT_MAX, Math.max(1, args.limit));
  }
  let offset = 0;
  if (given(args.offset)) {
    if (!Number.isInteger(args.offset)) throw new InputError("offset", "offset must be a whole number, 0 or more.");
    offset = Math.max(0, args.offset);
  }

  return { filters, limit, offset };
}

const price = (p) => ({ from: p.from, to: p.to ?? null, unit: p.unit, negotiable: p.negotiable, calloutFee: p.calloutFee ?? null });

const summary = ({ listing, availability }) => ({
  id: listing.id,
  title: listing.title,
  titleEn: listing.titleEn,
  category: listing.category,
  provider: { name: listing.provider.name, type: listing.provider.type, verified: listing.provider.verified },
  location: { country: listing.location.country, city: listing.location.city, address: listing.location.address },
  price: price(listing.price),
  rating: { ...listing.rating },
  contact: { phone: listing.contact.phone, email: listing.contact.email },
  availability: {
    openNow: availability.openNow,
    todayHours: availability.todayHours,
    nextFreeDate: availability.nextFreeDate,
    emergency: availability.emergency,
  },
  descriptionEn: listing.descriptionEn,
});

function fullRecord(listing, category, now) {
  const copy = structuredClone(listing);
  const computed = computeAvailability(listing.availability, now);
  return {
    id: copy.id,
    category: copy.category,
    categoryName: { lt: category?.nameLt ?? null, en: category?.nameEn ?? null },
    title: copy.title,
    titleEn: copy.titleEn,
    description: copy.description,
    descriptionEn: copy.descriptionEn,
    tags: copy.tags,
    provider: copy.provider,
    contact: { phone: copy.contact.phone, email: copy.contact.email, website: copy.contact.website ?? null },
    location: copy.location,
    serviceArea: copy.serviceArea,
    price: price(copy.price),
    rating: copy.rating,
    languages: copy.languages,
    availability: {
      hours: copy.availability.hours,
      leadTimeDays: copy.availability.leadTimeDays,
      emergency: copy.availability.emergency,
      openNow: computed.openNow,
      todayHours: computed.todayHours,
      nextFreeDate: computed.nextFreeDate,
    },
  };
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) for (const k of [key(item)].flat()) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}

function filterOptions(catalog) {
  const { listings } = catalog;
  const perCategory = countBy(listings, (l) => l.category);
  const perUnit = countBy(listings, (l) => l.price.unit);
  const perLanguage = countBy(listings, (l) => l.languages);
  const aliases = catalog.cityAliases ?? {};
  return {
    totalListings: listings.length,
    categories: catalog.categories.map((c) => ({ id: c.id, nameLt: c.nameLt, nameEn: c.nameEn, count: perCategory.get(c.id) ?? 0 })),
    countries: catalog.countries.map((country) => {
      const own = listings.filter((l) => l.location.country === country.code);
      const perCity = countBy(own, (l) => l.location.city);
      return {
        code: country.code,
        nameLt: country.nameLt,
        nameEn: country.nameEn,
        count: own.length,
        cities: [...perCity]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "lt"))
          .map(([name, count]) => ({ name, count, alsoAccepted: [...(aliases[name] ?? [])] })),
      };
    }),
    priceUnits: catalog.PRICE_UNITS.map((unit) => ({ unit, count: perUnit.get(unit) ?? 0 })),
    languages: catalog.LANGUAGES.map((code) => ({ code, count: perLanguage.get(code) ?? 0 })),
    sortOptions: [...SORT_OPTIONS],
    limit: { default: LIMIT_DEFAULT, max: LIMIT_MAX },
  };
}

/** Run a page effect without letting a display problem fail the tool answer. */
function quietly(effect, ...args) {
  try {
    effect?.(...args);
  } catch (error) {
    console.warn("Could not update the page after a tool call:", error);
  }
}

/** Wrap a tool body so that nothing it does can throw out of execute(). */
const safely = (body) => (input) => {
  try {
    return body(input);
  } catch (error) {
    if (error instanceof InputError) return failure(error.field, error.message, error.validValues);
    console.warn("Tool failed:", error);
    return failure(null, "The tool failed unexpectedly. Try again.");
  }
};

const SEARCH_DESCRIPTION = `Search a directory of service providers in Lithuania, Latvia and Estonia: plumbers, electricians, renovation, cleaning, movers, car repair, appliance repair, gardening, beauty, tutors, IT support and photographers. All data is fictional demo data.

All inputs are optional and combine with AND. "query" is free text in Lithuanian or English; case, accents and word endings are ignored. Call list_service_filters to get the valid values of category, country, city, language, priceUnit and sortBy.

Prices are in EUR and are the advertised starting price. Call-out fees are returned separately and are not included in price comparisons. priceMax and the price sorts compare starting prices, so pass priceUnit to compare like with like.

openNow means the provider is inside working hours right now (Europe/Vilnius time) and can be phoned; it says nothing about free capacity. availableWithinDays is about when work can start: 0 means today.

Returns { notice, currency, timeZone, total, returned, offset, appliedFilters, warnings, results }. Each result has id, title, titleEn, category, provider, location (country, city, address), price (from, to, unit, negotiable, calloutFee), rating, contact (phone, email), availability (openNow, todayHours, nextFreeDate, emergency) and descriptionEn. "total" counts all matches; page with limit and offset. Use get_service with an id for the full record. A listing that a visitor added with the form on the page has no reviews yet: its rating is { average: 0, count: 0 }, minRating leaves it out, and its titleEn and descriptionEn repeat the text as it was typed. Invalid input returns { error: { field, message, validValues } } instead of results. The list shown on the page is filtered the same way and opens at the page that holds the returned results.`;

const GET_DESCRIPTION = `Get the full record of one service listing by id (for example "svc-001"; ids come from search_services). All data is fictional demo data.

Returns { notice, currency, timeZone, service }. "service" has the Lithuanian and English title and description, tags, provider (name, type, yearsExperience, verified), contact (phone, email, website), location (country, city, address, postalCode), serviceArea (travelsToClient, radiusKm, remote), price in EUR (from, to, unit, negotiable, calloutFee), rating, languages, and availability: weekly working hours per weekday, leadTimeDays, emergency, plus openNow, todayHours and nextFreeDate computed for the current Europe/Vilnius time. An unknown id returns { error: { field, message } }. The page shows the listing highlighted above its list.`;

const FILTERS_DESCRIPTION = `List the valid filter values for search_services, with the number of listings for each: categories (id, Lithuanian name, English name), countries with their cities and accepted alternative city spellings, price units, languages, sort options and the paging limits. Takes no input. All data is fictional demo data.`;

/**
 * @param {object} deps
 * @param {object} deps.catalog       The data module: listings, categories, countries, cityAliases, PRICE_UNITS, LANGUAGES.
 * @param {() => Date} deps.now       Read at every call, so "open now" is never stale.
 * @param {(filters: object, view: { offset: number }) => void} [deps.showFilters]
 *        Show these filters and their result in the page list; view.offset is where the agent's slice starts.
 * @param {(id: string) => void} [deps.showListing]       Show a listing highlighted above the list.
 * @returns {Array<{ name: string, description: string, inputSchema: object, annotations: object, execute: (input: unknown) => object }>}
 */
export function createTools({ catalog, now, showFilters, showListing }) {
  const vocabulary = buildVocabulary(catalog);
  const categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
  // Ids are "svc-" plus a number; hand-written ones are padded to 3 digits and generated ones to 5.
  // Look listings up by the number, so "svc-1", "svc-001" and "svc-00001" all find the same listing.
  // The page adds new listings to the end of catalog.listings, so the lookup takes in the new ones before it answers.
  const listingByNumber = new Map();
  let indexed = 0;
  const findListing = (number) => {
    for (; indexed < catalog.listings.length; indexed += 1) {
      const listing = catalog.listings[indexed];
      listingByNumber.set(Number(listing.id.slice(4)), listing);
    }
    return listingByNumber.get(number);
  };
  const annotations = { readOnlyHint: true };

  return [
    {
      name: "search_services",
      description: SEARCH_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: 'Free text, Lithuanian or English, e.g. "santechnikas" or "plumber Vilnius".' },
          category: { type: "string", enum: vocabulary.category.values, description: "Category id." },
          country: { type: "string", enum: vocabulary.country.values, description: "Country code: LT, LV or EE." },
          city: { type: "string", description: `City name, e.g. ${vocabulary.city.values.slice(0, 4).join(", ")}. Accents are optional.` },
          priceMax: { type: "number", exclusiveMinimum: 0, description: "Highest starting price in EUR." },
          priceUnit: { type: "string", enum: vocabulary.priceUnit.values, description: "What the price is charged per." },
          minRating: { type: "number", minimum: 1, maximum: 5, description: "Lowest average rating." },
          language: { type: "string", enum: vocabulary.language.values, description: "A language the provider speaks." },
          travelsToClient: { type: "boolean", description: "true: only providers who come to the client. false: only those who do not." },
          openNow: { type: "boolean", description: "true: only providers inside working hours right now." },
          availableWithinDays: { type: "integer", minimum: 0, maximum: WITHIN_DAYS_MAX, description: "Work can start within this many days. 0 means today." },
          sortBy: { type: "string", enum: vocabulary.sortBy.values, description: "Default: relevance with a query, otherwise rating." },
          limit: { type: "integer", minimum: 1, maximum: LIMIT_MAX, description: `Results per call. Default ${LIMIT_DEFAULT}.` },
          offset: { type: "integer", minimum: 0, description: "Results to skip. Default 0." },
        },
      },
      annotations,
      execute: safely((input) => {
        const { filters, limit, offset } = readSearchInput(input, vocabulary);
        const result = searchServices(catalog, { ...filters, limit, offset }, now());
        quietly(showFilters, { ...filters }, { offset: result.offset });
        return answer({
          total: result.total,
          returned: result.items.length,
          offset: result.offset,
          appliedFilters: { ...filters, sortBy: result.sortBy, limit, offset },
          warnings: result.warnings,
          results: result.items.map(summary),
        });
      }),
    },
    {
      name: "get_service",
      description: GET_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: 'Listing id from search_services, e.g. "svc-001".' } },
        required: ["id"],
      },
      annotations,
      execute: safely((input) => {
        const args = isPlainObject(input) ? input : {};
        if (typeof args.id !== "string" || !args.id.trim()) {
          throw new InputError("id", 'id is required and must be a string such as "svc-001".');
        }
        const idNumber = /^svc-(\d{1,9})$/i.exec(args.id.trim())?.[1];
        const listing = idNumber === undefined ? undefined : findListing(Number(idNumber));
        if (!listing) {
          throw new InputError("id", `No listing has the id "${args.id.trim().slice(0, 40)}". Use search_services to find ids.`);
        }
        const service = fullRecord(listing, categoryById.get(listing.category), now());
        quietly(showListing, listing.id);
        return answer({ service });
      }),
    },
    {
      name: "list_service_filters",
      description: FILTERS_DESCRIPTION,
      inputSchema: { type: "object", properties: {} },
      annotations,
      execute: safely(() => answer(filterOptions(catalog))),
    },
  ];
}
