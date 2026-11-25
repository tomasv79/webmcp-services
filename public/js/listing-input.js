// The "add a service" form: the values a person typed in, a listing in the catalog's shape (or a list of errors) out.
// Pure logic: no DOM and no storage, so everything runs in Node tests without a browser.
// The messages are Lithuanian because the person filling in the form reads them.

export const WEEKDAY_LABEL = {
  mon: "Pirmadienis", tue: "Antradienis", wed: "Trečiadienis", thu: "Ketvirtadienis",
  fri: "Penktadienis", sat: "Šeštadienis", sun: "Sekmadienis",
};

export const PROVIDER_TYPES = ["individual", "company"];

export const LIMITS = {
  title: [5, 100],
  description: [20, 1000],
  providerName: [2, 80],
  address: [3, 120],
  tags: 10,
  tagLength: 30,
  emailLength: 100,
  yearsExperience: 70,
  radiusKm: 500,
  price: 100_000,
  calloutFee: 1000,
  leadTimeDays: 60,
};

// What a person may type, and how the catalog writes it: "08318" and "lt08318" both become "LT-08318".
const POSTAL = {
  LT: { pattern: /^(?:LT-?)?(\d{5})$/i, write: (digits) => `LT-${digits}`, example: "LT-01103" },
  LV: { pattern: /^(?:LV-?)?(\d{4})$/i, write: (digits) => `LV-${digits}`, example: "LV-1050" },
  EE: { pattern: /^(\d{5})$/, write: (digits) => digits, example: "10111" },
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARACTERS = /^\+?[\d ()-]+$/;

/** Every field the form sends. Anything else in the input is dropped before the input is stored. */
export const INPUT_FIELDS = [
  "title", "category", "description", "tags",
  "providerName", "providerType", "yearsExperience",
  "phone", "email",
  "country", "city", "address", "postalCode",
  "travelsToClient", "radiusKm", "remote",
  "priceFrom", "priceTo", "priceUnit", "calloutFee", "negotiable",
  "languages", "hours", "leadTimeDays", "emergency",
];

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const blank = (value) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");
const between = (value, [min, max]) => value.length >= min && value.length <= max;
const cents = (value) => Math.round(value * 100) / 100;

/** A number typed into a field. A decimal comma is accepted; anything that is not a number is NaN. */
function number(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return NaN;
  return Number(value.trim().replace(",", "."));
}

function readTags(value) {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]/) : [];
  const seen = new Set();
  const tags = [];
  for (const part of parts) {
    const tag = text(part);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

/** One day of the form: nothing when the day is off, otherwise { open, close } or [open, close]. */
function readSlot(value) {
  if (value === undefined || value === null || value === false) return null;
  const [open, close] = Array.isArray(value) ? value : [value?.open, value?.close];
  return [typeof open === "string" ? open.trim() : "", typeof close === "string" ? close.trim() : ""];
}

/**
 * @param {{ categories: object[], countries: object[], listings: object[], PRICE_UNITS: string[], LANGUAGES: string[], WEEKDAYS: string[] }} catalog
 *   A service can be added only in a city the catalog already has, so the city filters and the tools keep their values.
 * @returns {(input: unknown) =>
 *   { ok: true, listing: object, input: object } | { ok: false, errors: Array<{ field: string, message: string }> }}
 *   `listing` has everything a catalog listing has except the id. `input` is the given input reduced to the known
 *   fields; reading it again gives the same listing, so it is what gets stored.
 *   Errors come in the order of the form. A day of the working hours is reported as "hours.mon".
 */
export function createListingReader(catalog) {
  const categoryIds = new Set(catalog.categories.map((category) => category.id));
  const countryCodes = new Set(catalog.countries.map((country) => country.code));
  const countryOfCity = new Map(catalog.listings.map((listing) => [listing.location.city, listing.location.country]));

  return function readListing(raw) {
    const input = isPlainObject(raw) ? raw : {};
    const errors = [];
    const fail = (field, message) => errors.push({ field, message });

    const title = text(input.title);
    if (!between(title, LIMITS.title)) fail("title", `Įrašykite paslaugos pavadinimą (${LIMITS.title.join("–")} simbolių).`);

    const category = input.category;
    if (!categoryIds.has(category)) fail("category", "Pasirinkite kategoriją.");

    const description = text(input.description);
    if (!between(description, LIMITS.description)) fail("description", `Aprašykite paslaugą (${LIMITS.description.join("–")} simbolių).`);

    const tags = readTags(input.tags);
    if (tags.length > LIMITS.tags || tags.some((tag) => tag.length > LIMITS.tagLength)) {
      fail("tags", `Raktažodžiai: ne daugiau kaip ${LIMITS.tags}, kiekvienas iki ${LIMITS.tagLength} simbolių.`);
    }

    const providerName = text(input.providerName);
    if (!between(providerName, LIMITS.providerName)) {
      fail("providerName", `Įrašykite teikėjo vardą arba įmonės pavadinimą (${LIMITS.providerName.join("–")} simbolių).`);
    }

    const providerType = input.providerType;
    if (!PROVIDER_TYPES.includes(providerType)) fail("providerType", "Pasirinkite teikėjo tipą.");

    const yearsExperience = number(input.yearsExperience);
    if (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > LIMITS.yearsExperience) {
      fail("yearsExperience", `Patirtis: sveikas skaičius nuo 0 iki ${LIMITS.yearsExperience}.`);
    }

    const phone = text(input.phone);
    const phoneDigits = phone.replace(/\D/g, "").length;
    if (!PHONE_CHARACTERS.test(phone) || phoneDigits < 7 || phoneDigits > 15) {
      fail("phone", "Įrašykite telefono numerį, pvz., +370 000 00000.");
    }

    const email = text(input.email).toLowerCase();
    if (!EMAIL.test(email) || email.length > LIMITS.emailLength) {
      fail("email", "Įrašykite el. pašto adresą, pvz., vardas@imone.example.");
    }

    const country = input.country;
    const countryKnown = countryCodes.has(country);
    if (!countryKnown) fail("country", "Pasirinkite šalį.");

    const city = input.city;
    if (typeof city !== "string" || !countryOfCity.has(city) || (countryKnown && countryOfCity.get(city) !== country)) {
      fail("city", "Pasirinkite miestą iš sąrašo.");
    }

    const address = text(input.address);
    if (!between(address, LIMITS.address)) fail("address", `Įrašykite adresą (${LIMITS.address.join("–")} simbolių).`);

    let postalCode = text(input.postalCode).replace(/ /g, "");
    if (countryKnown) {
      const rule = POSTAL[country];
      const digits = rule?.pattern.exec(postalCode)?.[1];
      if (rule && digits === undefined) fail("postalCode", `Įrašykite pašto kodą, pvz., ${rule.example}.`);
      else if (rule) postalCode = rule.write(digits);
    }

    const travelsToClient = input.travelsToClient === true;
    let radiusKm = 0;
    if (travelsToClient) {
      radiusKm = number(input.radiusKm);
      if (!Number.isInteger(radiusKm) || radiusKm < 1 || radiusKm > LIMITS.radiusKm) {
        fail("radiusKm", `Atvykimo atstumas: sveikas skaičius nuo 1 iki ${LIMITS.radiusKm} km.`);
      }
    }

    const priceFrom = number(input.priceFrom);
    const priceFromValid = Number.isFinite(priceFrom) && priceFrom > 0 && priceFrom <= LIMITS.price;
    if (!priceFromValid) fail("priceFrom", `Kaina nuo: skaičius, didesnis už 0 ir ne didesnis už ${LIMITS.price}.`);

    let priceTo;
    if (!blank(input.priceTo)) {
      priceTo = number(input.priceTo);
      if (!Number.isFinite(priceTo) || priceTo > LIMITS.price || (priceFromValid ? priceTo < priceFrom : priceTo <= 0)) {
        fail("priceTo", "Kaina iki: skaičius, ne mažesnis už kainą nuo. Jei kaina viena, palikite tuščią.");
      }
    }

    const priceUnit = input.priceUnit;
    if (!catalog.PRICE_UNITS.includes(priceUnit)) fail("priceUnit", "Pasirinkite, už ką skaičiuojama kaina.");

    let calloutFee;
    if (!blank(input.calloutFee)) {
      calloutFee = number(input.calloutFee);
      if (!Number.isFinite(calloutFee) || calloutFee < 0 || calloutFee > LIMITS.calloutFee) {
        fail("calloutFee", `Iškvietimo mokestis: skaičius nuo 0 iki ${LIMITS.calloutFee}. Jei mokesčio nėra, palikite tuščią.`);
      }
    }

    const given = Array.isArray(input.languages) ? input.languages : [];
    const languages = catalog.LANGUAGES.filter((code) => given.includes(code));
    if (languages.length === 0 || given.some((code) => !catalog.LANGUAGES.includes(code))) {
      fail("languages", "Pažymėkite bent vieną kalbą.");
    }

    const givenHours = isPlainObject(input.hours) ? input.hours : {};
    const hours = {};
    let workingDays = 0;
    for (const day of catalog.WEEKDAYS) {
      const slot = readSlot(givenHours[day]);
      hours[day] = slot;
      if (slot === null) continue;
      workingDays += 1;
      if (!TIME.test(slot[0]) || !TIME.test(slot[1])) fail(`hours.${day}`, `${WEEKDAY_LABEL[day]}: įrašykite darbo pradžią ir pabaigą.`);
      else if (slot[0] >= slot[1]) fail(`hours.${day}`, `${WEEKDAY_LABEL[day]}: darbo pradžia turi būti ankstesnė už pabaigą.`);
    }
    if (workingDays === 0) fail("hours", "Pažymėkite bent vieną darbo dieną.");

    // An emergency provider answers today, so a lead time makes no sense for one.
    const emergency = input.emergency === true;
    let leadTimeDays = 0;
    if (!emergency) {
      leadTimeDays = number(input.leadTimeDays);
      if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > LIMITS.leadTimeDays) {
        fail("leadTimeDays", `Per kiek dienų galite pradėti: sveikas skaičius nuo 0 iki ${LIMITS.leadTimeDays}.`);
      }
    }

    if (errors.length > 0) return { ok: false, errors };

    const price = { from: cents(priceFrom), unit: priceUnit, currency: "EUR", negotiable: input.negotiable === true };
    if (priceTo !== undefined) price.to = cents(priceTo);
    if (calloutFee !== undefined) price.calloutFee = cents(calloutFee);

    const listing = {
      category,
      // The form asks for one language only; the English fields the tools return repeat the text as typed.
      title, titleEn: title,
      description, descriptionEn: description,
      tags,
      // Nobody has checked a provider who has just signed up, and nobody has rated one.
      provider: { name: providerName, type: providerType, yearsExperience, verified: false },
      contact: { phone, email },
      location: { country, city, address, postalCode },
      serviceArea: { travelsToClient, radiusKm, remote: input.remote === true },
      price,
      rating: { average: 0, count: 0 },
      languages,
      availability: { hours, leadTimeDays, emergency },
    };

    const kept = {};
    for (const field of INPUT_FIELDS) if (input[field] !== undefined) kept[field] = input[field];
    return { ok: true, listing, input: structuredClone(kept) };
  };
}
