import { test } from "node:test";
import assert from "node:assert/strict";
import { searchServices } from "../public/js/search.js";
import { normalize, queryTokens } from "../public/js/text.js";
import * as data from "../public/js/data.js";

const weekdays = (open, close) => ({
  mon: [open, close], tue: [open, close], wed: [open, close], thu: [open, close], fri: [open, close], sat: null, sun: null,
});
const everyDay = (open, close) => ({ ...weekdays(open, close), sat: [open, close], sun: [open, close] });
const tuesdayToSaturday = (open, close) => ({ ...weekdays(open, close), mon: null, sat: [open, close] });

const make = (id, o) => ({
  id,
  category: o.category,
  title: o.title, titleEn: o.titleEn,
  description: o.description ?? "Aprašymas.", descriptionEn: o.descriptionEn ?? "Description.",
  tags: o.tags ?? [],
  provider: { name: o.provider, type: "company", yearsExperience: 5, verified: true },
  contact: { phone: "+370 000 00999", email: "a@b.example" },
  location: { country: o.country, city: o.city, address: "Gatvė 1", postalCode: "LT-00000" },
  serviceArea: { travelsToClient: o.travels ?? true, radiusKm: 10, remote: o.remote ?? false },
  price: { from: o.price, unit: o.unit, currency: "EUR", negotiable: false },
  rating: { average: o.rating, count: o.count },
  languages: o.languages,
  availability: { hours: o.hours, leadTimeDays: o.lead, emergency: o.emergency ?? false },
});

const catalog = {
  categories: [
    { id: "plumbing", nameLt: "Santechnika", nameEn: "Plumbing" },
    { id: "cleaning", nameLt: "Valymas", nameEn: "Cleaning" },
    { id: "beauty", nameLt: "Grožio paslaugos", nameEn: "Beauty services" },
    { id: "tutoring", nameLt: "Korepetitoriai ir mokymai", nameEn: "Tutoring and lessons" },
  ],
  countries: [
    { code: "LT", nameLt: "Lietuva", nameEn: "Lithuania" },
    { code: "LV", nameLt: "Latvija", nameEn: "Latvia" },
    { code: "EE", nameLt: "Estija", nameEn: "Estonia" },
  ],
  cityAliases: { "Rīga": ["Ryga", "Riga"], "Pärnu": ["Pernu"] },
  listings: [
    make("svc-901", { category: "plumbing", title: "Santechnikos darbai", titleEn: "Plumbing work", description: "Keičiame vamzdžius Vilniuje.", descriptionEn: "Pipe replacement.", tags: ["santechnikas", "plumber"], provider: "Vandens Meistrai", country: "LT", city: "Vilnius", price: 30, unit: "hour", rating: 4.8, count: 100, languages: ["lt", "en"], hours: weekdays("08:00", "18:00"), lead: 0, emergency: true }),
    make("svc-902", { category: "plumbing", title: "Santechnikas į namus", titleEn: "Plumber for home visits", tags: ["maišytuvas", "tap"], provider: "Meistras Algis", country: "LT", city: "Kaunas", price: 20, unit: "hour", rating: 4.6, count: 50, languages: ["lt", "ru"], hours: weekdays("08:00", "17:00"), lead: 2 }),
    make("svc-903", { category: "cleaning", title: "Butų valymas", titleEn: "Flat cleaning", tags: ["švara"], provider: "Tīrības Serviss", country: "LV", city: "Rīga", price: 3, unit: "m2", rating: 4.6, count: 80, languages: ["lv", "ru"], hours: everyDay("08:00", "20:00"), lead: 1 }),
    make("svc-904", { category: "beauty", title: "Kirpimas", titleEn: "Haircuts", descriptionEn: "Haircuts; no cleaning needed.", tags: ["kirpykla"], provider: "Studija Žirklės", country: "LT", city: "Šiauliai", price: 15, unit: "visit", rating: 4.9, count: 10, languages: ["lt"], travels: false, hours: tuesdayToSaturday("09:00", "19:00"), lead: 3 }),
    make("svc-905", { category: "tutoring", title: "Matematikos pamokos", titleEn: "Maths lessons", tags: ["matematika"], provider: "Koodikool", country: "EE", city: "Pärnu", price: 25, unit: "hour", rating: 4.2, count: 5, languages: ["et", "en"], travels: false, remote: true, hours: weekdays("15:00", "20:00"), lead: 10 }),
    make("svc-906", { category: "cleaning", title: "Langų valymas", titleEn: "Window cleaning", tags: ["langai"], provider: "Skaidrus Langas", country: "LT", city: "Vilnius", price: 40, unit: "job", rating: 4.8, count: 100, languages: ["lt"], hours: weekdays("09:00", "17:00"), lead: 0 }),
  ],
};

