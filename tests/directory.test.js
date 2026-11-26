import { test } from "node:test";
import assert from "node:assert/strict";
import { createDirectory, DirectoryError, searchWords, sortFor, SORT_OPTIONS } from "../public/js/directory.js";
import { createListingReader } from "../public/js/listing-input.js";
import { hasWordStartingWith } from "../public/js/text.js";
import * as vocabulary from "../public/js/vocabulary.js";
import * as data from "../catalog/data.js";
import { searchServices } from "./support/reference-search.js";

const WED_1000 = new Date("2026-11-25T08:00:00Z"); // Wednesday 10:00 in Vilnius
const ok = (body) => ({ ok: true, status: 200, data: body });

/** A Supabase client that records what it was asked and answers what the test says. */
function fakeClient(answers = {}) {
  const calls = [];
  const method = (name) => async (...args) => {
    calls.push([name, ...args]);
    const answer = answers[name];
    return typeof answer === "function" ? answer(...args) : answer ?? { ok: false, status: 0, data: null };
  };
  return { calls, rpc: method("rpc"), select: method("select"), insert: method("insert") };
}

const emptyResult = { total: 0, all: 60, mixedUnits: false, items: [] };
const setup = (answers, token) => {
  const client = fakeClient(answers);
  return { client, directory: createDirectory({ client, catalog: vocabulary, token }) };
};

// A listing as the form reader returns it, and the same one as a row a visitor stored.
const read = createListingReader(vocabulary);
const formInput = {
  title: "Dviračių remontas namuose", category: "auto-repair",
  description: "Taisau miesto ir kalnų dviračius kliento namuose arba savo dirbtuvėse Vilniuje.", tags: "dviračiai, remontas",
  providerName: "Ratų Meistras", providerType: "individual", yearsExperience: "7", phone: "+370 000 12345", email: "labas@ratumeistras.example",
  country: "LT", city: "Vilnius", address: "Bandomoji g. 301", postalCode: "LT-01103", travelsToClient: true, radiusKm: "15", remote: false,
  priceFrom: "15", priceTo: "", priceUnit: "hour", calloutFee: "", negotiable: false, languages: ["lt", "en"],
  hours: { mon: { open: "09:00", close: "18:00" }, wed: { open: "09:00", close: "18:00" } }, leadTimeDays: "2", emergency: false,
};
const visitorListing = read(formInput).listing;
const visitorRow = (overrides = {}) => ({ added: true, score: 0, data: { ...visitorListing, id: "svc-10001", ...overrides } });

test("sortFor: relevance needs search words; without them, and for an unknown sort, it is rating", () => {
  assert.deepEqual(SORT_OPTIONS, ["relevance", "rating", "price_asc", "price_desc", "soonest"]);
  assert.equal(sortFor({}), "rating");
  assert.equal(sortFor(undefined), "rating");
  assert.equal(sortFor({ query: "valymas" }), "relevance");
  assert.equal(sortFor({ query: "ab" }), "rating", "words shorter than 3 letters are not search words");
  assert.equal(sortFor({ sortBy: "relevance" }), "rating");
  assert.equal(sortFor({ query: "valymas", sortBy: "price_asc" }), "price_asc");
  assert.equal(sortFor({ sortBy: "cheapest" }), "rating");
  // The reference search, which the database is checked against, picks the same sort.
  for (const filters of [{}, { query: "valymas" }, { sortBy: "relevance" }, { query: "ab cd" }, { sortBy: "soonest" }, { sortBy: "nope", query: "remontas" }]) {
    assert.equal(sortFor(filters), searchServices(data, filters, WED_1000).sortBy, JSON.stringify(filters));
  }
});

test("searchWords: title and category are strong; description, provider, tags, city, its other spellings and the country are weak", () => {
  const listing = data.listings.find((l) => l.location.city === "Rīga");
  const { strong, weak } = searchWords(listing, vocabulary);
  assert.match(strong, /^( [\p{L}\p{N}]+)+$/u);
  assert.match(weak, /^( [\p{L}\p{N}]+)+$/u);
  assert.equal(strong, strong.toLowerCase());
  assert.doesNotMatch(strong + weak, /\p{M}|[āčēģīķļņšūž]/u, "no diacritics are left");
  for (const word of ["riga", "ryga", "latvija", "latvia"]) assert.ok(hasWordStartingWith(weak, word), word);
  const category = vocabulary.categories.find((c) => c.id === listing.category);
  for (const word of category.nameEn.toLowerCase().split(" ").filter((w) => w.length > 3)) assert.ok(hasWordStartingWith(strong, word), word);
  // Every listing of the catalog has words within what the database accepts.
  for (const each of data.listings) {
    const words = searchWords(each, vocabulary);
    assert.ok(words.strong.length > 5 && words.strong.length <= 2000, each.id);
    assert.ok(words.weak.length > 20 && words.weak.length <= 8000, each.id);
  }
});

