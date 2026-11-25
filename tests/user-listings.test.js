import { test } from "node:test";
import assert from "node:assert/strict";
import { createUserListings, STORAGE_KEY } from "../public/js/user-listings.js";
import { createListingReader } from "../public/js/listing-input.js";
import { STORAGE_KEY as AUTH_KEY } from "../public/js/auth.js";
import { searchServices } from "../public/js/search.js";
import { createTools } from "../public/js/tools.js";
import * as data from "../public/js/data.js";

function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const brokenStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};

const day = { open: "09:00", close: "18:00" };
const input = (overrides = {}) => ({
  title: "Dviračių remontas namuose",
  category: "auto-repair",
  description: "Taisau miesto ir kalnų dviračius kliento namuose arba savo dirbtuvėse Vilniuje.",
  tags: "dviračiai, remontas",
  providerName: "Ratų Meistras",
  providerType: "individual",
  yearsExperience: "7",
  phone: "+370 000 12345",
  email: "labas@ratumeistras.example",
  country: "LT",
  city: "Vilnius",
  address: "Bandomoji g. 301",
  postalCode: "LT-01103",
  travelsToClient: true,
  radiusKm: "15",
  remote: false,
  priceFrom: "25",
  priceTo: "",
  priceUnit: "hour",
  calloutFee: "",
  negotiable: false,
  languages: ["lt"],
  hours: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: null, sun: null },
  leadTimeDays: "2",
  emergency: false,
  ...overrides,
});

const WED_1000 = new Date("2026-11-25T08:00:00Z");

/** A page: its own copy of the catalog (60 listings, svc-001 to svc-060) and the given storage. */
function page(storage) {
  const catalog = { ...data, listings: [...data.listings] };
  const userListings = createUserListings({ catalog, read: createListingReader(catalog), storage });
  return { catalog, userListings, appended: userListings.sync() };
}

const storedRecords = (storage) => JSON.parse(storage.items.get(STORAGE_KEY));

test("new service: nothing is stored at the start and the catalog is as it was", () => {
  const { catalog, appended } = page(fakeStorage());
  assert.deepEqual(appended, []);
  assert.equal(catalog.listings.length, data.listings.length);
  assert.notEqual(STORAGE_KEY, AUTH_KEY);
});

test("new service: an added listing gets the next id, goes to the end of the catalog and into the storage", () => {
  const storage = fakeStorage();
  const { catalog, userListings } = page(storage);
  const result = userListings.add(input(), "jonas");

  assert.equal(result.ok, true);
  assert.equal(result.saved, true);
  assert.equal(result.listing.id, "svc-61");
  assert.equal(result.listing.addedBy, "jonas");
  assert.equal(result.listing.title, "Dviračių remontas namuose");
  assert.equal(catalog.listings.length, data.listings.length + 1);
  assert.equal(catalog.listings.at(-1), result.listing);
  assert.equal(data.listings.length, 60, "the data module itself is not changed");

  const records = storedRecords(storage);
  assert.equal(records.length, 1);
  assert.deepEqual(Object.keys(records[0]), ["id", "addedBy", "input"]);
  assert.equal(records[0].id, "svc-61");
  assert.equal(records[0].addedBy, "jonas");
  assert.equal(records[0].input.title, "Dviračių remontas namuose");
});

test("new service: a second listing gets the id after it and both are stored", () => {
  const storage = fakeStorage();
  const { userListings } = page(storage);
  userListings.add(input(), "jonas");
  const second = userListings.add(input({ title: "Paspirtukų remontas" }), "ona");
  assert.equal(second.listing.id, "svc-62");
  assert.deepEqual(storedRecords(storage).map((record) => [record.id, record.addedBy]), [["svc-61", "jonas"], ["svc-62", "ona"]]);
});

test("new service: wrong input adds nothing and stores nothing", () => {
  const storage = fakeStorage();
  const { catalog, userListings } = page(storage);
  const result = userListings.add(input({ title: "", priceFrom: "0" }), "jonas");
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.field), ["title", "priceFrom"]);
  assert.equal(result.listing, undefined);
  assert.equal(catalog.listings.length, data.listings.length);
  assert.equal(storage.items.size, 0);
});

test("new service: stored listings come back after a reload, with the same ids and content", () => {
  const storage = fakeStorage();
  const before = page(storage);
  const first = before.userListings.add(input(), "jonas").listing;
  const second = before.userListings.add(input({ title: "Paspirtukų remontas", emergency: true }), "ona").listing;

  const after = page(storage);
  assert.deepEqual(after.appended, [first, second]);
  assert.deepEqual(after.catalog.listings.slice(-2), [first, second]);
  assert.equal(after.userListings.add(input(), "jonas").listing.id, "svc-63");
});

