import { test } from "node:test";
import assert from "node:assert/strict";
import { generateListings, CITIES } from "../public/js/generate.js";
import * as base from "../public/js/data.js";
import * as catalog from "../public/js/catalog.js";

const generated = catalog.listings.slice(base.listings.length);

const isString = (value) => typeof value === "string" && value.trim().length > 0;
const isBool = (value) => typeof value === "boolean";
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

const PHONE = { LT: /^\+370 000 \d{5}$/, LV: /^\+371 0000 \d{4}$/, EE: /^\+372 0000 \d{4}$/ };
const POSTAL = { LT: /^LT-\d{5}$/, LV: /^LV-\d{4}$/, EE: /^\d{5}$/ };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const countBy = (items, key) => {
  const counts = new Map();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
};

test("ACA1.1 the catalog has exactly 10,000 listings and starts with the 60 hand-written ones", () => {
  assert.equal(catalog.listings.length, 10_000);
  assert.equal(base.listings.length, 60);
  for (let i = 0; i < base.listings.length; i += 1) assert.equal(catalog.listings[i], base.listings[i]);
  assert.equal(generated.length, 9_940);
});

test("ACA1.1 the catalog module offers everything the tools and the search need", () => {
  assert.equal(catalog.categories, base.categories);
  assert.equal(catalog.countries, base.countries);
  assert.equal(catalog.PRICE_UNITS, base.PRICE_UNITS);
  assert.equal(catalog.LANGUAGES, base.LANGUAGES);
  for (const [city, aliases] of Object.entries(base.cityAliases)) assert.deepEqual(catalog.cityAliases[city], aliases);
  assert.ok(catalog.cityAliases["Ventspils"].includes("Ventspilis"));
});

test("ACA1.2 generation is deterministic and depends on the seed", () => {
  const first = generateListings({ count: 300, startNumber: 61 });
  const second = generateListings({ count: 300, startNumber: 61 });
  assert.deepEqual(first, second);
  assert.deepEqual(first, generated.slice(0, 300).map((l) => structuredClone(l)), "the catalog uses the default seed");
  const other = generateListings({ count: 300, startNumber: 61, seed: 12345 });
  assert.notDeepEqual(first.map((l) => l.provider.name), other.map((l) => l.provider.name));
});

test("ACA1.2 three generated listings are pinned, so a change to the generated data is always deliberate", () => {
  // Editing the word lists, the service types or the order of random draws in generate.js changes which listing
  // an id stands for. When that is intended, update these three lines.
  const pin = (id) => {
    const l = catalog.listings.find((listing) => listing.id === id);
    return [l.id, l.provider.name, l.location.city, l.title, l.price.from, l.rating.average, l.contact.phone];
  };
  assert.deepEqual(pin("svc-00061"), ["svc-00061", "Santechnikas Marius Z.", "Šiauliai", "Avarinė santechnikos tarnyba", 44, 3.8, "+370 000 01000"]);
  assert.deepEqual(pin("svc-05000"), ["svc-05000", "Rytų Kraštovaizdis", "Vilnius", "Medžių genėjimas ir pjovimas", 270, 4.4, "+370 000 03447"]);
  assert.deepEqual(pin("svc-10000"), ["svc-10000", "Apkopēja Santa T.", "Liepāja", "Butų ir namų valymas Liepojoje", 14, 4.3, "+371 0000 3465"]);
});

test("ACA1.2 count is respected, also zero", () => {
  assert.equal(generateListings({ count: 0, startNumber: 61 }).length, 0);
  assert.equal(generateListings({ count: 7, startNumber: 61 }).length, 7);
});

test("ACA1.3 generated ids run from svc-00061 to svc-10000 and all ids are unique", () => {
  assert.equal(generated[0].id, "svc-00061");
  assert.equal(generated.at(-1).id, "svc-10000");
  for (const l of generated) assert.match(l.id, /^svc-\d{5}$/);
  assert.equal(new Set(catalog.listings.map((l) => l.id)).size, 10_000);
});

test("ACA1.3 phones and provider names are unique across the whole catalog", () => {
  assert.equal(new Set(catalog.listings.map((l) => l.contact.phone)).size, 10_000);
  assert.equal(new Set(catalog.listings.map((l) => l.provider.name)).size, 10_000);
});