test("search: the filters go to the database function by name, with the query as word stems", async () => {
  const { client, directory } = setup({ rpc: ok(emptyResult) });
  await directory.search({
    query: "Santechnikas Vilniuje ir", category: "plumbing", country: "lt", city: "ryga", priceMax: 40, priceUnit: "hour", minRating: 4.5,
    language: "RU", travelsToClient: false, openNow: true, availableWithinDays: 2, sortBy: "soonest", limit: 20, offset: 40,
  }, WED_1000);
  assert.deepEqual(client.calls, [["rpc", "search_listings", {
    p_stems: ["santechnik", "vilniu"],
    p_category: "plumbing",
    p_country: "LT",
    p_city: "Rīga",
    p_price_max: 40,
    p_price_unit: "hour",
    p_min_rating: 4.5,
    p_language: "ru",
    p_travels: false,
    p_open_now: true,
    p_within_days: 2,
    p_sort: "soonest",
    p_limit: 20,
    p_offset: 40,
    p_now: "2026-11-25T08:00:00.000Z",
  }]]);
});

test("search: a filter that is not given is not sent, so the database uses its default", async () => {
  const { client, directory } = setup({ rpc: ok(emptyResult) });
  await directory.search(undefined, WED_1000);
  await directory.search({ travelsToClient: "yes", openNow: "yes", offset: -5, limit: 2.5, city: "Atlantis" }, WED_1000);
  const sent = client.calls.map(([, , args]) => JSON.parse(JSON.stringify(args)));
  assert.deepEqual(sent[0], { p_stems: [], p_open_now: false, p_sort: "rating", p_offset: 0, p_now: "2026-11-25T08:00:00.000Z" });
  // A city the directory does not have is sent as it is, and matches nothing.
  assert.deepEqual(sent[1], { p_stems: [], p_city: "Atlantis", p_open_now: false, p_sort: "rating", p_offset: 0, p_now: "2026-11-25T08:00:00.000Z" });
});

test("search: the answer has the listings with their availability at the asked moment", async () => {
  const [first, second] = data.listings;
  const { directory } = setup({ rpc: ok({ total: 37, all: 10_000, mixedUnits: true, items: [{ data: first, added: false, score: 4 }, { data: second, added: false, score: 2 }] }) });
  const result = await directory.search({ query: "santechnikas", offset: 20, limit: 2 }, WED_1000);
  assert.equal(result.total, 37);
  assert.equal(result.all, 10_000);
  assert.equal(result.offset, 20);
  assert.equal(result.sortBy, "relevance");
  assert.deepEqual(result.items.map((item) => [item.listing.id, item.score]), [[first.id, 4], [second.id, 2]]);
  assert.equal(result.items[0].listing, first, "a listing of the catalog is taken as it is");
  // The same availability as the reference search works out for these listings.
  const expected = searchServices({ ...data, listings: [first, second] }, {}, WED_1000).items;
  for (const item of result.items) assert.deepEqual(item.availability, expected.find((e) => e.listing.id === item.listing.id).availability);
  // Prices were not compared, so mixed units need no warning.
  assert.deepEqual(result.warnings, []);
});

test("search: the mixed-units warning is given only when prices were compared without a unit", async () => {
  const mixed = setup({ rpc: ok({ ...emptyResult, mixedUnits: true }) }).directory;
  assert.equal((await mixed.search({ priceMax: 30 }, WED_1000)).warnings.length, 1);
  assert.equal((await mixed.search({ sortBy: "price_asc" }, WED_1000)).warnings.length, 1);
  assert.equal((await mixed.search({ sortBy: "price_desc" }, WED_1000)).warnings.length, 1);
  assert.match((await mixed.search({ priceMax: 30 }, WED_1000)).warnings[0], /priceUnit/);
  assert.deepEqual((await mixed.search({ priceMax: 30, priceUnit: "hour" }, WED_1000)).warnings, []);
  assert.deepEqual((await mixed.search({ minRating: 4 }, WED_1000)).warnings, []);
  const same = setup({ rpc: ok(emptyResult) }).directory;
  assert.deepEqual((await same.search({ priceMax: 30 }, WED_1000)).warnings, []);
});

