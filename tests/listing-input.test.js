import { test } from "node:test";
import assert from "node:assert/strict";
import { createListingReader, INPUT_FIELDS, LIMITS, WEEKDAY_LABEL } from "../public/js/listing-input.js";
import { searchServices } from "../public/js/search.js";
import { createTools } from "../public/js/tools.js";
import * as data from "../public/js/data.js";

const read = createListingReader(data);

const weekHours = {
  mon: { open: "09:00", close: "18:00" }, tue: { open: "09:00", close: "18:00" }, wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" }, fri: { open: "09:00", close: "17:00" }, sat: null, sun: null,
};

// What the page sends for a filled-in form: every text and number field is a string, every checkbox a boolean.
const valid = (overrides = {}) => ({
  title: "Dviračių remontas namuose",
  category: "auto-repair",
  description: "Taisau miesto ir kalnų dviračius kliento namuose arba savo dirbtuvėse Vilniuje.",
  tags: "dviračiai, remontas",
  providerName: "Ratų Meistras",
  providerType: "individual",
  yearsExperience: "7",
  phone: "+370 000 12345",
  email: "Labas@Ratumeistras.example",
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
  languages: ["lt", "en"],
  hours: weekHours,
  leadTimeDays: "2",
  emergency: false,
  ...overrides,
});

const errorsOf = (overrides) => {
  const result = read(valid(overrides));
  assert.equal(result.ok, false, "the input is refused");
  return result.errors;
};
const fieldsOf = (overrides) => errorsOf(overrides).map((error) => error.field);

test("new service: a filled-in form becomes a listing in the catalog's shape", () => {
  const result = read(valid());
  assert.equal(result.ok, true);
  assert.deepEqual(result.listing, {
    category: "auto-repair",
    title: "Dviračių remontas namuose", titleEn: "Dviračių remontas namuose",
    description: "Taisau miesto ir kalnų dviračius kliento namuose arba savo dirbtuvėse Vilniuje.",
    descriptionEn: "Taisau miesto ir kalnų dviračius kliento namuose arba savo dirbtuvėse Vilniuje.",
    tags: ["dviračiai", "remontas"],
    provider: { name: "Ratų Meistras", type: "individual", yearsExperience: 7, verified: false },
    contact: { phone: "+370 000 12345", email: "labas@ratumeistras.example" },
    location: { country: "LT", city: "Vilnius", address: "Bandomoji g. 301", postalCode: "LT-01103" },
    serviceArea: { travelsToClient: true, radiusKm: 15, remote: false },
    price: { from: 25, unit: "hour", currency: "EUR", negotiable: false },
    rating: { average: 0, count: 0 },
    languages: ["lt", "en"],
    availability: {
      hours: {
        mon: ["09:00", "18:00"], tue: ["09:00", "18:00"], wed: ["09:00", "18:00"], thu: ["09:00", "18:00"],
        fri: ["09:00", "17:00"], sat: null, sun: null,
      },
      leadTimeDays: 2,
      emergency: false,
    },
  });
  assert.equal(result.listing.id, undefined, "the id is given by whoever stores the listing");
});

test("new service: the listing works in the search and in the tools like any other", () => {
  const listing = { ...read(valid()).listing, id: "svc-061" };
  const catalog = { ...data, listings: [...data.listings, listing] };
  const now = new Date("2026-11-25T08:00:00Z"); // Wednesday 10:00 in Vilnius

  const found = searchServices(catalog, { query: "dviračių remontas", city: "Vilnius", openNow: true }, now);
  assert.equal(found.items[0].listing.id, "svc-061");
  assert.equal(found.items[0].availability.nextFreeDate, "2026-11-27");

  const [search, get] = createTools({ catalog, now: () => now });
  assert.equal(search.execute({ query: "dviraciai" }).results[0].id, "svc-061");
  const { service } = get.execute({ id: "svc-061" });
  assert.equal(service.title, "Dviračių remontas namuose");
  assert.deepEqual(service.rating, { average: 0, count: 0 });
  assert.equal(service.contact.website, null);
});

test("new service: an unrated listing is not found with a minimum rating and sorts after the rated ones", () => {
  const listing = { ...read(valid()).listing, id: "svc-061" };
  const catalog = { ...data, listings: [...data.listings, listing] };
  const now = new Date("2026-11-25T08:00:00Z");
  assert.equal(searchServices(catalog, { minRating: 1 }, now).total, data.listings.length);
  assert.equal(searchServices(catalog, { sortBy: "rating" }, now).items.at(-1).listing.id, "svc-061");
});

test("new service: text is trimmed, tags are split and a decimal comma is a decimal point", () => {
  const { listing } = read(valid({
    title: "  Dviračių   remontas  ",
    tags: " ratai ; Ratai,grandinė\n stabdžiai ,, ",
    priceFrom: "12,5", priceTo: "30.999", calloutFee: "0",
    yearsExperience: 3,
    phone: " +370 (000) 12-345 ",
  }));
  assert.equal(listing.title, "Dviračių remontas");
  assert.equal(listing.titleEn, "Dviračių remontas");
  assert.deepEqual(listing.tags, ["ratai", "grandinė", "stabdžiai"]);
  assert.deepEqual(listing.price, { from: 12.5, unit: "hour", currency: "EUR", negotiable: false, to: 31, calloutFee: 0 });
  assert.equal(listing.provider.yearsExperience, 3);
  assert.equal(listing.contact.phone, "+370 (000) 12-345");
});

