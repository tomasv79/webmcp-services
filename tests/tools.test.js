import { test } from "node:test";
import assert from "node:assert/strict";
import { createTools, LIMIT_DEFAULT, LIMIT_MAX } from "../public/js/tools.js";
import * as catalog from "../public/js/data.js";

const WED_1000 = new Date("2026-11-25T08:00:00Z"); // Wednesday 10:00 in Vilnius
const WED_2100 = new Date("2026-11-25T19:00:00Z");

function setup(overrides = {}) {
  const calls = { showFilters: [], showListing: [] };
  const clock = { now: WED_1000 };
  const tools = createTools({
    catalog,
    now: () => clock.now,
    showFilters: (filters) => calls.showFilters.push(filters),
    showListing: (id) => calls.showListing.push(id),
    ...overrides,
  });
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  return {
    tools, calls, clock,
    search: (input) => byName.search_services.execute(input),
    get: (input) => byName.get_service.execute(input),
    filters: (input) => byName.list_service_filters.execute(input),
  };
}

test("AC5.7 three tools with English names, descriptions, input schemas and the read-only hint", () => {
  const { tools } = setup();
  assert.deepEqual(tools.map((t) => t.name), ["search_services", "get_service", "list_service_filters"]);
  for (const tool of tools) {
    assert.ok(tool.description.length > 40, `${tool.name} description`);
    assert.match(tool.description, /^[\x20-\x7E\n]+$/, `${tool.name} description is plain English text`);
    assert.match(tool.description, /fictional/i, `${tool.name} says the data is fictional`);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(typeof tool.inputSchema.properties, "object");
    assert.deepEqual(tool.annotations, { readOnlyHint: true });
    assert.equal(tool.outputSchema, undefined, `${tool.name} declares no outputSchema`);
    assert.equal(typeof tool.execute, "function");
  }
  const search = tools[0];
  assert.match(search.description, /EUR/);
  assert.match(search.description, /Europe\/Vilnius/);
  assert.match(search.description, /priceUnit/);
  assert.match(search.description, /call-out/i);
  assert.deepEqual(search.inputSchema.properties.category.enum, catalog.categories.map((c) => c.id));
  assert.deepEqual(search.inputSchema.properties.country.enum, ["LT", "LV", "EE"]);
  assert.deepEqual(tools[1].inputSchema.required, ["id"]);
});

test("AC5.3 every answer carries the notice, currency and time zone", () => {
  const t = setup();
  for (const answer of [t.search({}), t.search({ category: "nope" }), t.get({ id: "svc-001" }), t.get({}), t.filters({})]) {
    assert.equal(answer.notice, "Fictional demo data");
    assert.equal(answer.currency, "EUR");
    assert.equal(answer.timeZone, "Europe/Vilnius");
  }
});

test("search_services without filters returns the first page of everything", () => {
  const t = setup();
  const answer = t.search({});
  assert.equal(answer.total, 60);
  assert.equal(answer.returned, 10);
  assert.equal(answer.offset, 0);
  assert.equal(answer.results.length, 10);
  assert.deepEqual(answer.warnings, []);
  assert.deepEqual(answer.appliedFilters, { sortBy: "rating", limit: LIMIT_DEFAULT, offset: 0 });
  assert.equal(answer.error, undefined);
});

test("AC5.2 arguments that are not an object are treated as empty", () => {
  const t = setup();
  for (const input of [undefined, null, "abc", 5, true, [], ["plumbing"]]) {
    const answer = t.search(input);
    assert.equal(answer.total, 60, `input ${JSON.stringify(input)}`);
    assert.equal(answer.error, undefined);
  }
  assert.equal(t.filters("abc").totalListings, 60);
  assert.equal(t.get(null).error.field, "id");
});

test("AC5.2 unknown keys are ignored and null means not given", () => {
  const t = setup();
  const answer = t.search({ foo: 1, radius: "5km", category: null, query: null, limit: null });
  assert.equal(answer.total, 60);
  assert.deepEqual(answer.appliedFilters, { sortBy: "rating", limit: LIMIT_DEFAULT, offset: 0 });
});

const INVALID = [
  ["query", 5], ["query", {}], ["query", true],
  ["category", "nope"], ["category", 5], ["category", ""],
  ["country", "FR"], ["country", 370],
  ["city", "Paris"], ["city", 1],
  ["language", "de"], ["language", false],
  ["priceUnit", "week"], ["priceUnit", 1],
  ["sortBy", "cheapest"], ["sortBy", 1],
  ["priceMax", 0], ["priceMax", -5], ["priceMax", "50"], ["priceMax", Number.NaN], ["priceMax", Infinity],
  ["minRating", 0], ["minRating", 0.9], ["minRating", 5.1], ["minRating", "4"],
  ["availableWithinDays", -1], ["availableWithinDays", 2.5], ["availableWithinDays", 91], ["availableWithinDays", "3"],
  ["travelsToClient", "true"], ["travelsToClient", 1],
  ["openNow", "true"], ["openNow", 0],
  ["limit", "abc"], ["limit", 2.5], ["limit", "10"],
  ["offset", 1.5], ["offset", "0"],
];

