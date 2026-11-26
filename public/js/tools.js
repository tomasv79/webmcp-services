// The WebMCP tools: three that read the directory and one that fills in the new-service form.
// Pure logic: the directory (the listings in the database), the page effects (showFilters, showListing, showDraft)
// and the clock are passed in, so everything here runs in Node tests without a browser or a network.
//
// A tool never throws: the WebMCP polyfill would turn a thrown error into a bare "OperationError" with no message.
// Wrong input is answered with { error: { field, message, validValues? } } so the agent can correct itself.

import { normalize } from "./text.js";
import { computeAvailability, TIME_ZONE } from "./availability.js";
import { createListingReader, inputOfListing, INPUT_FIELDS, LIMITS, POSTAL, PROVIDER_TYPES } from "./listing-input.js";
import { DirectoryError, SORT_OPTIONS } from "./directory.js";

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
  const cities = catalog.cities.map((city) => city.name);
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
    providerType: { values: [...PROVIDER_TYPES], find: lookup(PROVIDER_TYPES.map((type) => [type, type])) },
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

// ── draft_service: the agent's values for the new-service form ────────────

const DRAFT_BOOLEANS = ["travelsToClient", "remote", "negotiable", "emergency"];
const range = ([min, max]) => `${min} to ${max}`;

// The form reader explains a wrong field in Lithuanian, for the person at the form. These say the same to an agent.
const DRAFT_RULES = {
  title: `title must be text of ${range(LIMITS.title)} characters.`,
  category: "category must be one of the valid values.",
  description: `description must be text of ${range(LIMITS.description)} characters.`,
  tags: `tags must be a list of at most ${LIMITS.tags} texts, each up to ${LIMITS.tagLength} characters.`,
  providerName: `providerName must be text of ${range(LIMITS.providerName)} characters.`,
  providerType: "providerType must be one of the valid values.",
  yearsExperience: `yearsExperience must be a whole number from 0 to ${LIMITS.yearsExperience}.`,
  phone: "phone must be a phone number with 7 to 15 digits; a leading +, spaces, brackets and hyphens are allowed.",
  email: `email must be an email address of at most ${LIMITS.emailLength} characters.`,
  country: "country must be one of the valid values.",
  city: "city must be one of the directory's cities in the given country.",
  address: `address must be text of ${range(LIMITS.address)} characters: street and house number.`,
  postalCode: `postalCode must fit the country: ${Object.entries(POSTAL).map(([code, rule]) => `"${rule.example}" in ${code}`).join(", ")}.`,
  radiusKm: `radiusKm is required when travelsToClient is true: a whole number from 1 to ${LIMITS.radiusKm}.`,
  priceFrom: `priceFrom must be a number greater than 0 and at most ${LIMITS.price} (EUR).`,
  priceTo: "priceTo must be a number not lower than priceFrom (EUR). Leave it out when there is one price.",
  priceUnit: "priceUnit must be one of the valid values.",
  calloutFee: `calloutFee must be a number from 0 to ${LIMITS.calloutFee} (EUR). Leave it out when there is no fee.`,
  languages: "languages must be a list with at least one of the valid values.",
  hours: 'hours must be an object with at least one working day, for example { "mon": { "open": "09:00", "close": "18:00" } }.',
  leadTimeDays: `leadTimeDays is required unless emergency is true: a whole number from 0 to ${LIMITS.leadTimeDays}; 0 means work can start today.`,
};
const dayRule = (field) =>
  `${field} must be { "open": "HH:MM", "close": "HH:MM" } in 24-hour time, with open before close. Leave the day out for a day off.`;

/**
 * What the agent sent, as the form reader takes it. Known values are accepted in any case and spelling, as in the search.
 * `errors` has what the reader would let through in silence: a "true" in quotes would be read as false.
 */