test("new service: tags are optional", () => {
  assert.deepEqual(read(valid({ tags: "" })).listing.tags, []);
  assert.deepEqual(read(valid({ tags: undefined })).listing.tags, []);
  assert.deepEqual(fieldsOf({ tags: Array.from({ length: LIMITS.tags + 1 }, (_, i) => `zodis${i}`).join(",") }), ["tags"]);
  assert.deepEqual(fieldsOf({ tags: "x".repeat(LIMITS.tagLength + 1) }), ["tags"]);
});

test("new service: an empty form lists every required field once, in the order of the form", () => {
  const result = read({});
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.field), [
    "title", "category", "description", "providerName", "providerType", "yearsExperience", "phone", "email",
    "country", "city", "address", "priceFrom", "priceUnit", "languages", "hours", "leadTimeDays",
  ]);
  for (const error of result.errors) assert.ok(error.message.length > 10, `${error.field} has a message`);
  for (const junk of [undefined, null, "text", 5, []]) assert.equal(read(junk).ok, false);
});

test("new service: text fields have a minimum and a maximum length", () => {
  for (const field of ["title", "description", "providerName", "address"]) {
    const [min, max] = LIMITS[field];
    assert.deepEqual(fieldsOf({ [field]: "a".repeat(min - 1) }), [field]);
    assert.deepEqual(fieldsOf({ [field]: "a".repeat(max + 1) }), [field]);
    assert.equal(read(valid({ [field]: "a".repeat(min) })).ok, true);
    assert.equal(read(valid({ [field]: "a".repeat(max) })).ok, true);
    assert.deepEqual(fieldsOf({ [field]: 123 }), [field]);
  }
});

test("new service: category, provider type, country and price unit must be known values", () => {
  for (const field of ["category", "providerType", "priceUnit"]) {
    assert.deepEqual(fieldsOf({ [field]: "other" }), [field]);
    assert.deepEqual(fieldsOf({ [field]: "" }), [field]);
  }
  // Without a country there is nothing to check the city against, but a known city is not reported twice.
  assert.deepEqual(fieldsOf({ country: "PL" }), ["country"]);
});

test("new service: the city must be one the catalog has in the chosen country", () => {
  assert.deepEqual(fieldsOf({ city: "" }), ["city"]);
  assert.deepEqual(fieldsOf({ city: "Atlantida" }), ["city"]);
  assert.deepEqual(fieldsOf({ city: "Rīga" }), ["city"], "a Latvian city with Lithuania chosen");
  const riga = read(valid({ country: "LV", city: "Rīga", postalCode: "LV-1050" }));
  assert.deepEqual(riga.listing.location, { country: "LV", city: "Rīga", address: "Bandomoji g. 301", postalCode: "LV-1050" });
});

test("new service: the postal code follows the country and is written the catalog's way", () => {
  const postal = (country, city, postalCode) => read(valid({ country, city, postalCode }));
  assert.equal(postal("LT", "Vilnius", "08318").listing.location.postalCode, "LT-08318");
  assert.equal(postal("LT", "Vilnius", "lt 08318").listing.location.postalCode, "LT-08318");
  assert.equal(postal("LV", "Rīga", "1024").listing.location.postalCode, "LV-1024");
  assert.equal(postal("EE", "Tallinn", "11216").listing.location.postalCode, "11216");
  for (const [country, city, code] of [["LT", "Vilnius", "1234"], ["LT", "Vilnius", ""], ["LV", "Rīga", "LV-12345"], ["EE", "Tallinn", "EE-11216"]]) {
    const result = postal(country, city, code);
    assert.deepEqual(result.errors?.map((error) => error.field), ["postalCode"], `${country} ${code}`);
    assert.match(result.errors[0].message, /pvz\./, "the message shows an example");
  }
});

test("new service: phone and email must look like a phone and an email", () => {
  for (const phone of ["", "12345", "abc 000 0000", "+370 000 00000 00000 00000", "+370 000 00x00"]) {
    assert.deepEqual(fieldsOf({ phone }), ["phone"], phone);
  }
  for (const email of ["", "vardas", "vardas@imone", "var das@imone.example", `${"a".repeat(LIMITS.emailLength)}@imone.example`]) {
    assert.deepEqual(fieldsOf({ email }), ["email"], email);
  }
});

