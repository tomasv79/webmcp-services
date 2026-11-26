import { test } from "node:test";
import assert from "node:assert/strict";
import { categories, countries, listings, PRICE_UNITS, LANGUAGES, WEEKDAYS } from "../catalog/data.js";

const isString = (value) => typeof value === "string" && value.trim().length > 0;
const isBool = (value) => typeof value === "boolean";
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

const PHONE = {
  LT: /^\+370 000 00\d{3}$/,
  LV: /^\+371 0000 0\d{3}$/,
  EE: /^\+372 0000 0\d{3}$/,
};
const POSTAL = { LT: /^LT-\d{5}$/, LV: /^LV-\d{4}$/, EE: /^\d{5}$/ };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const countBy = (items, key) => {
  const counts = new Map();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
};

test("AC2.1 there are at least 60 listings", () => {
  assert.ok(listings.length >= 60, `only ${listings.length} listings`);
});

test("AC2.1 there are 12 categories, each with Lithuanian and English names and at least 4 listings", () => {
  assert.equal(categories.length, 12);
  assert.equal(new Set(categories.map((c) => c.id)).size, 12);
  const perCategory = countBy(listings, (l) => l.category);
  for (const category of categories) {
    assert.match(category.id, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(isString(category.nameLt), `${category.id} nameLt`);
    assert.ok(isString(category.nameEn), `${category.id} nameEn`);
    assert.ok((perCategory.get(category.id) ?? 0) >= 4, `${category.id} has fewer than 4 listings`);
  }
});

test("AC2.1 LT, LV and EE each have at least 12 listings in at least 3 cities", () => {
  assert.deepEqual(countries.map((c) => c.code).sort(), ["EE", "LT", "LV"]);
  for (const country of countries) {
    assert.ok(isString(country.nameLt) && isString(country.nameEn));
    const own = listings.filter((l) => l.location.country === country.code);
    assert.ok(own.length >= 12, `${country.code} has ${own.length} listings`);
    assert.ok(new Set(own.map((l) => l.location.city)).size >= 3, `${country.code} has fewer than 3 cities`);
  }
});

test("AC2.2 ids are unique and follow svc-NNN", () => {
  assert.equal(new Set(listings.map((l) => l.id)).size, listings.length);
  for (const listing of listings) assert.match(listing.id, /^svc-\d{3}$/);
});

test("AC2.2 every listing has every required field with the right type", () => {
  const categoryIds = new Set(categories.map((c) => c.id));
  const countryCodes = new Set(countries.map((c) => c.code));
  for (const l of listings) {
    const at = (field) => `${l.id} ${field}`;
    assert.ok(categoryIds.has(l.category), at("category"));
    for (const field of ["title", "titleEn", "description", "descriptionEn"]) assert.ok(isString(l[field]), at(field));
    assert.ok(Array.isArray(l.tags) && l.tags.length >= 2 && l.tags.every(isString), at("tags"));

    assert.ok(isString(l.provider.name), at("provider.name"));
    assert.ok(["individual", "company"].includes(l.provider.type), at("provider.type"));
    assert.ok(Number.isInteger(l.provider.yearsExperience) && l.provider.yearsExperience >= 0, at("provider.yearsExperience"));
    assert.ok(isBool(l.provider.verified), at("provider.verified"));

    assert.ok(countryCodes.has(l.location.country), at("location.country"));
    assert.ok(isString(l.location.city), at("location.city"));
    assert.ok(isString(l.location.address), at("location.address"));
    assert.match(l.location.postalCode, POSTAL[l.location.country], at("location.postalCode"));

    assert.ok(isBool(l.serviceArea.travelsToClient), at("serviceArea.travelsToClient"));
    assert.ok(isNumber(l.serviceArea.radiusKm) && l.serviceArea.radiusKm >= 0, at("serviceArea.radiusKm"));
    assert.ok(isBool(l.serviceArea.remote), at("serviceArea.remote"));

    assert.ok(isNumber(l.rating.average) && l.rating.average >= 1 && l.rating.average <= 5, at("rating.average"));
    assert.ok(Number.isInteger(l.rating.count) && l.rating.count >= 1, at("rating.count"));

    assert.ok(Array.isArray(l.languages) && l.languages.length >= 1, at("languages"));
    assert.ok(l.languages.every((code) => LANGUAGES.includes(code)), at("languages values"));
    assert.equal(new Set(l.languages).size, l.languages.length, at("languages unique"));
  }
});

test("AC2.3 contacts are fictional: .example addresses and unassigned phone numbers", () => {
  for (const l of listings) {
    assert.match(l.contact.phone, PHONE[l.location.country], `${l.id} phone`);
    assert.match(l.contact.email, /^[a-z0-9.-]+@[a-z0-9-]+\.example$/, `${l.id} email`);
    if (l.contact.website !== undefined) {
      assert.match(l.contact.website, /^https:\/\/[a-z0-9-]+\.example$/, `${l.id} website`);
    }
  }
  assert.equal(new Set(listings.map((l) => l.contact.phone)).size, listings.length, "phones are unique");
  assert.equal(new Set(listings.map((l) => l.provider.name)).size, listings.length, "provider names are unique");
});

test("AC2.4 prices are valid", () => {
  assert.deepEqual([...PRICE_UNITS].sort(), ["day", "hour", "job", "m2", "visit"]);
  for (const l of listings) {
    const p = l.price;
    assert.ok(isNumber(p.from) && p.from > 0, `${l.id} price.from`);
    if (p.to !== undefined) assert.ok(isNumber(p.to) && p.to >= p.from, `${l.id} price.to`);
    assert.ok(PRICE_UNITS.includes(p.unit), `${l.id} price.unit`);
    assert.equal(p.currency, "EUR", `${l.id} price.currency`);
    assert.ok(isBool(p.negotiable), `${l.id} price.negotiable`);
    if (p.calloutFee !== undefined) assert.ok(isNumber(p.calloutFee) && p.calloutFee >= 0, `${l.id} price.calloutFee`);
  }
});

test("AC2.4 working hours are valid and every provider works at least one weekday", () => {
  assert.deepEqual(WEEKDAYS, ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  for (const l of listings) {
    const { hours, leadTimeDays, emergency } = l.availability;
    assert.deepEqual(Object.keys(hours), WEEKDAYS, `${l.id} hours keys`);
    let workingDays = 0;
    for (const day of WEEKDAYS) {
      const slot = hours[day];
      if (slot === null) continue;
      assert.ok(Array.isArray(slot) && slot.length === 2, `${l.id} ${day} slot`);
      assert.match(slot[0], TIME, `${l.id} ${day} open`);
      assert.match(slot[1], TIME, `${l.id} ${day} close`);
      assert.ok(slot[0] < slot[1], `${l.id} ${day} open is before close`);
      workingDays += 1;
    }
    assert.ok(workingDays >= 1, `${l.id} works at least one day`);
    assert.ok(Number.isInteger(leadTimeDays) && leadTimeDays >= 0 && leadTimeDays <= 60, `${l.id} leadTimeDays`);
    assert.ok(isBool(emergency), `${l.id} emergency`);
    if (emergency) assert.equal(leadTimeDays, 0, `${l.id} emergency providers have lead time 0`);
  }
});

test("the data covers the cases the tools need to show", () => {
  const cities = new Set(listings.map((l) => l.location.city));
  for (const city of ["Vilnius", "Kaunas", "Šiauliai", "Rīga", "Tallinn", "Pärnu"]) assert.ok(cities.has(city), city);
  assert.ok(listings.some((l) => l.availability.emergency), "an emergency provider");
  assert.ok(listings.some((l) => l.availability.leadTimeDays >= 7), "a provider booked for a week or more");
  assert.ok(listings.some((l) => l.serviceArea.remote), "a remote service");
  assert.ok(listings.some((l) => !l.serviceArea.travelsToClient), "a provider that does not travel");
  for (const unit of PRICE_UNITS) assert.ok(listings.some((l) => l.price.unit === unit), `unit ${unit}`);
  for (const code of LANGUAGES) assert.ok(listings.some((l) => l.languages.includes(code)), `language ${code}`);
});
