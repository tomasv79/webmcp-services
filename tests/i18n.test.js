import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEXT, UI_LANGUAGES, STORAGE_KEY, chooseLanguage, createI18n, formatNumber } from "../public/js/i18n.js";
import { createListingReader, MESSAGES, WEEKDAY_LABELS } from "../public/js/listing-input.js";
import { SORT_OPTIONS } from "../public/js/directory.js";
import * as data from "../catalog/data.js";

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const html = readFileSync(join(publicDir, "index.html"), "utf8");
const appSource = readFileSync(join(publicDir, "js/app.js"), "utf8");

function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
  };
}

const brokenStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};

test("i18n: both languages have the same texts, of the same kind, and none is empty", () => {
  assert.deepEqual(UI_LANGUAGES, ["lt", "en"]);
  assert.deepEqual(Object.keys(TEXT), UI_LANGUAGES);
  assert.deepEqual(Object.keys(TEXT.en).sort(), Object.keys(TEXT.lt).sort());
  for (const key of Object.keys(TEXT.lt)) {
    assert.equal(typeof TEXT.en[key], typeof TEXT.lt[key], key);
    for (const language of UI_LANGUAGES) {
      const entry = TEXT[language][key];
      assert.ok(typeof entry === "function" || (typeof entry === "string" && entry.trim() !== ""), `${language} ${key}`);
    }
    // A text with values takes the same number of them in both languages.
    if (typeof TEXT.lt[key] === "function") assert.equal(TEXT.en[key].length, TEXT.lt[key].length, key);
  }
});

test("i18n: a text with values is written out in both languages", () => {
  for (const language of UI_LANGUAGES) {
    for (const [key, entry] of Object.entries(TEXT[language])) {
      if (typeof entry !== "function") continue;
      const text = entry(...[2, 3].slice(0, entry.length));
      assert.equal(typeof text, "string", `${language} ${key}`);
      assert.doesNotMatch(text, /undefined|NaN/, `${language} ${key}`);
    }
  }
});

test("i18n: English counts one and many", () => {
  const en = createI18n({ storage: fakeStorage({ [STORAGE_KEY]: "en" }) });
  assert.equal(en.t("card.experience", 1), "1 year of experience");
  assert.equal(en.t("card.experience", 12), "12 years of experience");
  assert.equal(en.t("card.rating", 4.8, 1), "★ 4.8 (1 review)");
  assert.equal(en.t("card.rating", 4.8, 1234), "★ 4.8 (1,234 reviews)");
  assert.equal(en.t("chip.availableWithinDays", 0), "Available today");
  assert.equal(en.t("chip.availableWithinDays", 1), "Available within 1 day");
  assert.equal(en.t("card.priceRange", 25, 40.5), "€25–€40.5");
});

test("i18n: numbers are written the way the language writes them", () => {
  assert.equal(formatNumber("en", 1234.5), "1,234.5");
  assert.equal(formatNumber("lt", 4.8), "4,8");
  const lt = createI18n({ storage: fakeStorage({ [STORAGE_KEY]: "lt" }) });
  assert.equal(lt.number(4.8), "4,8");
  assert.equal(lt.t("card.priceFrom", 25), "nuo 25 €");
});

test("i18n: every text marked in index.html exists, and the markup holds the Lithuanian one word for word", () => {
  const marked = [...html.matchAll(/\sdata-i18n="([^"]+)"[^>]*>([^<]*)</g)];
  assert.ok(marked.length > 50, `${marked.length} marked texts`);
  for (const [, key, text] of marked) {
    assert.equal(typeof TEXT.en[key], "string", `${key} in English`);
    assert.equal(TEXT.lt[key], text, key);
  }

  const markedAttributes = [...html.matchAll(/<[^>]*\sdata-i18n-[a-z-]+="[^>]*>/g)].flatMap(([tag]) =>
    [...tag.matchAll(/\sdata-i18n-([a-z-]+)="([^"]+)"/g)].map(([, name, key]) => ({ tag, name, key })),
  );
  assert.ok(markedAttributes.length >= 8, `${markedAttributes.length} marked attributes`);
  const translated = /const TRANSLATED_ATTRIBUTES = (\[[^\]]*\]);/.exec(appSource);
  assert.ok(translated, "app.js lists the attributes it translates");
  for (const { tag, name, key } of markedAttributes) {
    assert.ok(JSON.parse(translated[1]).includes(name), `app.js translates ${name}`);
    assert.equal(typeof TEXT.en[key], "string", `${key} in English`);
    assert.equal(new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1], TEXT.lt[key], `${name} of ${key}`);
  }
});

test("i18n: no Lithuanian text is left in index.html outside the marked elements", () => {
  const unmarked = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(\sdata-i18n="[^"]+"[^>]*>)[^<]*</g, "$1<")
    .replace(/<[^>]*>/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\p{L}{2}/u.test(line));
  // The two language buttons name themselves; they are the same in both languages.
  assert.deepEqual(unmarked, ["LT", "EN"]);
});