test("new service: experience, travel distance and lead time are whole numbers within their limits", () => {
  for (const value of ["", "abc", "1.5", "-1", String(LIMITS.yearsExperience + 1)]) assert.deepEqual(fieldsOf({ yearsExperience: value }), ["yearsExperience"], value);
  for (const value of ["", "0", "2.5", String(LIMITS.radiusKm + 1)]) assert.deepEqual(fieldsOf({ radiusKm: value }), ["radiusKm"], value);
  for (const value of ["", "-1", "0.5", String(LIMITS.leadTimeDays + 1)]) assert.deepEqual(fieldsOf({ leadTimeDays: value }), ["leadTimeDays"], value);
  assert.equal(read(valid({ yearsExperience: "0", leadTimeDays: "0" })).ok, true);
});

test("new service: a provider who does not travel has no travel distance", () => {
  const { listing } = read(valid({ travelsToClient: false, radiusKm: "", remote: true }));
  assert.deepEqual(listing.serviceArea, { travelsToClient: false, radiusKm: 0, remote: true });
  // Only a real true counts: a checkbox sends a boolean.
  assert.equal(read(valid({ travelsToClient: "true", radiusKm: "" })).listing.serviceArea.travelsToClient, false);
});

test("new service: prices are positive, the upper price is not below the lower one", () => {
  for (const value of ["", "0", "-5", "abc", String(LIMITS.price + 1)]) assert.deepEqual(fieldsOf({ priceFrom: value }), ["priceFrom"], value);
  assert.deepEqual(fieldsOf({ priceFrom: "30", priceTo: "20" }), ["priceTo"]);
  assert.deepEqual(fieldsOf({ priceTo: "abc" }), ["priceTo"]);
  assert.deepEqual(fieldsOf({ calloutFee: "-1" }), ["calloutFee"]);
  assert.deepEqual(fieldsOf({ calloutFee: String(LIMITS.calloutFee + 1) }), ["calloutFee"]);
  const { price } = read(valid({ priceFrom: "30", priceTo: "30", calloutFee: "10", negotiable: true })).listing;
  assert.deepEqual(price, { from: 30, unit: "hour", currency: "EUR", negotiable: true, to: 30, calloutFee: 10 });
  // A wrong lower price is reported once; the upper price is then only checked on its own.
  assert.deepEqual(fieldsOf({ priceFrom: "", priceTo: "20" }), ["priceFrom"]);
});

test("new service: at least one known language, kept in the catalog's order", () => {
  assert.deepEqual(fieldsOf({ languages: [] }), ["languages"]);
  assert.deepEqual(fieldsOf({ languages: "lt" }), ["languages"]);
  assert.deepEqual(fieldsOf({ languages: ["lt", "de"] }), ["languages"]);
  assert.deepEqual(read(valid({ languages: ["ru", "lt", "ru"] })).listing.languages, ["lt", "ru"]);
});

test("new service: working hours need a working day, and every working day a start before its end", () => {
  const off = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
  assert.deepEqual(fieldsOf({ hours: off }), ["hours"]);
  assert.deepEqual(fieldsOf({ hours: undefined }), ["hours"]);

  const saturdayOnly = read(valid({ hours: { ...off, sat: ["10:00", "14:00"] } }));
  assert.deepEqual(saturdayOnly.listing.availability.hours, { ...off, sat: ["10:00", "14:00"] });
  assert.deepEqual(Object.keys(saturdayOnly.listing.availability.hours), data.WEEKDAYS);

  const errors = errorsOf({ hours: { ...weekHours, tue: { open: "18:00", close: "09:00" }, thu: { open: "", close: "17:00" }, sun: { open: "9:00", close: "25:00" } } });
  assert.deepEqual(errors.map((error) => error.field), ["hours.tue", "hours.thu", "hours.sun"]);
  assert.ok(errors[0].message.startsWith(WEEKDAY_LABEL.tue));
  assert.deepEqual(fieldsOf({ hours: { ...weekHours, mon: { open: "09:00", close: "09:00" } } }), ["hours.mon"]);
  assert.deepEqual(Object.keys(WEEKDAY_LABEL), data.WEEKDAYS);
});

test("new service: an emergency provider has lead time 0, whatever the field says", () => {
  const { availability } = read(valid({ emergency: true, leadTimeDays: "14" })).listing;
  assert.equal(availability.emergency, true);
  assert.equal(availability.leadTimeDays, 0);
  assert.equal(read(valid({ emergency: true, leadTimeDays: "" })).ok, true);
});

test("new service: nobody can add a verified or a rated listing", () => {
  const { listing } = read({ ...valid(), verified: true, rating: { average: 5, count: 999 }, provider: { verified: true }, id: "svc-001" });
  assert.equal(listing.provider.verified, false);
  assert.deepEqual(listing.rating, { average: 0, count: 0 });
  assert.equal(listing.id, undefined);
});

test("new service: the kept input has only the form's fields and reads back to the same listing", () => {
  const given = { ...valid(), id: "svc-001", verified: true };
  const result = read(given);
  assert.deepEqual(Object.keys(result.input).sort(), [...INPUT_FIELDS].sort());
  assert.deepEqual(read(JSON.parse(JSON.stringify(result.input))).listing, result.listing);
  // A copy: changing the form's object afterwards does not change what was kept.
  given.hours.mon.open = "00:00";
  assert.equal(result.input.hours.mon.open, "09:00");
  given.hours.mon.open = "09:00";
});