test("AC5.2 wrong input returns an error object naming the field, and never throws", () => {
  for (const [field, value] of INVALID) {
    const t = setup();
    let answer;
    assert.doesNotThrow(() => { answer = t.search({ [field]: value }); }, `${field}=${String(value)}`);
    assert.equal(answer.error?.field, field, `${field}=${String(value)} -> ${JSON.stringify(answer.error)}`);
    assert.equal(typeof answer.error.message, "string");
    assert.equal(answer.results, undefined);
    assert.equal(t.calls.showFilters.length, 0, "the page is not touched on an error");
  }
});

test("AC5.2 enumerated fields list their valid values in the error", () => {
  const t = setup();
  assert.deepEqual(t.search({ category: "nope" }).error.validValues, catalog.categories.map((c) => c.id));
  assert.deepEqual(t.search({ country: "FR" }).error.validValues, ["LT", "LV", "EE"]);
  assert.deepEqual(t.search({ priceUnit: "week" }).error.validValues, ["hour", "job", "m2", "visit", "day"]);
  assert.deepEqual(t.search({ sortBy: "cheapest" }).error.validValues, ["relevance", "rating", "price_asc", "price_desc", "soonest"]);
  assert.deepEqual(t.search({ language: "de" }).error.validValues, ["lt", "lv", "et", "en", "ru"]);
  const cities = t.search({ city: "Paris" }).error.validValues;
  assert.equal(cities.length, 13);
  assert.ok(cities.includes("Vilnius") && cities.includes("Rīga") && cities.includes("Pärnu"));
});

test("AC5.2 known values are accepted in any case and without diacritics, and returned in canonical form", () => {
  const t = setup();
  const applied = (input) => t.search(input).appliedFilters;
  assert.equal(applied({ category: "PLUMBING" }).category, "plumbing");
  assert.equal(applied({ category: " Auto-Repair " }).category, "auto-repair");
  assert.equal(applied({ country: "lt" }).country, "LT");
  assert.equal(applied({ country: "Latvia" }).country, "LV");
  assert.equal(applied({ country: "Estija" }).country, "EE");
  assert.equal(applied({ city: "riga" }).city, "Rīga");
  assert.equal(applied({ city: "Ryga" }).city, "Rīga");
  assert.equal(applied({ city: "Talinas" }).city, "Tallinn");
  assert.equal(applied({ city: "SIAULIAI" }).city, "Šiauliai");
  assert.equal(applied({ language: "RU" }).language, "ru");
  assert.equal(applied({ priceUnit: "Hour" }).priceUnit, "hour");
  assert.equal(applied({ sortBy: "Price_Asc" }).sortBy, "price_asc");
});

test("every value the input schema offers is accepted by the tool", () => {
  const t = setup();
  const { properties } = t.tools[0].inputSchema;
  for (const [field, schema] of Object.entries(properties)) {
    for (const value of schema.enum ?? []) {
      assert.equal(t.search({ [field]: value }).error, undefined, `${field}=${value}`);
    }
  }
  const bounds = { priceMax: [0.01, 5000], minRating: [1, 5], availableWithinDays: [0, 90], limit: [1, 20], offset: [0, 1000] };
  for (const [field, values] of Object.entries(bounds)) {
    assert.ok(properties[field], field);
    for (const value of values) assert.equal(t.search({ [field]: value }).error, undefined, `${field}=${value}`);
  }
  assert.equal(properties.availableWithinDays.maximum, 90);
  assert.equal(properties.limit.maximum, LIMIT_MAX);
  // Every listing can be reached with the largest availableWithinDays.
  assert.equal(t.search({ availableWithinDays: 90 }).total, 60);
});

test("AC5.2 limit is clamped to 1..20 and offset to 0 or more", () => {
  const t = setup();
  assert.equal(t.search({ limit: 50 }).appliedFilters.limit, LIMIT_MAX);
  assert.equal(t.search({ limit: 50 }).returned, 20);
  assert.equal(t.search({ limit: 0 }).appliedFilters.limit, 1);
  assert.equal(t.search({ limit: -3 }).returned, 1);
  assert.equal(t.search({ offset: -1 }).appliedFilters.offset, 0);
  assert.equal(LIMIT_DEFAULT, 10);
  assert.equal(LIMIT_MAX, 20);
});