test("new service: the search and the tools find a listing added after they were first used", () => {
  const { catalog, userListings } = page(fakeStorage());
  const tools = Object.fromEntries(createTools({ catalog, now: () => WED_1000 }).map((tool) => [tool.name, tool]));

  // Use everything once, so that the search index and the id lookup exist before the listing does.
  assert.equal(searchServices(catalog, { query: "paspirtukų" }, WED_1000).total, 0);
  assert.equal(tools.get_service.execute({ id: "svc-61" }).error.field, "id");
  assert.equal(tools.list_service_filters.execute().totalListings, 60);

  const { listing } = userListings.add(input({ title: "Paspirtukų remontas", tags: "paspirtukai" }), "jonas");

  assert.deepEqual(searchServices(catalog, { query: "paspirtukų" }, WED_1000).items.map((item) => item.listing.id), [listing.id]);
  assert.equal(searchServices(catalog, {}, WED_1000).total, 61);
  assert.equal(tools.search_services.execute({ query: "paspirtukai", city: "vilnius" }).results[0].id, listing.id);
  const { service } = tools.get_service.execute({ id: "SVC-00061" });
  assert.equal(service.id, "svc-61");
  assert.equal(service.addedBy, undefined, "the tools do not say who added a listing");
  assert.equal(tools.list_service_filters.execute().totalListings, 61);
});

test("new service: a listing added in another tab is taken in by sync, once", () => {
  const storage = fakeStorage();
  const here = page(storage);
  const there = page(storage);
  const added = there.userListings.add(input(), "ona").listing;

  assert.deepEqual(here.userListings.sync(), [added]);
  assert.deepEqual(here.userListings.sync(), []);
  assert.equal(here.catalog.listings.length, data.listings.length + 1);
});

test("new service: two tabs adding one after the other do not use the same id", () => {
  const storage = fakeStorage();
  const here = page(storage);
  const there = page(storage);
  assert.equal(there.userListings.add(input({ title: "Pirmoji paslauga" }), "ona").listing.id, "svc-61");
  // This tab has not heard of svc-61 yet; add() looks into the storage first.
  assert.equal(here.userListings.add(input({ title: "Antroji paslauga" }), "jonas").listing.id, "svc-62");
  assert.deepEqual(here.catalog.listings.slice(-2).map((listing) => listing.title), ["Pirmoji paslauga", "Antroji paslauga"]);
  assert.deepEqual(storedRecords(storage).map((record) => record.id), ["svc-61", "svc-62"]);
});

test("new service: damaged storage entries are left out and do not stop the page", () => {
  const good = { id: "svc-70", addedBy: "jonas", input: input() };
  const records = [
    null, "text", 5, [],
    { id: "svc-71", addedBy: "jonas", input: input({ title: "" }) },   // no longer valid
    { id: "svc-72", addedBy: "jonas" },                                // no input
    { id: "svc-001", addedBy: "jonas", input: input() },               // id of a catalog listing
    { id: "svc-0001", addedBy: "jonas", input: input() },              // the same listing, padded differently
    { id: "other-5", addedBy: "jonas", input: input() },
    { id: 73, addedBy: "jonas", input: input() },
    good,
    { ...good },                                                       // twice
    { id: "svc-74", addedBy: { name: "x" }, input: input() },          // who added it is not a string
  ];
  const { catalog, appended, userListings } = page(fakeStorage({ [STORAGE_KEY]: JSON.stringify(records) }));
  assert.deepEqual(appended.map((listing) => [listing.id, listing.addedBy]), [["svc-70", "jonas"], ["svc-74", ""]]);
  assert.equal(catalog.listings.length, data.listings.length + 2);
  assert.equal(userListings.add(input(), "ona").listing.id, "svc-75");

  for (const value of ["not json", "{}", "null", '"text"', "5"]) {
    const storage = fakeStorage({ [STORAGE_KEY]: value });
    const damaged = page(storage);
    assert.deepEqual(damaged.appended, [], value);
    const result = damaged.userListings.add(input(), "jonas");
    assert.equal(result.saved, true, value);
    assert.deepEqual(storedRecords(storage).map((record) => record.id), ["svc-61"], value);
  }
});

test("new service: stored input cannot make a listing verified or rated", () => {
  const record = { id: "svc-70", addedBy: "jonas", input: { ...input(), verified: true, rating: { average: 5, count: 500 } }, verified: true };
  const { appended } = page(fakeStorage({ [STORAGE_KEY]: JSON.stringify([record]) }));
  assert.equal(appended[0].provider.verified, false);
  assert.deepEqual(appended[0].rating, { average: 0, count: 0 });
});

test("new service: without a working storage the listing is added for this page and reported as not saved", () => {
  for (const storage of [undefined, brokenStorage]) {
    const { catalog, appended, userListings } = page(storage);
    assert.deepEqual(appended, []);
    const result = userListings.add(input(), "jonas");
    assert.equal(result.ok, true);
    assert.equal(result.saved, false);
    assert.equal(catalog.listings.at(-1), result.listing);
    assert.equal(userListings.add(input(), "jonas").listing.id, "svc-62");
  }
});

test("new service: a storage that is full keeps what it had and reports the listing as not saved", () => {
  const storage = fakeStorage();
  const { userListings } = page(storage);
  userListings.add(input(), "jonas");
  storage.setItem = () => { throw new Error("quota"); };
  const result = userListings.add(input(), "jonas");
  assert.equal(result.ok, true);
  assert.equal(result.saved, false);
  assert.deepEqual(storedRecords(storage).map((record) => record.id), ["svc-61"]);
});