test("search: a visitor's listing goes through the checks of the form again; one that fails them is left out", async () => {
  const rows = [
    visitorRow(),
    visitorRow({ id: "svc-10002", provider: undefined }),
    visitorRow({ id: "svc-10003", title: "x" }),
    visitorRow({ id: "svc-10004", location: { ...visitorListing.location, city: "Atlantis" } }),
    visitorRow({ id: "svc-10005", tags: "not a list" }),
    visitorRow({ id: "10006" }),
    { added: true, data: null },
    { added: true },
    null,
    visitorRow({ id: "svc-10007", extra: "<b>dropped</b>" }),
  ];
  const { directory } = setup({ rpc: ok({ total: rows.length, all: 10_010, mixedUnits: false, items: rows }) });
  const result = await directory.search({}, WED_1000);
  assert.deepEqual(result.items.map((item) => item.listing.id), ["svc-10001", "svc-10007"]);
  assert.deepEqual(result.items[0].listing, { ...visitorListing, id: "svc-10001", added: true });
  // Only what the form knows comes through.
  assert.equal(result.items[1].listing.extra, undefined);
  // The count is the database's: it says how many matched, not how many could be shown.
  assert.equal(result.total, rows.length);
});

test("search: a database that does not answer, or answers something else, rejects with a DirectoryError", async () => {
  const answers = [
    { ok: false, status: 0, data: null },
    { ok: false, status: 500, data: { message: "boom" } },
    { ok: false, status: 404, data: { code: "PGRST202", message: "Could not find the function" } },
    ok(null),
    ok([]),
    ok({ total: 1 }),
  ];
  for (const answer of answers) {
    const { directory } = setup({ rpc: answer });
    await assert.rejects(directory.search({}, WED_1000), DirectoryError, JSON.stringify(answer));
  }
  const { directory } = setup({ rpc: { ok: false, status: 503, data: { message: "down" } } });
  await assert.rejects(directory.search({}, WED_1000), (error) => error.status === 503 && error.message === "down");
});

test("get: one listing by its number, or null", async () => {
  const [first] = data.listings;
  const found = setup({ select: ok([{ data: first, added: false }]) });
  assert.equal(await found.directory.get(1), first);
  assert.deepEqual(found.client.calls, [["select", "listings", { select: "data,added", number: "eq.1" }]]);

  assert.equal(await setup({ select: ok([]) }).directory.get(999), null);
  assert.deepEqual((await setup({ select: ok([visitorRow()]) }).directory.get(10_001)).added, true);
  assert.equal(await setup({ select: ok([visitorRow({ title: "" })]) }).directory.get(10_001), null, "a visitor's listing that fails the checks is not shown");

  // What cannot be a number of a listing is not asked for.
  const none = setup({ select: ok([{ data: first, added: false }]) });
  for (const number of [0, -1, 1.5, NaN, "1", undefined]) assert.equal(await none.directory.get(number), null);
  assert.deepEqual(none.client.calls, []);

  await assert.rejects(setup({}).directory.get(1), DirectoryError);
});

test("notes: the agent notes of one listing by its number, or null", async () => {
  const row = { response_hours: 4, prepare: "A photo of the problem.", offer_code: "MCP-61-K7Q2", offer_percent: 10 };
  const found = setup({ select: ok([row]) });
  assert.deepEqual(await found.directory.notes(61), {
    responseHours: 4,
    prepare: "A photo of the problem.",
    agentOffer: { code: "MCP-61-K7Q2", discountPercent: 10 },
  });
  assert.deepEqual(found.client.calls, [
    ["select", "agent_notes", { select: "response_hours,prepare,offer_code,offer_percent", number: "eq.61" }],
  ]);

  // A listing that a visitor added has no row.
  assert.equal(await setup({ select: ok([]) }).directory.notes(10_001), null);
  // A row this page cannot read is left out instead of being passed on half-filled.
  for (const broken of [{ ...row, response_hours: "4" }, { ...row, prepare: null }, { ...row, offer_code: undefined }, { ...row, offer_percent: 2.5 }, null, "x"]) {
    assert.equal(await setup({ select: ok([broken]) }).directory.notes(61), null, JSON.stringify(broken));
  }
  assert.equal(await setup({ select: ok({ message: "not a list" }) }).directory.notes(61), null);

  const none = setup({ select: ok([row]) });
  for (const number of [0, -1, 1.5, NaN, "1", undefined]) assert.equal(await none.directory.notes(number), null);
  assert.deepEqual(none.client.calls, []);

  await assert.rejects(setup({}).directory.notes(1), DirectoryError);
});