test("AC5.2 query is trimmed and cut at 200 characters; blank means not given", () => {
  const t = setup();
  assert.equal(t.search({ query: "  santechnikas  " }).appliedFilters.query, "santechnikas");
  assert.equal(t.search({ query: "a".repeat(500) }).appliedFilters.query.length, 200);
  const blank = t.search({ query: "    " });
  assert.equal(blank.appliedFilters.query, undefined);
  assert.equal(blank.total, 60);
});

test("AC1.7 markup in a query comes back as plain text and matches nothing", () => {
  const t = setup();
  const attack = "<img src=x onerror=alert(1)>";
  const answer = t.search({ query: attack });
  assert.equal(answer.appliedFilters.query, attack);
  assert.equal(typeof answer.total, "number");
  assert.deepEqual(t.calls.showFilters[0], { query: attack });
});

test("search_services result fields", () => {
  const t = setup();
  const answer = t.search({ query: "santechnikas", city: "Vilnius" });
  assert.equal(answer.results[0].id, "svc-001");
  assert.deepEqual(answer.results[0], {
    id: "svc-001",
    title: "Santechnikos darbai ir avarijų šalinimas",
    titleEn: "Plumbing work and emergency repairs",
    category: "plumbing",
    provider: { name: "Vandens Meistrai", type: "company", verified: true },
    location: { country: "LT", city: "Vilnius", address: "Kalvarijų g. 298" },
    price: { from: 30, to: 45, unit: "hour", negotiable: false, calloutFee: 20 },
    rating: { average: 4.8, count: 132 },
    contact: { phone: "+370 000 00001", email: "info@vandensmeistrai.example" },
    availability: { openNow: true, todayHours: ["08:00", "18:00"], nextFreeDate: "2026-11-25", emergency: true },
    descriptionEn: catalog.listings[0].descriptionEn,
  });
});

test("search_services uses null for a missing upper price or call-out fee", () => {
  const t = setup();
  const result = t.search({ query: "Elektrikas Vytas" }).results.find((r) => r.id === "svc-008");
  assert.deepEqual(result.price, { from: 30, to: null, unit: "visit", negotiable: false, calloutFee: null });
});

test("search_services pages with limit and offset", () => {
  const t = setup();
  const answer = t.search({ limit: 5, offset: 58 });
  assert.equal(answer.total, 60);
  assert.equal(answer.returned, 2);
  assert.equal(answer.offset, 58);
  const first = t.search({ limit: 5 }).results.map((r) => r.id);
  const second = t.search({ limit: 5, offset: 5 }).results.map((r) => r.id);
  assert.equal(new Set([...first, ...second]).size, 10);
});

test("search_services passes warnings through", () => {
  const t = setup();
  assert.equal(t.search({ priceMax: 30 }).warnings.length, 1);
  assert.deepEqual(t.search({ priceMax: 30, priceUnit: "hour" }).warnings, []);
});

test("AC5.4 search_services shows the same filters on the page, without paging", () => {
  const t = setup();
  const answer = t.search({ category: "cleaning", minRating: 4.5, language: "RU", limit: 2, offset: 1 });
  assert.equal(t.calls.showFilters.length, 1);
  assert.deepEqual(t.calls.showFilters[0], { category: "cleaning", minRating: 4.5, language: "ru" });
  assert.deepEqual(answer.appliedFilters, {
    category: "cleaning", minRating: 4.5, language: "ru", sortBy: "rating", limit: 2, offset: 1,
  });
  assert.ok(answer.total > answer.returned || answer.total <= 3);
});

test("AC5.4 an explicit sort is shown on the page too; the default one is not forced", () => {
  const t = setup();
  t.search({ sortBy: "soonest" });
  t.search({ query: "valymas" });
  assert.deepEqual(t.calls.showFilters[0], { sortBy: "soonest" });
  assert.deepEqual(t.calls.showFilters[1], { query: "valymas" });
  assert.equal(t.search({ query: "valymas" }).appliedFilters.sortBy, "relevance");
});

test("a failing page update does not fail the answer", () => {
  const t = setup({ showFilters: () => { throw new Error("no DOM"); }, showListing: () => { throw new Error("no DOM"); } });
  assert.equal(t.search({ category: "beauty" }).total, 5);
  assert.equal(t.get({ id: "svc-041" }).service.id, "svc-041");
});

test("AC5.8 the clock is read at every call", () => {
  const t = setup();
  const open = () => t.search({ query: "Santechnikas Algis" }).results.find((r) => r.id === "svc-002").availability.openNow;
  assert.equal(open(), true);
  t.clock.now = WED_2100;
  assert.equal(open(), false);
  assert.equal(t.get({ id: "svc-002" }).service.availability.openNow, false);
});

test("AC5.2 an unexpected failure inside a tool is returned as an error object", () => {
  const t = setup({ now: () => { throw new Error("clock broke"); } });
  for (const answer of [t.search({}), t.get({ id: "svc-001" })]) {
    assert.equal(answer.error.field, null);
    assert.equal(answer.notice, "Fictional demo data");
  }
});