function readDraftInput(input, vocabulary, weekdays) {
  const args = isPlainObject(input) ? input : {};
  const draft = {};
  const errors = [];
  for (const field of INPUT_FIELDS) if (given(args[field])) draft[field] = args[field];

  const known = (field, value) => (typeof value === "string" ? vocabulary[field].find.get(normalize(value).trim()) ?? value : value);
  for (const field of ["category", "country", "city", "priceUnit", "providerType"]) {
    if (field in draft) draft[field] = known(field, draft[field]);
  }
  if (Array.isArray(draft.languages)) draft.languages = draft.languages.map((code) => known("language", code));

  // The form has one text field for the tags, so a list becomes the text a person would type there.
  if (Array.isArray(draft.tags) && draft.tags.every((tag) => typeof tag === "string")) draft.tags = draft.tags.join(", ");
  else if ("tags" in draft && typeof draft.tags !== "string") errors.push({ field: "tags", message: DRAFT_RULES.tags });

  for (const field of DRAFT_BOOLEANS) {
    if (field in draft && typeof draft[field] !== "boolean") {
      errors.push({ field, message: `${field} must be true or false (a boolean, not a string).` });
    }
  }

  if (isPlainObject(draft.hours)) {
    const unknown = Object.keys(draft.hours).filter((day) => !weekdays.includes(day));
    if (unknown.length > 0) {
      errors.push({ field: "hours", message: `hours has unknown days: ${unknown.join(", ").slice(0, 80)}. Use the valid values as keys.` });
    }
  }

  const warnings = [];
  const ignored = Object.keys(args).filter((key) => !INPUT_FIELDS.includes(key));
  if (ignored.length > 0) warnings.push(`Unknown fields were ignored: ${ignored.join(", ").slice(0, 200)}.`);
  if (draft.travelsToClient !== true && "radiusKm" in draft) warnings.push("radiusKm was ignored, because travelsToClient is not true.");
  if (draft.emergency === true && "leadTimeDays" in draft && Number(draft.leadTimeDays) !== 0) {
    warnings.push("leadTimeDays was ignored, because emergency is true: an emergency provider answers today.");
  }
  return { draft, errors, warnings };
}

/** The listing as the form will read it; no id and no rating, because nothing is added yet. */
function draftRecord(listing, category) {
  const copy = structuredClone(listing);
  return {
    category: copy.category,
    categoryName: { lt: category?.nameLt ?? null, en: category?.nameEn ?? null },
    title: copy.title,
    description: copy.description,
    tags: copy.tags,
    provider: copy.provider,
    contact: copy.contact,
    location: copy.location,
    serviceArea: copy.serviceArea,
    price: price(copy.price),
    languages: copy.languages,
    availability: copy.availability,
  };
}

const DRAFT_STATUS = {
  awaiting_user:
    'The new-service form is open on the page with these values. Ask the user to check it and press the "Add service" button ("Pridėti paslaugą" when the page is in Lithuanian). Nothing is added until they do.',
  sign_in_required:
    "The form is filled in, but the user is signed out. The sign-in dialog is open on the page, and the form opens right after the user signs in. The user signs in on the page themselves: do not ask for the password.",
};

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

