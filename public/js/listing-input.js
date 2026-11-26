// The "add a service" form: the values a person typed in, a listing in the catalog's shape (or a list of errors) out.
// The same checks read a visitor's listing again when it comes back from the database (js/directory.js).
// Pure logic: no DOM and no storage, so everything runs in Node tests without a browser.
// The messages are for the person filling in the form, in the language the page is shown in: Lithuanian or English.

export const WEEKDAY_LABELS = {
  lt: {
    mon: "Pirmadienis", tue: "Antradienis", wed: "Trečiadienis", thu: "Ketvirtadienis",
    fri: "Penktadienis", sat: "Šeštadienis", sun: "Sekmadienis",
  },
  en: {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
  },
};
export const WEEKDAY_LABEL = WEEKDAY_LABELS.lt;

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
export const POSTAL = {
  LT: { pattern: /^(?:LT-?)?(\d{5})$/i, write: (digits) => `LT-${digits}`, example: "LT-01103" },
  LV: { pattern: /^(?:LV-?)?(\d{4})$/i, write: (digits) => `LV-${digits}`, example: "LV-1050" },
  EE: { pattern: /^(\d{5})$/, write: (digits) => digits, example: "10111" },
};

const range = ([min, max]) => `${min}–${max}`;

/** One message per check, in every language of the page. `postalCode` and the two `hours` ones take a value. */
export const MESSAGES = {
  lt: {
    title: `Įrašykite paslaugos pavadinimą (${range(LIMITS.title)} simbolių).`,
    category: "Pasirinkite kategoriją.",
    description: `Aprašykite paslaugą (${range(LIMITS.description)} simbolių).`,
    tags: `Raktažodžiai: ne daugiau kaip ${LIMITS.tags}, kiekvienas iki ${LIMITS.tagLength} simbolių.`,
    providerName: `Įrašykite teikėjo vardą arba įmonės pavadinimą (${range(LIMITS.providerName)} simbolių).`,
    providerType: "Pasirinkite teikėjo tipą.",
    yearsExperience: `Patirtis: sveikas skaičius nuo 0 iki ${LIMITS.yearsExperience}.`,
    phone: "Įrašykite telefono numerį, pvz., +370 000 00000.",
    email: "Įrašykite el. pašto adresą, pvz., vardas@imone.example.",
    country: "Pasirinkite šalį.",
    city: "Pasirinkite miestą iš sąrašo.",
    address: `Įrašykite adresą (${range(LIMITS.address)} simbolių).`,
    postalCode: (example) => `Įrašykite pašto kodą, pvz., ${example}.`,
    radiusKm: `Atvykimo atstumas: sveikas skaičius nuo 1 iki ${LIMITS.radiusKm} km.`,
    priceFrom: `Kaina nuo: skaičius, didesnis už 0 ir ne didesnis už ${LIMITS.price}.`,
    priceTo: "Kaina iki: skaičius, ne mažesnis už kainą nuo. Jei kaina viena, palikite tuščią.",
    priceUnit: "Pasirinkite, už ką skaičiuojama kaina.",
    calloutFee: `Iškvietimo mokestis: skaičius nuo 0 iki ${LIMITS.calloutFee}. Jei mokesčio nėra, palikite tuščią.`,
    languages: "Pažymėkite bent vieną kalbą.",
    hoursTimes: (day) => `${day}: įrašykite darbo pradžią ir pabaigą.`,
    hoursOrder: (day) => `${day}: darbo pradžia turi būti ankstesnė už pabaigą.`,
    hours: "Pažymėkite bent vieną darbo dieną.",
    leadTimeDays: `Per kiek dienų galite pradėti: sveikas skaičius nuo 0 iki ${LIMITS.leadTimeDays}.`,
  },
  en: {
    title: `Enter the title of the service (${range(LIMITS.title)} characters).`,
    category: "Choose a category.",
    description: `Describe the service (${range(LIMITS.description)} characters).`,
    tags: `Keywords: no more than ${LIMITS.tags}, each up to ${LIMITS.tagLength} characters.`,
    providerName: `Enter the provider's name or the company name (${range(LIMITS.providerName)} characters).`,
    providerType: "Choose the provider type.",
    yearsExperience: `Experience: a whole number from 0 to ${LIMITS.yearsExperience}.`,
    phone: "Enter a phone number, e.g. +370 000 00000.",
    email: "Enter an email address, e.g. name@company.example.",
    country: "Choose a country.",
    city: "Choose a city from the list.",
    address: `Enter the address (${range(LIMITS.address)} characters).`,
    postalCode: (example) => `Enter the postal code, e.g. ${example}.`,
    radiusKm: `Travel distance: a whole number from 1 to ${LIMITS.radiusKm} km.`,
    priceFrom: `Price from: a number above 0 and no more than ${LIMITS.price}.`,
    priceTo: "Price to: a number no lower than the price from. Leave it empty if there is one price.",
    priceUnit: "Choose what the price is for.",
    calloutFee: `Call-out fee: a number from 0 to ${LIMITS.calloutFee}. Leave it empty if there is no fee.`,
    languages: "Tick at least one language.",
    hoursTimes: (day) => `${day}: enter when work starts and ends.`,
    hoursOrder: (day) => `${day}: work must start before it ends.`,
    hours: "Tick at least one working day.",
    leadTimeDays: `Days until you can start: a whole number from 0 to ${LIMITS.leadTimeDays}.`,
  },
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
 * The form input that reads back to this listing: what the form holds when it is filled in from a listing.
 * Text and number fields are strings and checkboxes are booleans, as the page sends them.
 * A provider who does not travel has no radiusKm here, so the form keeps its own default in that field.
 * @param {object} listing  A listing the form reader returned.
 */
export function inputOfListing(listing) {
  const { provider, contact, location, serviceArea, price, availability } = listing;
  const input = {
    title: listing.title,
    category: listing.category,
    description: listing.description,
    tags: listing.tags.join(", "),
    providerName: provider.name,
    providerType: provider.type,
    yearsExperience: String(provider.yearsExperience),
    phone: contact.phone,
    email: contact.email,
    country: location.country,
    city: location.city,
    address: location.address,
    postalCode: location.postalCode,
    travelsToClient: serviceArea.travelsToClient,
    remote: serviceArea.remote,
    priceFrom: String(price.from),
    priceTo: price.to === undefined ? "" : String(price.to),
    priceUnit: price.unit,
    calloutFee: price.calloutFee === undefined ? "" : String(price.calloutFee),
    negotiable: price.negotiable,
    languages: [...listing.languages],
    hours: Object.fromEntries(
      Object.entries(availability.hours).map(([day, slot]) => [day, slot ? { open: slot[0], close: slot[1] } : null]),
    ),
    leadTimeDays: String(availability.leadTimeDays),
    emergency: availability.emergency,
  };
  if (serviceArea.travelsToClient) input.radiusKm = String(serviceArea.radiusKm);
  return input;
}

/**
 * @param {{ categories: object[], countries: object[], cities: Array<{ name: string, country: string }>, PRICE_UNITS: string[], LANGUAGES: string[], WEEKDAYS: string[] }} catalog
 *   The vocabulary. A service can be added only in one of its cities, so the city filters and the tools keep their values.
 * @returns {(input: unknown, language?: "lt" | "en") =>
 *   { ok: true, listing: object, input: object } | { ok: false, errors: Array<{ field: string, message: string }> }}
 *   `language` is the language of the error messages: Lithuanian unless told otherwise.
 *   `listing` has everything a catalog listing has except the id: it is what gets stored, and the database gives
 *   it its id. `input` is the given input reduced to the known fields; reading it again gives the same listing.
 *   Errors come in the order of the form. A day of the working hours is reported as "hours.mon".
 */
export function createListingReader(catalog) {
  const categoryIds = new Set(catalog.categories.map((category) => category.id));
  const countryCodes = new Set(catalog.countries.map((country) => country.code));
  const countryOfCity = new Map(catalog.cities.map((city) => [city.name, city.country]));

  return function readListing(raw, language = "lt") {
    const input = isPlainObject(raw) ? raw : {};
    const messages = MESSAGES[language] ?? MESSAGES.lt;
    const weekdays = WEEKDAY_LABELS[language] ?? WEEKDAY_LABELS.lt;
    const errors = [];
    /** The message is looked up by the field, or by `key` where a field has more than one; `value` goes into it. */
    const fail = (field, key = field, value) => {
      const message = messages[key];
      errors.push({ field, message: typeof message === "function" ? message(value) : message });
    };

    const title = text(input.title);
    if (!between(title, LIMITS.title)) fail("title");

    const category = input.category;
    if (!categoryIds.has(category)) fail("category");

    const description = text(input.description);
    if (!between(description, LIMITS.description)) fail("description");

    const tags = readTags(input.tags);
    if (tags.length > LIMITS.tags || tags.some((tag) => tag.length > LIMITS.tagLength)) fail("tags");

    const providerName = text(input.providerName);
    if (!between(providerName, LIMITS.providerName)) fail("providerName");

    const providerType = input.providerType;
    if (!PROVIDER_TYPES.includes(providerType)) fail("providerType");

    const yearsExperience = number(input.yearsExperience);
    if (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > LIMITS.yearsExperience) {
      fail("yearsExperience");
    }

    const phone = text(input.phone);
    const phoneDigits = phone.replace(/\D/g, "").length;
    if (!PHONE_CHARACTERS.test(phone) || phoneDigits < 7 || phoneDigits > 15) fail("phone");

    const email = text(input.email).toLowerCase();
    if (!EMAIL.test(email) || email.length > LIMITS.emailLength) fail("email");

    const country = input.country;
    const countryKnown = countryCodes.has(country);
    if (!countryKnown) fail("country");

    const city = input.city;
    if (typeof city !== "string" || !countryOfCity.has(city) || (countryKnown && countryOfCity.get(city) !== country)) {
      fail("city");
    }

    const address = text(input.address);
    if (!between(address, LIMITS.address)) fail("address");

    let postalCode = text(input.postalCode).replace(/ /g, "");
    if (countryKnown) {
      const rule = POSTAL[country];
      const digits = rule?.pattern.exec(postalCode)?.[1];
      if (rule && digits === undefined) fail("postalCode", "postalCode", rule.example);
      else if (rule) postalCode = rule.write(digits);
    }

    const travelsToClient = input.travelsToClient === true;
    let radiusKm = 0;
    if (travelsToClient) {
      radiusKm = number(input.radiusKm);
      if (!Number.isInteger(radiusKm) || radiusKm < 1 || radiusKm > LIMITS.radiusKm) {
        fail("radiusKm");
      }
    }

    const priceFrom = number(input.priceFrom);
    const priceFromValid = Number.isFinite(priceFrom) && priceFrom > 0 && priceFrom <= LIMITS.price;
    if (!priceFromValid) fail("priceFrom");

    let priceTo;
    if (!blank(input.priceTo)) {
      priceTo = number(input.priceTo);
      if (!Number.isFinite(priceTo) || priceTo > LIMITS.price || (priceFromValid ? priceTo < priceFrom : priceTo <= 0)) {
        fail("priceTo");
      }
    }

    const priceUnit = input.priceUnit;
    if (!catalog.PRICE_UNITS.includes(priceUnit)) fail("priceUnit");

    let calloutFee;
    if (!blank(input.calloutFee)) {
      calloutFee = number(input.calloutFee);
      if (!Number.isFinite(calloutFee) || calloutFee < 0 || calloutFee > LIMITS.calloutFee) {
        fail("calloutFee");
      }
    }

    const given = Array.isArray(input.languages) ? input.languages : [];
    const languages = catalog.LANGUAGES.filter((code) => given.includes(code));
    if (languages.length === 0 || given.some((code) => !catalog.LANGUAGES.includes(code))) fail("languages");

    const givenHours = isPlainObject(input.hours) ? input.hours : {};
    const hours = {};
    let workingDays = 0;
    for (const day of catalog.WEEKDAYS) {
      const slot = readSlot(givenHours[day]);
      hours[day] = slot;
      if (slot === null) continue;
      workingDays += 1;
      if (!TIME.test(slot[0]) || !TIME.test(slot[1])) fail(`hours.${day}`, "hoursTimes", weekdays[day]);
      else if (slot[0] >= slot[1]) fail(`hours.${day}`, "hoursOrder", weekdays[day]);
    }
    if (workingDays === 0) fail("hours");

    // An emergency provider answers today, so a lead time makes no sense for one.
    const emergency = input.emergency === true;
    let leadTimeDays = 0;
    if (!emergency) {
      leadTimeDays = number(input.leadTimeDays);
      if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > LIMITS.leadTimeDays) {
        fail("leadTimeDays");
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