test("AC5.5 get_service returns the whole listing with computed availability and shows the card", () => {
  const t = setup();
  const answer = t.get({ id: "svc-046" });
  const source = catalog.listings.find((l) => l.id === "svc-046");
  const { service } = answer;
  assert.equal(service.id, "svc-046");
  assert.equal(service.description, source.description);
  assert.equal(service.descriptionEn, source.descriptionEn);
  assert.deepEqual(service.categoryName, { lt: "Korepetitoriai ir mokymai", en: "Tutoring and lessons" });
  assert.deepEqual(service.provider, source.provider);
  assert.deepEqual(service.contact, { phone: source.contact.phone, email: source.contact.email, website: null });
  assert.deepEqual(service.location, source.location);
  assert.deepEqual(service.serviceArea, source.serviceArea);
  assert.deepEqual(service.price, { from: 20, to: 30, unit: "hour", negotiable: false, calloutFee: null });
  assert.deepEqual(service.languages, source.languages);
  assert.deepEqual(service.tags, source.tags);
  assert.deepEqual(service.availability, {
    hours: source.availability.hours,
    leadTimeDays: 2,
    emergency: false,
    openNow: false, // Wednesday 10:00, opens at 15:00
    todayHours: ["15:00", "20:00"],
    nextFreeDate: "2026-11-27",
  });
  assert.deepEqual(t.calls.showListing, ["svc-046"]);
});

test("AC5.5 get_service returns a copy, not the stored listing", () => {
  const t = setup();
  const { service } = t.get({ id: "svc-001" });
  service.tags.push("changed");
  service.availability.hours.mon = null;
  service.provider.name = "changed";
  const source = catalog.listings.find((l) => l.id === "svc-001");
  assert.ok(!source.tags.includes("changed"));
  assert.deepEqual(source.availability.hours.mon, ["08:00", "18:00"]);
  assert.equal(source.provider.name, "Vandens Meistrai");
});

test("AC5.5 get_service accepts the id in any case and with spaces", () => {
  const t = setup();
  assert.equal(t.get({ id: "SVC-001" }).service.id, "svc-001");
  assert.equal(t.get({ id: "  svc-001 " }).service.id, "svc-001");
});

test("AC5.5 get_service with a missing, wrong-typed or unknown id returns an error and leaves the page alone", () => {
  const t = setup();
  for (const input of [{}, { id: null }, { id: 1 }, { id: "" }, { id: "svc-999" }, { id: "plumbing" }, { id: ["svc-001"] }]) {
    const answer = t.get(input);
    assert.equal(answer.error?.field, "id", JSON.stringify(input));
    assert.equal(answer.service, undefined);
  }
  assert.match(t.get({ id: "svc-999" }).error.message, /search_services/);
  assert.deepEqual(t.calls.showListing, []);
});

test("AC5.6 list_service_filters returns every valid filter value with counts", () => {
  const t = setup();
  const answer = t.filters({});
  assert.equal(answer.totalListings, 60);

  assert.equal(answer.categories.length, 12);
  assert.deepEqual(answer.categories[0], { id: "plumbing", nameLt: "Santechnika", nameEn: "Plumbing", count: 5 });
  assert.equal(answer.categories.reduce((sum, c) => sum + c.count, 0), 60);

  assert.deepEqual(answer.countries.map((c) => [c.code, c.count]), [["LT", 30], ["LV", 15], ["EE", 15]]);
  const latvia = answer.countries.find((c) => c.code === "LV");
  assert.equal(latvia.nameEn, "Latvia");
  assert.deepEqual(latvia.cities.find((c) => c.name === "Rīga"), { name: "Rīga", count: 8, alsoAccepted: ["Ryga", "Riga"] });
  assert.equal(answer.countries.flatMap((c) => c.cities).length, 13);
  assert.equal(answer.countries.flatMap((c) => c.cities).reduce((sum, c) => sum + c.count, 0), 60);

  assert.deepEqual(answer.priceUnits.map((u) => u.unit), ["hour", "job", "m2", "visit", "day"]);
  assert.equal(answer.priceUnits.reduce((sum, u) => sum + u.count, 0), 60);
  assert.deepEqual(answer.languages.map((l) => l.code), ["lt", "lv", "et", "en", "ru"]);
  assert.ok(answer.languages.every((l) => l.count > 0));
  assert.deepEqual(answer.sortOptions, ["relevance", "rating", "price_asc", "price_desc", "soonest"]);
  assert.deepEqual(answer.limit, { default: 10, max: 20 });
  assert.deepEqual(t.calls.showFilters, []);
});

test("every answer can be serialised to JSON", () => {
  const t = setup();
  for (const answer of [t.search({ query: "valymas" }), t.get({ id: "svc-010" }), t.filters()]) {
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(answer)));
  }
});