/** The valid filter values from the vocabulary, each with the number of listings the database has for it. */
function filterOptions(catalog, counts) {
  const count = (table, key) => (Number.isInteger(table[key]) && table[key] > 0 ? table[key] : 0);
  const aliases = catalog.cityAliases ?? {};
  return {
    totalListings: counts.total,
    categories: catalog.categories.map((c) => ({ id: c.id, nameLt: c.nameLt, nameEn: c.nameEn, count: count(counts.categories, c.id) })),
    countries: catalog.countries.map((country) => {
      const cities = catalog.cities
        .filter((city) => city.country === country.code)
        .map(({ name }) => ({ name, count: count(counts.cities, name), alsoAccepted: [...(aliases[name] ?? [])] }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "lt"));
      return {
        code: country.code,
        nameLt: country.nameLt,
        nameEn: country.nameEn,
        count: cities.reduce((sum, city) => sum + city.count, 0),
        cities,
      };
    }),
    priceUnits: catalog.PRICE_UNITS.map((unit) => ({ unit, count: count(counts.priceUnits, unit) })),
    languages: catalog.LANGUAGES.map((code) => ({ code, count: count(counts.languages, code) })),
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

/** Wrap a tool body so that nothing it does can throw out of execute(), or reject. */
const safely = (body) => async (input) => {
  try {
    return await body(input);
  } catch (error) {
    if (error instanceof InputError) return failure(error.field, error.message, error.validValues);
    if (error instanceof DirectoryError) {
      console.warn("The directory database did not answer:", error);
      return failure(null, "The directory database could not be reached, so there is no answer. Try again in a moment.");
    }
    console.warn("Tool failed:", error);
    return failure(null, "The tool failed unexpectedly. Try again.");
  }
};

const SEARCH_DESCRIPTION = `Search a directory of service providers in Lithuania, Latvia and Estonia: plumbers, electricians, renovation, cleaning, movers, car repair, appliance repair, gardening, beauty, tutors, IT support and photographers. All data is fictional demo data.

All inputs are optional and combine with AND. "query" is free text in Lithuanian or English; case, accents and word endings are ignored. Call list_service_filters to get the valid values of category, country, city, language, priceUnit and sortBy.

Prices are in EUR and are the advertised starting price. Call-out fees are returned separately and are not included in price comparisons. priceMax and the price sorts compare starting prices, so pass priceUnit to compare like with like.

openNow means the provider is inside working hours right now (Europe/Vilnius time) and can be phoned; it says nothing about free capacity. availableWithinDays is about when work can start: 0 means today.

Returns { notice, currency, timeZone, total, returned, offset, appliedFilters, warnings, results }. Each result has id, title, titleEn, category, provider, location (country, city, address), price (from, to, unit, negotiable, calloutFee), rating, contact (phone, email), availability (openNow, todayHours, nextFreeDate, emergency) and descriptionEn. "total" counts all matches; page with limit and offset. Use get_service with an id for the full record. The directory also has listings that visitors added with the form on the page. Such a listing has no reviews yet: its rating is { average: 0, count: 0 }, minRating leaves it out, and its titleEn and descriptionEn repeat the text as it was typed. Invalid input returns { error: { field, message, validValues } } instead of results. The list shown on the page is filtered the same way and opens at the page that holds the returned results.`;

const GET_DESCRIPTION = `Get the full record of one service listing by id (for example "svc-001"; ids come from search_services). All data is fictional demo data.

Returns { notice, currency, timeZone, service }. "service" has the Lithuanian and English title and description, tags, provider (name, type, yearsExperience, verified), contact (phone, email, website), location (country, city, address, postalCode), serviceArea (travelsToClient, radiusKm, remote), price in EUR (from, to, unit, negotiable, calloutFee), rating, languages, and availability: weekly working hours per weekday, leadTimeDays, emergency, plus openNow, todayHours and nextFreeDate computed for the current Europe/Vilnius time. An unknown id returns { error: { field, message } }. The page shows the listing highlighted above its list.`;

const DRAFT_DESCRIPTION = `Fill in the "add a service" form on the page with a new listing, for the user to check and submit. This tool does not add the listing: it opens the form with the given values, and the listing is added only when the user presses the submit button of the form. Use it when the user wants to advertise a service of their own in the directory. Pass only facts the user gave you and ask for the ones that are missing; never invent a phone, an email or an address.

The directory holds fictional demo data. A listing the user adds with the form is saved in the directory's database and is public: every visitor of the page and every agent that searches the directory can see it. Tell the user so before they submit, and pass nothing they do not want published.

Required: title, category, description, providerName, providerType, yearsExperience, phone, email, country, city, address, postalCode, priceFrom, priceUnit, languages and hours. radiusKm is required when travelsToClient is true, and leadTimeDays unless emergency is true. The city must be one of the directory's cities in the given country: call list_service_filters for the valid categories, countries, cities, price units and languages. Title and description are written once, in the language the user wants; the form does not translate them. Prices are in EUR. "hours" has one entry per working day (mon, tue, wed, thu, fri, sat, sun) with open and close as "HH:MM" in Europe/Vilnius time; a day that is left out is a day off.

Returns { notice, currency, timeZone, status, message, draft, warnings }. status is "awaiting_user" when the form is open and waits for the user, or "sign_in_required" when the user has to sign in on the page first; the filled form opens right after the sign-in. Never ask the user for the password. "draft" is the listing as the form will read it. The tool cannot see what the user does next: when the user says the service is added, find it with search_services. Every call replaces everything in the form, including what the user typed there, so always send the complete listing. Invalid input returns { error, errors } and leaves the page alone: "errors" lists every wrong field as { field, message, validValues }, and "error" is the first of them.`;

const FILTERS_DESCRIPTION = `List the valid filter values for search_services, with the number of listings for each: categories (id, Lithuanian name, English name), countries with their cities and accepted alternative city spellings, price units, languages, sort options and the paging limits. Takes no input. All data is fictional demo data.`;

/**
 * @param {object} deps
 * @param {object} deps.catalog       The vocabulary: categories, countries, cities, cityAliases, PRICE_UNITS, LANGUAGES, WEEKDAYS.
 * @param {object} deps.directory     The listings in the database, see createDirectory: search, get, counts.
 * @param {() => Date} deps.now       Read at every call, so "open now" is never stale.
 * @param {(filters: object, view: { offset: number, total: number }) => void} [deps.showFilters]
 *        Show these filters and their result in the page list; view.offset is where the agent's slice starts
 *        and view.total how many listings matched.
 * @param {(listing: object) => void} [deps.showListing]  Show a listing highlighted above the list.
 * @param {(input: object) => { signedIn: boolean }} [deps.showDraft]
 *        Put this form input into the new-service form and open it, behind the sign-in when nobody is signed in.
 *        Unlike the two above, this effect is the whole point of its tool: when it fails, the tool says so.
 * @returns {Array<{ name: string, description: string, inputSchema: object, annotations: object, execute: (input: unknown) => Promise<object> }>}
 */
export function createTools({ catalog, directory, now, showFilters, showListing, showDraft }) {
  const vocabulary = buildVocabulary(catalog);
  const categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
  const readListing = createListingReader(catalog);
  const citiesByCountry = new Map(catalog.countries.map((country) => [country.code, []]));
  for (const city of catalog.cities) citiesByCountry.get(city.country)?.push(city.name);
  const draftValidValues = (field, draft) => {
    if (field === "city") return citiesByCountry.get(draft.country) ?? vocabulary.city.values;
    if (field === "languages") return vocabulary.language.values;
    if (field === "hours") return [...catalog.WEEKDAYS];
    return ["category", "providerType", "country", "priceUnit"].includes(field) ? vocabulary[field].values : undefined;
  };
  /** Every wrong field once, in the order of the form, each with an English message and its valid values. */
  const draftErrors = (early, fromReader, draft) => {
    const seen = new Set();
    const formOrder = (error) => INPUT_FIELDS.indexOf(error.field.split(".")[0]);
    return [...early, ...fromReader]
      .filter(({ field }) => !seen.has(field) && seen.add(field))
      .map(({ field, message }) => {
        const error = { field, message: early.some((e) => e.field === field) ? message : field.startsWith("hours.") ? dayRule(field) : DRAFT_RULES[field] ?? `${field} is not valid.` };
        const validValues = draftValidValues(field, draft);
        return validValues ? { ...error, validValues } : error;
      })
      .sort((a, b) => formOrder(a) - formOrder(b));
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
      execute: safely(async (input) => {
        const { filters, limit, offset } = readSearchInput(input, vocabulary);
        const result = await directory.search({ ...filters, limit, offset }, now());
        quietly(showFilters, { ...filters }, { offset: result.offset, total: result.total });
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
      execute: safely(async (input) => {
        const args = isPlainObject(input) ? input : {};
        if (typeof args.id !== "string" || !args.id.trim()) {
          throw new InputError("id", 'id is required and must be a string such as "svc-001".');
        }
        // Ids are "svc-" plus a number; hand-written ones are padded to 3 digits and generated ones to 5.
        // Listings are looked up by the number, so "svc-1", "svc-001" and "svc-00001" all find the same listing.
        const idNumber = /^svc-(\d{1,9})$/i.exec(args.id.trim())?.[1];
        const listing = idNumber === undefined ? null : await directory.get(Number(idNumber));
        if (!listing) {
          throw new InputError("id", `No listing has the id "${args.id.trim().slice(0, 40)}". Use search_services to find ids.`);
        }
        const service = fullRecord(listing, categoryById.get(listing.category), now());
        quietly(showListing, listing);
        return answer({ service });
      }),
    },
    {
      name: "list_service_filters",
      description: FILTERS_DESCRIPTION,
      inputSchema: { type: "object", properties: {} },
      annotations,
      execute: safely(async () => answer(filterOptions(catalog, await directory.counts()))),
    },
    {
      name: "draft_service",
      description: DRAFT_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", minLength: LIMITS.title[0], maxLength: LIMITS.title[1], description: "Name of the service." },
          category: { type: "string", enum: vocabulary.category.values, description: "Category id." },
          description: { type: "string", minLength: LIMITS.description[0], maxLength: LIMITS.description[1], description: "What the provider does, for whom and where." },
          tags: { type: "array", maxItems: LIMITS.tags, items: { type: "string", maxLength: LIMITS.tagLength }, description: "Optional search keywords. A comma inside a keyword splits it in two." },
          providerName: { type: "string", minLength: LIMITS.providerName[0], maxLength: LIMITS.providerName[1], description: "Name of the person or the company." },
          providerType: { type: "string", enum: vocabulary.providerType.values },
          yearsExperience: { type: "integer", minimum: 0, maximum: LIMITS.yearsExperience },
          phone: { type: "string", description: 'For example "+370 000 00000".' },
          email: { type: "string", maxLength: LIMITS.emailLength },
          country: { type: "string", enum: vocabulary.country.values, description: "Country code: LT, LV or EE." },
          city: { type: "string", description: `One of the directory's cities in that country, e.g. ${vocabulary.city.values.slice(0, 4).join(", ")}. Accents are optional.` },
          address: { type: "string", minLength: LIMITS.address[0], maxLength: LIMITS.address[1], description: "Street and house number." },
          postalCode: { type: "string", description: Object.entries(POSTAL).map(([code, rule]) => `${code}: "${rule.example}"`).join(", ") + "." },
          travelsToClient: { type: "boolean", description: "The provider comes to the client. Default false." },
          radiusKm: { type: "integer", minimum: 1, maximum: LIMITS.radiusKm, description: "How far the provider travels. Required when travelsToClient is true." },
          remote: { type: "boolean", description: "The service is also given remotely. Default false." },
          priceFrom: { type: "number", exclusiveMinimum: 0, maximum: LIMITS.price, description: "Starting price in EUR." },
          priceTo: { type: "number", exclusiveMinimum: 0, maximum: LIMITS.price, description: "Optional upper price in EUR, not lower than priceFrom." },
          priceUnit: { type: "string", enum: vocabulary.priceUnit.values, description: "What the price is charged per." },
          calloutFee: { type: "number", minimum: 0, maximum: LIMITS.calloutFee, description: "Optional call-out fee in EUR." },
          negotiable: { type: "boolean", description: "The price can be negotiated. Default false." },
          languages: { type: "array", minItems: 1, items: { type: "string", enum: vocabulary.language.values }, description: "Languages the provider speaks." },
          hours: {
            type: "object",
            description: 'Weekly working hours in Europe/Vilnius time, e.g. { "mon": { "open": "09:00", "close": "18:00" } }. Leave a day out for a day off.',
            properties: Object.fromEntries(
              catalog.WEEKDAYS.map((day) => [
                day,
                {
                  type: "object",
                  properties: { open: { type: "string", description: "HH:MM" }, close: { type: "string", description: "HH:MM, later than open" } },
                  required: ["open", "close"],
                },
              ]),
            ),
          },
          leadTimeDays: { type: "integer", minimum: 0, maximum: LIMITS.leadTimeDays, description: "Days until work can start; 0 means today. Required unless emergency is true." },
          emergency: { type: "boolean", description: "Round-the-clock emergency service. Default false." },
        },
        required: [
          "title", "category", "description", "providerName", "providerType", "yearsExperience", "phone", "email",
          "country", "city", "address", "postalCode", "priceFrom", "priceUnit", "languages", "hours",
        ],
      },
      annotations: { readOnlyHint: false },
      execute: safely((input) => {
        const { draft, errors: early, warnings } = readDraftInput(input, vocabulary, catalog.WEEKDAYS);
        const read = readListing(draft);
        const errors = draftErrors(early, read.ok ? [] : read.errors, draft);
        if (errors.length > 0) return answer({ error: errors[0], errors });

        // Without the page effect there is no draft: say so instead of answering as if the form were open.
        let shown;
        try {
          if (!showDraft) throw new Error("this page has no new-service form");
          shown = showDraft(inputOfListing(read.listing));
        } catch (error) {
          console.warn("Could not show the draft on the page:", error);
          return failure(null, "The page could not open the new-service form, so nothing was drafted. Try again, or ask the user to reload the page.");
        }
        const status = shown?.signedIn === true ? "awaiting_user" : "sign_in_required";
        return answer({
          status,
          message: DRAFT_STATUS[status],
          draft: draftRecord(read.listing, categoryById.get(read.listing.category)),
          warnings,
        });
      }),
    },
  ];
}