test("i18n: every text app.js asks for exists", () => {
  const asked = new Set([...appSource.matchAll(/"([a-z]+(?:\.[A-Za-z_]+)+)"/g)].map((m) => m[1]));
  assert.ok(asked.size > 40, `${asked.size} keys`);
  for (const key of asked) assert.ok(key in TEXT.lt, `${key} is not in i18n.js`);
  assert.doesNotMatch(appSource, /[ąčęėįšųūž]/i, "app.js has no Lithuanian text of its own");

  // Texts named by a reason that auth.js or directory.js gives.
  const reasons = {
    "login.error": ["credentials", "unconfirmed", "exists", "password", "email", "rate", "closed", "unavailable"],
    "form.failed": ["unavailable", "limit", "refused"],
  };
  for (const [group, names] of Object.entries(reasons)) {
    assert.ok(appSource.includes(`t(\`${group}.\${`), `app.js uses ${group}`);
    for (const name of names) assert.equal(typeof TEXT.en[`${group}.${name}`], "string", `${group}.${name}`);
  }

  // Names looked up by a code from the catalog.
  const groups = { unit: data.PRICE_UNITS, priceFor: data.PRICE_UNITS, language: data.LANGUAGES, sort: SORT_OPTIONS };
  for (const [group, codes] of Object.entries(groups)) {
    assert.match(appSource, new RegExp(`labelOf\\("${group}"`), `app.js uses ${group}`);
    for (const code of codes) assert.equal(typeof TEXT.en[`${group}.${code}`], "string", `${group}.${code}`);
  }
});

test("i18n: the page opens in the saved language, else in the browser's, else in English", () => {
  assert.equal(chooseLanguage("lt", ["en-GB"]), "lt");
  assert.equal(chooseLanguage("en", ["lt"]), "en");
  assert.equal(chooseLanguage(null, ["lt-LT", "en"]), "lt");
  assert.equal(chooseLanguage(null, ["en-US", "lt"]), "en");
  assert.equal(chooseLanguage(null, ["de-DE", "LT"]), "lt");
  assert.equal(chooseLanguage(null, ["lv", "ru"]), "en");
  assert.equal(chooseLanguage(null), "en");
  assert.equal(chooseLanguage("de", ["lt"]), "lt");
  assert.equal(chooseLanguage(undefined, undefined), "en");
});

test("i18n: the chosen language is kept and read again", () => {
  const storage = fakeStorage();
  const i18n = createI18n({ storage, preferred: ["lt"] });
  assert.equal(i18n.language, "lt");
  assert.equal(i18n.t("account.signIn"), "Prisijungti");
  assert.equal(storage.items.size, 0, "nothing is stored until a language is chosen");

  assert.equal(i18n.setLanguage("en"), true);
  assert.equal(i18n.language, "en");
  assert.equal(i18n.t("account.signIn"), "Sign in");
  assert.equal(storage.items.get(STORAGE_KEY), "en");
  assert.equal(createI18n({ storage, preferred: ["lt"] }).language, "en");

  assert.equal(i18n.setLanguage("de"), false);
  assert.equal(i18n.language, "en");
  assert.equal(i18n.t("no.such.text"), undefined);
});

test("i18n: without a working storage the language still changes, until the reload", () => {
  for (const storage of [undefined, brokenStorage]) {
    const i18n = createI18n({ storage, preferred: ["lt"] });
    assert.equal(i18n.language, "lt");
    assert.equal(i18n.setLanguage("en"), true);
    assert.equal(i18n.t("account.signOut"), "Sign out");
  }
});

test("new service: the messages under the fields come in both languages", () => {
  assert.deepEqual(Object.keys(MESSAGES), UI_LANGUAGES);
  assert.deepEqual(Object.keys(MESSAGES.en), Object.keys(MESSAGES.lt));
  for (const key of Object.keys(MESSAGES.lt)) assert.equal(typeof MESSAGES.en[key], typeof MESSAGES.lt[key], key);
  assert.deepEqual(Object.keys(WEEKDAY_LABELS), UI_LANGUAGES);
  assert.deepEqual(Object.keys(WEEKDAY_LABELS.en), data.WEEKDAYS);

  const read = createListingReader(data);
  const empty = { country: "LT", travelsToClient: true, hours: { tue: { open: "18:00", close: "09:00" }, wed: { open: "", close: "" } } };
  const lt = read(empty);
  const en = read(empty, "en");
  assert.equal(lt.ok, false);
  assert.deepEqual(en.errors.map((error) => error.field), lt.errors.map((error) => error.field));
  assert.ok(lt.errors.length >= 15, `${lt.errors.length} errors`);
  for (const [index, error] of en.errors.entries()) {
    assert.equal(typeof error.message, "string", error.field);
    assert.notEqual(error.message, lt.errors[index].message, error.field);
    assert.doesNotMatch(error.message, /[ąčęėįšųūž]|undefined/i, error.field);
  }
  const message = (result, field) => result.errors.find((error) => error.field === field).message;
  assert.equal(message(en, "postalCode"), "Enter the postal code, e.g. LT-01103.");
  assert.equal(message(lt, "postalCode"), "Įrašykite pašto kodą, pvz., LT-01103.");
  assert.equal(message(en, "hours.tue"), "Tuesday: work must start before it ends.");
  assert.equal(message(en, "hours.wed"), "Wednesday: enter when work starts and ends.");
  // A language the form does not have falls back to Lithuanian, as before.
  assert.deepEqual(read(empty, "de").errors, lt.errors);
});

test("language: the header has one button per language, and the page starts as the Lithuanian markup says", () => {
  const start = html.indexOf('id="language"');
  const group = html.slice(start, html.indexOf("</div>", start));
  const buttons = [...group.matchAll(/<button[^>]*\sdata-language="([a-z]+)"[^>]*\saria-pressed="(true|false)"/g)];
  assert.deepEqual(buttons.map((m) => m[1]), UI_LANGUAGES);
  assert.deepEqual(buttons.map((m) => m[2]), ["true", "false"]);
  assert.match(html, /<html lang="lt">/);
  assert.match(appSource, /document\.documentElement\.lang = i18n\.language/);
});