const WED_1000 = new Date("2026-11-25T08:00:00Z"); // Wednesday 10:00 in Vilnius
const WED_1830 = new Date("2026-11-25T16:30:00Z");
const WED_2100 = new Date("2026-11-25T19:00:00Z");

const ids = (filters, now = WED_1000) => searchServices(catalog, filters, now).items.map((item) => item.listing.id);
const sorted = (filters, now) => ids(filters, now).sort();

test("text: normalize removes case and Baltic diacritics", () => {
  assert.equal(normalize("Šiauliai"), "siauliai");
  assert.equal(normalize("Rīga"), "riga");
  assert.equal(normalize("Pärnu"), "parnu");
  assert.equal(normalize("Klaipėda"), "klaipeda");
  assert.equal(normalize("Põhja Torutööd"), "pohja torutood");
  assert.equal(normalize("ĄČĘĖĮŠŲŪŽ ķļņģ"), "aceeisuuz klng");
});

test("text: query words shorter than 3 characters are dropped, duplicates removed", () => {
  assert.deepEqual(queryTokens("Santechnikas ir a  SANTECHNIKAS, Vilnius!"), ["santechnikas", "vilnius"]);
  assert.deepEqual(queryTokens("ir"), []);
  assert.deepEqual(queryTokens(""), []);
});

test("AC3.8 no query and no filters returns everything, sorted by rating", () => {
  const result = searchServices(catalog, {}, WED_1000);
  assert.equal(result.total, 6);
  assert.deepEqual(result.items.map((i) => i.listing.id), ["svc-904", "svc-901", "svc-906", "svc-903", "svc-902", "svc-905"]);
  assert.deepEqual(result.warnings, []);
});

test("AC3.8 filters is optional", () => {
  assert.equal(searchServices(catalog, undefined, WED_1000).total, 6);
});

test("AC3.1 free text matches Lithuanian and English, ignoring case and diacritics", () => {
  assert.deepEqual(sorted({ query: "santechnikas" }), ["svc-901", "svc-902"]);
  assert.deepEqual(sorted({ query: "PLUMBER" }), ["svc-901", "svc-902"]);
  assert.deepEqual(ids({ query: "siauliai" }), ["svc-904"]);
  assert.deepEqual(ids({ query: "Šiauliai" }), ["svc-904"]);
  assert.deepEqual(ids({ query: "riga" }), ["svc-903"]);
  assert.deepEqual(ids({ query: "parnu" }), ["svc-905"]);
});

test("AC3.1 free text matches provider, category names, tags, country names and city aliases", () => {
  assert.deepEqual(ids({ query: "Žirklės" }), ["svc-904"]);
  assert.deepEqual(sorted({ query: "valymas" }), ["svc-903", "svc-906"]);
  assert.deepEqual(ids({ query: "matematika" }), ["svc-905"]);
  assert.deepEqual(ids({ query: "Latvija" }), ["svc-903"]);
  assert.deepEqual(ids({ query: "Estonia" }), ["svc-905"]);
  assert.deepEqual(ids({ query: "Ryga" }), ["svc-903"]);
});

test("AC3.2 word endings: inflected Lithuanian words still match", () => {
  assert.deepEqual(sorted({ query: "Vilniuje" }), ["svc-901", "svc-906"]);
  assert.deepEqual(sorted({ query: "santechniko" }), ["svc-901", "svc-902"]);
  assert.deepEqual(ids({ query: "Kaune" }), ["svc-902"]);
  assert.deepEqual(sorted({ query: "plumbing" }), ["svc-901", "svc-902"]);
});

test("AC3.3 a query with no usable words counts as no query", () => {
  assert.equal(searchServices(catalog, { query: "ir" }, WED_1000).total, 6);
  assert.equal(searchServices(catalog, { query: "   " }, WED_1000).total, 6);
});

test("AC3.3 a word that matches nothing is ignored when another word matches", () => {
  assert.deepEqual(sorted({ query: "santechnikas xyzzy" }), ["svc-901", "svc-902"]);
});

test("AC3.3 when no word matches anything the result is empty", () => {
  const result = searchServices(catalog, { query: "xyzzy" }, WED_1000);
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
});

test("AC3.3 more matched words rank higher", () => {
  assert.deepEqual(ids({ query: "langų valymas" }), ["svc-906", "svc-903"]);
});

test("AC3.3 title and category matches count double", () => {
  // svc-904 has the best rating but mentions "cleaning" only in its description.
  assert.deepEqual(ids({ query: "cleaning" }), ["svc-906", "svc-903", "svc-904"]);
});