test("ACA1.3 and ACA1.4 every generated listing passes the field rules", () => {
  const categoryIds = new Set(base.categories.map((c) => c.id));
  const cityCountry = new Map(CITIES.map((c) => [c.name, c.country]));
  for (const l of generated) {
    const at = (field) => `${l.id} ${field}`;
    assert.ok(categoryIds.has(l.category), at("category"));
    for (const field of ["title", "titleEn", "description", "descriptionEn"]) {
      assert.ok(isString(l[field]), at(field));
      assert.doesNotMatch(l[field], /undefined|NaN|\$\{|\s{2,}|^\s|\s$/, at(field));
    }
    assert.ok(Array.isArray(l.tags) && l.tags.length >= 2 && l.tags.every(isString), at("tags"));

    assert.ok(isString(l.provider.name), at("provider.name"));
    assert.ok(["individual", "company"].includes(l.provider.type), at("provider.type"));
    assert.ok(Number.isInteger(l.provider.yearsExperience) && l.provider.yearsExperience >= 1, at("provider.yearsExperience"));
    assert.ok(isBool(l.provider.verified), at("provider.verified"));

    assert.match(l.contact.phone, PHONE[l.location.country], at("phone"));
    assert.match(l.contact.email, /^[a-z0-9.-]+@[a-z0-9-]+\.example$/, at("email"));
    if (l.contact.website !== undefined) assert.match(l.contact.website, /^https:\/\/[a-z0-9-]+\.example$/, at("website"));

    assert.equal(cityCountry.get(l.location.city), l.location.country, at("city belongs to country"));
    assert.ok(isString(l.location.address), at("address"));
    assert.match(l.location.postalCode, POSTAL[l.location.country], at("postalCode"));

    assert.ok(isBool(l.serviceArea.travelsToClient), at("travelsToClient"));
    assert.ok(isNumber(l.serviceArea.radiusKm) && l.serviceArea.radiusKm >= 0, at("radiusKm"));
    assert.equal(l.serviceArea.radiusKm > 0, l.serviceArea.travelsToClient, at("radius only when travelling"));
    assert.ok(isBool(l.serviceArea.remote), at("remote"));

    const p = l.price;
    assert.ok(isNumber(p.from) && p.from > 0, at("price.from"));
    if (p.to !== undefined) assert.ok(isNumber(p.to) && p.to > p.from, at("price.to"));
    assert.ok(base.PRICE_UNITS.includes(p.unit), at("price.unit"));
    assert.equal(p.currency, "EUR", at("price.currency"));
    assert.ok(isBool(p.negotiable), at("price.negotiable"));
    if (p.calloutFee !== undefined) assert.ok(isNumber(p.calloutFee) && p.calloutFee > 0, at("calloutFee"));

    assert.ok(isNumber(l.rating.average) && l.rating.average >= 1 && l.rating.average <= 5, at("rating.average"));
    assert.equal(l.rating.average, Math.round(l.rating.average * 10) / 10, at("rating has one decimal"));
    assert.ok(Number.isInteger(l.rating.count) && l.rating.count >= 1, at("rating.count"));

    assert.ok(l.languages.length >= 1 && l.languages.every((code) => base.LANGUAGES.includes(code)), at("languages"));
    assert.equal(new Set(l.languages).size, l.languages.length, at("languages unique"));

    const { hours, leadTimeDays, emergency } = l.availability;
    assert.deepEqual(Object.keys(hours), base.WEEKDAYS, at("hours keys"));
    let workingDays = 0;
    for (const day of base.WEEKDAYS) {
      const slot = hours[day];
      if (slot === null) continue;
      assert.ok(Array.isArray(slot) && slot.length === 2 && TIME.test(slot[0]) && TIME.test(slot[1]) && slot[0] < slot[1], at(`${day} slot`));
      workingDays += 1;
    }
    assert.ok(workingDays >= 1, at("works at least one day"));
    assert.ok(Number.isInteger(leadTimeDays) && leadTimeDays >= 0 && leadTimeDays <= 60, at("leadTimeDays"));
    assert.ok(isBool(emergency), at("emergency"));
    if (emergency) assert.equal(leadTimeDays, 0, at("emergency means lead time 0"));
  }
});

test("ACA1.3 generated listings do not share objects with each other", () => {
  const [a, b] = generated;
  assert.notEqual(a.availability.hours, b.availability.hours);
  assert.notEqual(a.tags, b.tags);
  assert.notEqual(a.languages, b.languages);
});

test("ACA1.5 the listings are spread over categories, countries and cities", () => {
  const perCategory = countBy(catalog.listings, (l) => l.category);
  for (const category of base.categories) {
    const count = perCategory.get(category.id);
    assert.ok(count >= 700 && count <= 950, `${category.id}: ${count}`);
  }
  const perCountry = countBy(catalog.listings, (l) => l.location.country);
  assert.ok(perCountry.get("LT") >= 4500 && perCountry.get("LT") <= 5500, `LT ${perCountry.get("LT")}`);
  for (const code of ["LV", "EE"]) assert.ok(perCountry.get(code) >= 2000 && perCountry.get(code) <= 3000, `${code} ${perCountry.get(code)}`);

  assert.equal(CITIES.length, 31);
  const perCity = countBy(catalog.listings, (l) => l.location.city);
  assert.equal(perCity.size, 31);
  for (const city of CITIES) assert.ok(perCity.get(city.name) >= 20, `${city.name}: ${perCity.get(city.name)}`);

  for (const unit of base.PRICE_UNITS) assert.ok(generated.some((l) => l.price.unit === unit), unit);
  for (const code of base.LANGUAGES) assert.ok(generated.some((l) => l.languages.includes(code)), code);
  for (const type of ["individual", "company"]) assert.ok(generated.filter((l) => l.provider.type === type).length > 2000, type);
  assert.ok(generated.filter((l) => l.availability.emergency).length > 300, "emergency providers");
  assert.ok(generated.filter((l) => l.serviceArea.remote).length > 500, "remote services");
  assert.ok(generated.filter((l) => !l.serviceArea.travelsToClient).length > 1500, "providers that do not travel");
  assert.ok(new Set(generated.map((l) => l.title)).size > 500, "titles vary");
});

test("a generated title or description names the listing's own city, never another one", () => {
  const cityForms = CITIES.map((c) => ({
    city: c.name,
    forms: [...new Set([c.name, c.locativeLt])].map((form) => ({ form, pattern: new RegExp(`(^|[^\\p{L}])${form}([^\\p{L}]|$)`, "u") })),
  }));
  const ownForms = new Map(CITIES.map((c) => [c.name, [c.name, c.locativeLt]]));
  for (const l of generated) {
    const text = `${l.title} ${l.description} ${l.titleEn} ${l.descriptionEn}`;
    const own = ownForms.get(l.location.city);
    for (const { city, forms } of cityForms) {
      if (city === l.location.city) continue;
      for (const { form, pattern } of forms) {
        if (own.includes(form)) continue;
        assert.ok(!pattern.test(text), `${l.id} (${l.location.city}) mentions ${form}`);
      }
    }
  }
});

test("generated company names avoid city names and utility-style words", () => {
  // "<city> <utility>" is how real municipal companies are named (Kauno energija, Rīgas siltums, Tallinna Soojus).
  const cityWords = new Set(CITIES.flatMap((c) => c.name.split(/[\s-]+/)));
  const cityStems = ["Vilniaus", "Kauno", "Klaipėdos", "Šiaulių", "Panevėžio", "Rīgas", "Liepājas", "Jelgavas", "Jūrmalas", "Tallinna", "Harju"];
  const utilityWords = /(^|\s)(Energija|Enerģija|Energia|Šiluma|Siltums|Soojus|Šviesa|Gaisma|Valgus|Elektra|Elektrība|Elekter|Vandentiekis|Vandenys|Vesi|Ūdens)(\s|$)/;
  for (const l of generated) {
    if (l.provider.type !== "company") continue;
    const words = l.provider.name.split(/\s+/);
    assert.ok(!words.some((word) => cityWords.has(word) || cityStems.includes(word)), `${l.id} ${l.provider.name}`);
    assert.doesNotMatch(l.provider.name, utilityWords, `${l.id} ${l.provider.name}`);
  }
});

test("generated house numbers are high, so the address is unlikely to exist", () => {
  for (const l of generated) {
    const number = Number(l.location.address.match(/ (\d+)$/)?.[1]);
    assert.ok(number >= 300 && number <= 990, `${l.id} ${l.location.address}`);
  }
});

test("generated postal codes look like the country's own", () => {
  for (const l of generated) {
    const digits = Number(l.location.postalCode.replace(/\D/g, ""));
    if (l.location.country === "LV") assert.ok(digits >= 1001 && digits <= 5999, `${l.id} ${l.location.postalCode}`);
    if (l.location.country === "EE") assert.ok(digits >= 10000, `${l.id} ${l.location.postalCode}`);
  }
});

test("the generator refuses a count its phone number format cannot hold", () => {
  assert.throws(() => generateListings({ count: 60_000, startNumber: 61 }), RangeError);
});