test("counts: the numbers of the database, with empty tables where it gave none", async () => {
  const counts = { total: 61, categories: { plumbing: 5 }, cities: { Vilnius: 13 }, priceUnits: { hour: 30 }, languages: { lt: 40 } };
  const { client, directory } = setup({ rpc: ok(counts) });
  assert.deepEqual(await directory.counts(), counts);
  assert.deepEqual(client.calls, [["rpc", "listing_counts"]]);
  assert.deepEqual(await setup({ rpc: ok({ total: "x", cities: [] }) }).directory.counts(), { total: 0, categories: {}, cities: {}, priceUnits: {}, languages: {} });
  await assert.rejects(setup({}).directory.counts(), DirectoryError);
});

test("add: the listing is stored as the signed-in person, with its search words, and comes back with its id", async () => {
  const { client, directory } = setup({ insert: { ok: true, status: 201, data: [visitorRow({ id: "svc-10042" })] } }, async () => "user-token");
  const result = await directory.add(visitorListing);
  assert.deepEqual(result, { ok: true, listing: { ...visitorListing, id: "svc-10042", added: true } });
  assert.equal(client.calls.length, 1);
  const [, table, row, options] = client.calls[0];
  assert.equal(table, "listings");
  // The number, the owner and the id are the database's to decide: none of them is sent.
  assert.deepEqual(Object.keys(row).sort(), ["data", "strong", "weak"]);
  assert.equal(row.data, visitorListing);
  assert.equal(row.data.id, undefined);
  assert.deepEqual({ strong: row.strong, weak: row.weak }, searchWords(visitorListing, vocabulary));
  assert.ok(hasWordStartingWith(row.strong, "dviraci") && hasWordStartingWith(row.weak, "vilnius"));
  assert.deepEqual(options, { token: "user-token", select: "data,added" });
});

test("add: says why a listing was not saved, and never rejects", async () => {
  const signedIn = async () => "user-token";
  const cases = [
    [{ ok: false, status: 401, data: { code: "PGRST301", message: "JWT expired" } }, "signedOut"],
    [{ ok: false, status: 400, data: { code: "P0001", message: "A visitor can add at most 50 listings." } }, "limit"],
    [{ ok: false, status: 409, data: { code: "23503", message: "violates foreign key constraint" } }, "refused"],
    [{ ok: false, status: 400, data: { code: "23514", message: "violates check constraint" } }, "refused"],
    [{ ok: false, status: 403, data: { code: "42501", message: "permission denied" } }, "refused"],
    [{ ok: false, status: 500, data: null }, "unavailable"],
    [{ ok: false, status: 429, data: null }, "unavailable"],
    [{ ok: false, status: 0, data: null }, "unavailable"],
    // Stored, but what came back is not a listing this page can show.
    [{ ok: true, status: 201, data: [] }, "unavailable"],
    [{ ok: true, status: 201, data: [visitorRow({ title: "" })] }, "unavailable"],
  ];
  for (const [answer, reason] of cases) {
    const { directory } = setup({ insert: answer }, signedIn);
    assert.deepEqual(await directory.add(visitorListing), { ok: false, reason }, JSON.stringify(answer));
  }
  // Signed out, or a session that could not be renewed: the database is not asked.
  for (const token of [undefined, async () => null]) {
    const { client, directory } = setup({ insert: { ok: true, status: 201, data: [visitorRow()] } }, token);
    assert.deepEqual(await directory.add(visitorListing), { ok: false, reason: "signedOut" });
    assert.deepEqual(client.calls, []);
  }
});