test("AC3.4 single filters", () => {
  assert.deepEqual(sorted({ category: "cleaning" }), ["svc-903", "svc-906"]);
  assert.deepEqual(sorted({ country: "LT" }), ["svc-901", "svc-902", "svc-904", "svc-906"]);
  assert.deepEqual(sorted({ minRating: 4.8 }), ["svc-901", "svc-904", "svc-906"]);
  assert.deepEqual(sorted({ travelsToClient: false }), ["svc-904", "svc-905"]);
  assert.deepEqual(sorted({ travelsToClient: true }), ["svc-901", "svc-902", "svc-903", "svc-906"]);
  assert.deepEqual(sorted({ priceUnit: "hour" }), ["svc-901", "svc-902", "svc-905"]);
});

test("AC3.4 city and language ignore case and diacritics; city accepts an alias", () => {
  assert.deepEqual(ids({ city: "riga" }), ["svc-903"]);
  assert.deepEqual(ids({ city: "Rīga" }), ["svc-903"]);
  assert.deepEqual(ids({ city: "Ryga" }), ["svc-903"]);
  assert.deepEqual(ids({ city: "SIAULIAI" }), ["svc-904"]);
  assert.deepEqual(ids({ city: "pernu" }), ["svc-905"]);
  assert.deepEqual(sorted({ language: "RU" }), ["svc-902", "svc-903"]);
});

test("AC3.4 a city outside the given country gives an empty list", () => {
  assert.deepEqual(ids({ city: "Rīga", country: "LT" }), []);
});

test("AC3.4 filters combine with AND, also with a query", () => {
  assert.deepEqual(ids({ category: "cleaning", country: "LT" }), ["svc-906"]);
  assert.deepEqual(ids({ query: "santechnikas", city: "Kaunas" }), ["svc-902"]);
  assert.deepEqual(ids({ query: "santechnikas", language: "en" }), ["svc-901"]);
});

test("AC3.4 openNow means inside working hours right now", () => {
  assert.deepEqual(sorted({ openNow: true }, WED_1000), ["svc-901", "svc-902", "svc-903", "svc-904", "svc-906"]);
  assert.deepEqual(sorted({ openNow: true }, WED_2100), ["svc-901"]); // only the emergency provider
  assert.equal(searchServices(catalog, { openNow: false }, WED_2100).total, 6); // false does not filter
});

test("AC4.5 availableWithinDays uses the next free date; 0 means today", () => {
  assert.deepEqual(sorted({ availableWithinDays: 0 }), ["svc-901", "svc-906"]);
  assert.deepEqual(sorted({ availableWithinDays: 1 }), ["svc-901", "svc-903", "svc-906"]);
  assert.deepEqual(sorted({ availableWithinDays: 2 }), ["svc-901", "svc-902", "svc-903", "svc-906"]);
  assert.deepEqual(sorted({ availableWithinDays: 3 }), ["svc-901", "svc-902", "svc-903", "svc-904", "svc-906"]);
  assert.equal(searchServices(catalog, { availableWithinDays: 12 }, WED_1000).total, 6);
  // After closing, the lead-time-0 provider is no longer free today; the emergency one is.
  assert.deepEqual(sorted({ availableWithinDays: 0 }, WED_1830), ["svc-901"]);
});

test("AC3.4 open now but booked: openNow keeps it, availableWithinDays 0 does not", () => {
  assert.ok(ids({ openNow: true }).includes("svc-904"));
  assert.ok(!ids({ availableWithinDays: 0 }).includes("svc-904"));
});

test("AC3.5 priceMax compares the starting price and warns when units are mixed", () => {
  const result = searchServices(catalog, { priceMax: 25 }, WED_1000);
  assert.deepEqual(result.items.map((i) => i.listing.id).sort(), ["svc-902", "svc-903", "svc-904", "svc-905"]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /priceUnit/);
});

test("AC3.5 priceMax at the exact price is included; with priceUnit there is no warning", () => {
  const result = searchServices(catalog, { priceMax: 25, priceUnit: "hour" }, WED_1000);
  assert.deepEqual(result.items.map((i) => i.listing.id).sort(), ["svc-902", "svc-905"]);
  assert.deepEqual(result.warnings, []);
});

test("AC3.5 price sorting without priceUnit warns; no warning when only one unit is left", () => {
  assert.equal(searchServices(catalog, { sortBy: "price_asc" }, WED_1000).warnings.length, 1);
  assert.deepEqual(searchServices(catalog, { sortBy: "price_asc", category: "plumbing" }, WED_1000).warnings, []);
  assert.deepEqual(searchServices(catalog, { sortBy: "price_asc", priceUnit: "hour" }, WED_1000).warnings, []);
});

test("AC3.6 price sorts", () => {
  assert.deepEqual(ids({ sortBy: "price_asc" }), ["svc-903", "svc-904", "svc-902", "svc-905", "svc-901", "svc-906"]);
  assert.deepEqual(ids({ sortBy: "price_desc" }), ["svc-906", "svc-901", "svc-905", "svc-902", "svc-904", "svc-903"]);
});

test("AC3.6 rating sort: average, then count, then id", () => {
  assert.deepEqual(ids({ sortBy: "rating" }), ["svc-904", "svc-901", "svc-906", "svc-903", "svc-902", "svc-905"]);
});

test("AC3.6 relevance without a query behaves as rating", () => {
  assert.deepEqual(ids({ sortBy: "relevance" }), ids({ sortBy: "rating" }));
});

test("AC3.6 relevance with a query: equal scores fall back to rating, then id", () => {
  assert.deepEqual(ids({ query: "plumber" }), ["svc-901", "svc-902"]);
  assert.deepEqual(ids({ query: "valymas" }), ["svc-906", "svc-903"]);
});

test("AC3.6 a query with another sort uses that sort", () => {
  assert.deepEqual(ids({ query: "santechnikas", sortBy: "price_asc" }), ["svc-902", "svc-901"]);
});

test("AC3.6 soonest: next free date, then open now, then rating, then id", () => {
  assert.deepEqual(ids({ sortBy: "soonest" }, WED_1000), ["svc-901", "svc-906", "svc-903", "svc-902", "svc-904", "svc-905"]);
  // 18:30: svc-906 (closed, free Thursday) and svc-903 (open, free Thursday) tie on date; the open one goes first.
  assert.deepEqual(ids({ sortBy: "soonest" }, WED_1830).slice(0, 3), ["svc-901", "svc-903", "svc-906"]);
});

test("AC3.7 limit and offset page the items; total is the count before paging", () => {
  const page = searchServices(catalog, { limit: 2, offset: 1 }, WED_1000);
  assert.equal(page.total, 6);
  assert.equal(page.offset, 1);
  assert.deepEqual(page.items.map((i) => i.listing.id), ["svc-901", "svc-906"]);
  const beyond = searchServices(catalog, { limit: 2, offset: 10 }, WED_1000);
  assert.equal(beyond.total, 6);
  assert.deepEqual(beyond.items, []);
});

test("AC3.8 filters that match nothing return an empty list, not an error", () => {
  assert.deepEqual(ids({ category: "no-such-category" }), []);
  assert.deepEqual(ids({ city: "Paris" }), []);
  assert.deepEqual(ids({ minRating: 5 }), []);
});

test("each item carries the computed availability", () => {
  const [first] = searchServices(catalog, { query: "Kaune" }, WED_1000).items;
  assert.equal(first.listing.id, "svc-902");
  assert.deepEqual(first.availability, {
    openNow: true, todayHours: ["08:00", "17:00"], nextFreeDate: "2026-11-27", daysUntilFree: 2, leadTimeDays: 2, emergency: false,
  });
});

test("search does not change the catalog", () => {
  const before = JSON.stringify(catalog);
  searchServices(catalog, { query: "valymas", sortBy: "price_desc", limit: 1 }, WED_1000);
  assert.equal(JSON.stringify(catalog), before);
});

test("real data: the queries named in the plan find the expected listings", () => {
  const real = (filters) => searchServices(data, filters, WED_1000);
  const plumbing = real({ query: "santechnikas" });
  assert.ok(plumbing.total >= 5);
  assert.ok(plumbing.items.slice(0, 5).every((i) => i.listing.category === "plumbing"));
  assert.ok(real({ query: "plumber" }).items.some((i) => i.listing.id === "svc-001"));

  const siauliai = real({ query: "siauliai" });
  assert.equal(siauliai.total, 4);
  assert.ok(siauliai.items.every((i) => i.listing.location.city === "Šiauliai"));

  const rigaIds = new Set(real({ query: "riga" }).items.map((i) => i.listing.id));
  for (const l of data.listings.filter((x) => x.location.city === "Rīga")) assert.ok(rigaIds.has(l.id), l.id);
  assert.equal(real({ city: "Ryga" }).total, 8);
  assert.equal(real({ city: "parnu" }).total, 2);
  assert.equal(real({ city: "Talinas" }).total, 7);
  assert.ok(real({ query: "elektrikas Taline" }).items.length > 0);
});
