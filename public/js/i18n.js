// The page's own words in Lithuanian and English, and the choice between the two.
// Only what the page says itself is here. The listings are data: they bring their own Lithuanian and English text.
// The messages under a wrong field of the new-service form are in listing-input.js, next to the checks.
// Pure logic: the storage is passed in, so everything runs in Node tests without a browser.

export const UI_LANGUAGES = ["lt", "en"];

export const STORAGE_KEY = "webmcp-services.language";

const LOCALE = { lt: "lt-LT", en: "en-GB" };

/** A number as the language writes it: 1 234,5 in Lithuanian, 1,234.5 in English. */
export const formatNumber = (language, value) => value.toLocaleString(LOCALE[language] ?? LOCALE.lt);

const lt = (value) => formatNumber("lt", value);
const en = (value) => formatNumber("en", value);
const plural = (count, one, many) => `${en(count)} ${count === 1 ? one : many}`;

// An entry is a text, or a function where values go into the text.
// The texts that index.html holds are repeated in TEXT.lt word for word: the markup is the Lithuanian page.
export const TEXT = {
  lt: {
    "page.title": "Paslaugų katalogas (demo)",
    "page.description": "Demonstracinis paslaugų katalogas su WebMCP įrankiais. Visi duomenys išgalvoti.",
    "banner": "Demonstracinė svetainė: katalogo teikėjai, kontaktai, adresai ir kainos yra išgalvoti. Lankytojų pridėtų paslaugų niekas netikrina.",
    "site.title": "Paslaugų katalogas",
    "site.subtitle": "Meistrai ir paslaugų teikėjai Lietuvoje, Latvijoje ir Estijoje",
    "footer": "Demonstracinis projektas. Duomenys skirti tik WebMCP įrankių bandymams.",
    "language.label": "Kalba",

    "account.addService": "Pridėti paslaugą",
    "account.signIn": "Prisijungti",
    "account.signOut": "Atsijungti",
    "account.signUp": "Sukurti paskyrą",
    "account.user": (name) => `Naudotojas: ${name}`,
    "action.cancel": "Atšaukti",

    "login.title": "Prisijungimas",
    "login.titleNew": "Nauja paskyra",
    "login.reason": "Norėdami pridėti paslaugą, prisijunkite.",
    "login.note": "Paskyras saugo „Supabase“. Pasirinkite slaptažodį, kurio nenaudojate kitur.",
    "login.name": "Vardas",
    "login.email": "El. paštas",
    "login.password": "Slaptažodis",
    "login.toSignUp": "Neturiu paskyros",
    "login.toSignIn": "Jau turiu paskyrą",
    "login.confirm": "Paskyra sukurta. Išsiuntėme jums laišką: paspauskite jame esančią nuorodą ir grįšite čia jau prisijungę.",
    "login.confirmed": (name) => `Paskyra patvirtinta. Esate prisijungę: ${name}.`,
    "login.confirmFailed": "Patvirtinimo nuoroda nebegalioja. Prisijunkite arba sukurkite paskyrą iš naujo.",
    "login.error.credentials": "Neteisingas el. paštas arba slaptažodis.",
    "login.error.unconfirmed": "El. paštas dar nepatvirtintas. Paspauskite nuorodą laiške, kurį jums išsiuntėme.",
    "login.error.exists": "Paskyra su šiuo el. paštu jau yra. Prisijunkite.",
    "login.error.password": "Slaptažodis per silpnas. Pasirinkite ilgesnį.",
    "login.error.email": "Įrašykite galiojantį el. pašto adresą.",
    "login.error.rate": "Per daug bandymų. Pabandykite vėliau.",
    "login.error.closed": "Naujų paskyrų šiuo metu kurti negalima.",
    "login.error.unavailable": "Nepavyko pasiekti paskyrų tarnybos. Pabandykite dar kartą.",

    "field.category": "Kategorija",
    "field.country": "Šalis",
    "field.city": "Miestas",

    "form.title": "Nauja paslauga",
    "form.note": "Paslauga išsaugoma viešoje duomenų bazėje ir bus matoma visiems lankytojams bei DI agentams. Neveskite tikrų asmens duomenų.",
    "form.draft": "Šią formą užpildė DI agentas. Patikrinkite duomenis: paslauga bus pridėta tik tada, kai paspausite „Pridėti paslaugą“.",
    "form.optional": "(neprivaloma)",
    "form.group.service": "Paslauga",
    "form.name": "Pavadinimas",
    "form.chooseCategory": "Pasirinkite kategoriją",
    "form.tags": "Raktažodžiai",
    "form.tagsHint": "(neprivaloma, per kablelį)",
    "form.tagsPlaceholder": "pvz., santechnikas, vamzdžiai",
    "form.description": "Aprašymas",
    "form.group.provider": "Teikėjas",
    "form.providerName": "Vardas arba įmonės pavadinimas",
    "form.providerType": "Tipas",
    "form.providerType.individual": "Privatus meistras",
    "form.providerType.company": "Įmonė",
    "form.years": "Patirtis, metais",
    "form.phone": "Telefonas",
    "form.email": "El. paštas",
    "form.emailPlaceholder": "vardas@imone.example",
    "form.group.location": "Vieta",
    "form.chooseCity": "Pasirinkite miestą",
    "form.address": "Adresas",
    "form.addressPlaceholder": "Gatvė ir namo numeris",
    "form.postalCode": "Pašto kodas",
    "form.travels": "Atvykstu pas klientą",
    "form.radius": "Atvykimo atstumas, km",
    "form.remote": "Paslauga teikiama ir nuotoliu",
    "form.group.price": "Kaina, EUR",
    "form.priceFrom": "Kaina nuo",
    "form.priceTo": "Kaina iki",
    "form.priceUnit": "Kaina už",
    "form.callout": "Iškvietimo mokestis",
    "form.negotiable": "Kaina derinama",
    "form.group.languages": "Kalbos",
    "form.group.hours": "Darbo laikas",
    "form.hoursFrom": (day) => `${day}: dirbu nuo`,
    "form.hoursTo": (day) => `${day}: dirbu iki`,
    "form.lead": "Per kiek dienų galite pradėti",
    "form.emergency": "Avarinė tarnyba visą parą",
    "form.errors": (count) => `Paslauga nepridėta. Pataisykite pažymėtus laukus: ${lt(count)}.`,
    "form.signedOut": "Esate atsijungę. Uždarykite formą ir prisijunkite iš naujo: įvesti duomenys išliks.",
    "form.failed.unavailable": "Paslauga neišsaugota: nepavyko pasiekti duomenų bazės. Pabandykite dar kartą: įvesti duomenys išliks.",
    "form.failed.limit": "Paslauga neišsaugota: pasiekėte vienos paskyros paslaugų skaičiaus ribą.",
    "form.failed.refused": "Duomenų bazė paslaugos nepriėmė. Patikrinkite laukus ir pabandykite dar kartą.",

    "filters.label": "Paieška ir filtrai",
    "filters.query": "Paieška",
    "filters.queryPlaceholder": "pvz., santechnikas, valymas, Kaunas",
    "filters.sort": "Rikiuoti",
    "filters.openNow": "Dirba dabar",
    "filters.allCategories": "Visos kategorijos",
    "filters.allCountries": "Visos šalys",
    "filters.allCities": "Visi miestai",
    "filters.defaultSort": "Numatytasis",
    "filters.clearAll": "Išvalyti viską",

    "sort.relevance": "Aktualumas",
    "sort.rating": "Įvertinimas",
    "sort.price_asc": "Kaina: nuo mažiausios",
    "sort.price_desc": "Kaina: nuo didžiausios",
    "sort.soonest": "Greičiausiai laisvi",

    // After "/" in a price, and after "Kaina už" in the form and the chip.
    "unit.hour": "val.",
    "unit.job": "darbas",
    "unit.m2": "m²",
    "unit.visit": "vizitas",
    "unit.day": "diena",
    "priceFor.hour": "valandą",
    "priceFor.job": "darbą",
    "priceFor.m2": "m²",
    "priceFor.visit": "vizitą",
    "priceFor.day": "dieną",

    "language.lt": "lietuvių",
    "language.lv": "latvių",
    "language.et": "estų",
    "language.en": "anglų",
    "language.ru": "rusų",

    "chips.label": "Aktyvūs filtrai",
    "chip.query": (value) => `Paieška: ${value}`,
    "chip.category": (name) => `Kategorija: ${name}`,
    "chip.country": (name) => `Šalis: ${name}`,
    "chip.city": (name) => `Miestas: ${name}`,
    "chip.priceMax": (value) => `Kaina iki ${lt(value)} €`,
    "chip.priceUnit": (unit) => `Kaina už: ${unit}`,
    "chip.minRating": (value) => `Įvertinimas nuo ${lt(value)}`,
    "chip.language": (name) => `Kalba: ${name}`,
    "chip.travels": "Atvyksta pas klientą",
    "chip.doesNotTravel": "Neatvyksta pas klientą",
    "chip.openNow": "Dirba dabar",
    "chip.availableWithinDays": (days) => (days === 0 ? "Laisvas šiandien" : `Laisvas per ${lt(days)} d.`),
    "chip.sortBy": (name) => `Rikiavimas: ${name}`,
    "chip.sortFallback": (name) => `Rikiavimas: ${name} (nėra paieškos žodžių)`,
    "chip.remove": (label) => `Pašalinti filtrą: ${label}`,

    "results.count": (total, all) => `Rasta paslaugų: ${lt(total)} iš ${lt(all)}`,
    "results.shown": (first, last) => `rodoma ${lt(first)}–${lt(last)}`,
    "results.empty": "Pagal pasirinktus filtrus paslaugų nerasta.",
    "results.loading": "Kraunama…",
    "results.failed": "Nepavyko pasiekti katalogo duomenų bazės. Pabandykite dar kartą vėliau.",
    "pager.label": "Puslapiai",
    "pager.prev": "‹ Ankstesnis",
    "pager.next": "Kitas ›",
    "pager.info": (page, pages) => `Puslapis ${lt(page)} iš ${lt(pages)}`,

    "pinned.label": "Atidaryta paslauga",
    "pinned.byAgent": "DI agento atidaryta paslauga",
    "pinned.own": "Jūsų pridėta paslauga",
    "pinned.close": "Uždaryti",

    "card.type.company": "įmonė",
    "card.type.individual": "privatus meistras",
    "card.experience": (years) => `${lt(years)} m. patirtis`,
    "card.verified": "✓ Patikrintas",
    "card.own": "Pridėta lankytojo",
    "card.priceFrom": (from) => `nuo ${lt(from)} €`,
    "card.priceRange": (from, to) => `${lt(from)}–${lt(to)} €`,
    "card.callout": (fee) => `iškvietimas ${lt(fee)} €`,
    "card.negotiable": "kaina derinama",
    "card.openNow": "Dirba dabar",
    "card.closedNow": "Dabar nedirba",
    "card.todayHours": (open, close) => `Šiandien ${open}–${close}`,
    "card.todayClosed": "Šiandien nedirba",
    "card.nextFree": (when) => `Artimiausias laisvas laikas: ${when}`,
    "card.today": "šiandien",
    "card.tomorrow": "rytoj",
    "card.emergency": "Avarinė tarnyba 24/7",
    "card.rating": (average, count) => `★ ${lt(average)} (${lt(count)} atsiliepimai)`,
    "card.noReviews": "Atsiliepimų dar nėra",
    "card.travels": (km) => `Atvyksta pas klientą (iki ${lt(km)} km)`,
    "card.onSite": "Tik teikėjo vietoje",
    "card.remote": "galima nuotoliu",
    "fact.location": "Vieta",
    "fact.availability": "Užimtumas",
    "fact.rating": "Įvertinimas",
    "fact.contact": "Kontaktai",
    "fact.languages": "Kalbos",
    "fact.serviceArea": "Aptarnavimas",

    "notice.search": (total) => `DI agentas atliko paiešką ir pritaikė filtrus: rasta paslaugų – ${lt(total)}.`,
    "notice.opened": (title) => `DI agentas atidarė paslaugą: ${title}.`,
    "notice.added": (title, id) => `Paslauga pridėta: ${title} (${id}). Ją mato visi lankytojai.`,
  },

  en: {
    "page.title": "Services directory (demo)",
    "page.description": "Demo services directory with WebMCP tools. All data is fictional.",
    "banner": "Demo site: the providers, contacts, addresses and prices of the catalog are fictional. Nobody checks the services that visitors add.",
    "site.title": "Services directory",
    "site.subtitle": "Tradespeople and service providers in Lithuania, Latvia and Estonia",
    "footer": "Demo project. The data is only for trying out WebMCP tools.",
    "language.label": "Language",

    "account.addService": "Add service",
    "account.signIn": "Sign in",
    "account.signOut": "Sign out",
    "account.signUp": "Create account",
    "account.user": (name) => `Signed in as ${name}`,
    "action.cancel": "Cancel",

    "login.title": "Sign in",
    "login.titleNew": "New account",
    "login.reason": "Sign in to add a service.",
    "login.note": "Accounts are kept by Supabase. Choose a password you do not use anywhere else.",
    "login.name": "Name",
    "login.email": "Email",
    "login.password": "Password",
    "login.toSignUp": "I have no account",
    "login.toSignIn": "I already have an account",
    "login.confirm": "Account created. We sent you an email: follow the link in it and you will come back here signed in.",
    "login.confirmed": (name) => `Account confirmed. You are signed in as ${name}.`,
    "login.confirmFailed": "The confirmation link is no longer valid. Sign in, or create the account again.",
    "login.error.credentials": "Wrong email or password.",
    "login.error.unconfirmed": "The email is not confirmed yet. Follow the link in the email we sent you.",
    "login.error.exists": "An account with this email already exists. Sign in instead.",
    "login.error.password": "The password is too weak. Choose a longer one.",
    "login.error.email": "Enter a valid email address.",
    "login.error.rate": "Too many attempts. Try again later.",
    "login.error.closed": "New accounts cannot be created at the moment.",
    "login.error.unavailable": "The account service could not be reached. Try again.",

    "field.category": "Category",
    "field.country": "Country",
    "field.city": "City",

    "form.title": "New service",
    "form.note": "The service is saved in a public database, and every visitor and AI agent will see it. Do not enter real personal data.",
    "form.draft": "An AI agent filled in this form. Check the details: the service is added only when you press “Add service”.",
    "form.optional": "(optional)",
    "form.group.service": "Service",
    "form.name": "Title",
    "form.chooseCategory": "Choose a category",
    "form.tags": "Keywords",
    "form.tagsHint": "(optional, separated by commas)",
    "form.tagsPlaceholder": "e.g. plumber, pipes",
    "form.description": "Description",
    "form.group.provider": "Provider",
    "form.providerName": "Name or company name",
    "form.providerType": "Type",
    "form.providerType.individual": "Sole trader",
    "form.providerType.company": "Company",
    "form.years": "Experience, years",
    "form.phone": "Phone",
    "form.email": "Email",
    "form.emailPlaceholder": "name@company.example",
    "form.group.location": "Location",
    "form.chooseCity": "Choose a city",
    "form.address": "Address",
    "form.addressPlaceholder": "Street and house number",
    "form.postalCode": "Postal code",
    "form.travels": "I travel to the client",
    "form.radius": "Travel distance, km",
    "form.remote": "The service is also provided remotely",
    "form.group.price": "Price, EUR",
    "form.priceFrom": "Price from",
    "form.priceTo": "Price to",
    "form.priceUnit": "Price per",
    "form.callout": "Call-out fee",
    "form.negotiable": "Price is negotiable",
    "form.group.languages": "Languages",
    "form.group.hours": "Working hours",
    "form.hoursFrom": (day) => `${day}: open from`,
    "form.hoursTo": (day) => `${day}: open until`,
    "form.lead": "Days until you can start",
    "form.emergency": "24-hour emergency service",
    "form.errors": (count) => `The service was not added. Fields to correct: ${en(count)}.`,
    "form.signedOut": "You are signed out. Close the form and sign in again: what you entered will stay.",
    "form.failed.unavailable": "The service was not saved: the database could not be reached. Try again: what you entered will stay.",
    "form.failed.limit": "The service was not saved: you have reached the number of services one account may add.",
    "form.failed.refused": "The database did not accept the service. Check the fields and try again.",

    "filters.label": "Search and filters",
    "filters.query": "Search",
    "filters.queryPlaceholder": "e.g. plumber, cleaning, Kaunas",
    "filters.sort": "Sort by",
    "filters.openNow": "Open now",
    "filters.allCategories": "All categories",
    "filters.allCountries": "All countries",
    "filters.allCities": "All cities",
    "filters.defaultSort": "Default",
    "filters.clearAll": "Clear all",

    "sort.relevance": "Relevance",
    "sort.rating": "Rating",
    "sort.price_asc": "Price: low to high",
    "sort.price_desc": "Price: high to low",
    "sort.soonest": "Soonest available",

    "unit.hour": "hour",
    "unit.job": "job",
    "unit.m2": "m²",
    "unit.visit": "visit",
    "unit.day": "day",
    "priceFor.hour": "hour",
    "priceFor.job": "job",
    "priceFor.m2": "m²",
    "priceFor.visit": "visit",
    "priceFor.day": "day",

    "language.lt": "Lithuanian",
    "language.lv": "Latvian",
    "language.et": "Estonian",
    "language.en": "English",
    "language.ru": "Russian",

    "chips.label": "Active filters",
    "chip.query": (value) => `Search: ${value}`,
    "chip.category": (name) => `Category: ${name}`,
    "chip.country": (name) => `Country: ${name}`,
    "chip.city": (name) => `City: ${name}`,
    "chip.priceMax": (value) => `Price up to €${en(value)}`,
    "chip.priceUnit": (unit) => `Price per: ${unit}`,
    "chip.minRating": (value) => `Rating from ${en(value)}`,
    "chip.language": (name) => `Language: ${name}`,
    "chip.travels": "Travels to the client",
    "chip.doesNotTravel": "Does not travel to the client",
    "chip.openNow": "Open now",
    "chip.availableWithinDays": (days) => (days === 0 ? "Available today" : `Available within ${plural(days, "day", "days")}`),
    "chip.sortBy": (name) => `Sort: ${name}`,
    "chip.sortFallback": (name) => `Sort: ${name} (no search words)`,
    "chip.remove": (label) => `Remove filter: ${label}`,

    "results.count": (total, all) => `Services found: ${en(total)} of ${en(all)}`,
    "results.shown": (first, last) => `showing ${en(first)}–${en(last)}`,
    "results.empty": "No services match the selected filters.",
    "results.loading": "Loading…",
    "results.failed": "The directory database could not be reached. Try again later.",
    "pager.label": "Pages",
    "pager.prev": "‹ Previous",
    "pager.next": "Next ›",
    "pager.info": (page, pages) => `Page ${en(page)} of ${en(pages)}`,

    "pinned.label": "Opened service",
    "pinned.byAgent": "Service opened by the AI agent",
    "pinned.own": "The service you added",
    "pinned.close": "Close",

    "card.type.company": "company",
    "card.type.individual": "sole trader",
    "card.experience": (years) => `${plural(years, "year", "years")} of experience`,
    "card.verified": "✓ Verified",
    "card.own": "Added by a visitor",
    "card.priceFrom": (from) => `from €${en(from)}`,
    "card.priceRange": (from, to) => `€${en(from)}–€${en(to)}`,
    "card.callout": (fee) => `call-out fee €${en(fee)}`,
    "card.negotiable": "price negotiable",
    "card.openNow": "Open now",
    "card.closedNow": "Closed now",
    "card.todayHours": (open, close) => `Today ${open}–${close}`,
    "card.todayClosed": "Closed today",
    "card.nextFree": (when) => `Next available: ${when}`,
    "card.today": "today",
    "card.tomorrow": "tomorrow",
    "card.emergency": "24/7 emergency service",
    "card.rating": (average, count) => `★ ${en(average)} (${plural(count, "review", "reviews")})`,
    "card.noReviews": "No reviews yet",
    "card.travels": (km) => `Travels to the client (up to ${en(km)} km)`,
    "card.onSite": "At the provider's premises only",
    "card.remote": "remote possible",
    "fact.location": "Location",
    "fact.availability": "Availability",
    "fact.rating": "Rating",
    "fact.contact": "Contact",
    "fact.languages": "Languages",
    "fact.serviceArea": "Service area",

    "notice.search": (total) => `The AI agent ran a search and applied the filters: services found – ${en(total)}.`,
    "notice.opened": (title) => `The AI agent opened a service: ${title}.`,
    "notice.added": (title, id) => `Service added: ${title} (${id}). Every visitor can see it.`,
  },
};

/**
 * The language the page opens in: the one chosen here before, else the first of the browser's languages
 * that the page has, else English, which more visitors read than Lithuanian.
 * @param {unknown} saved  What the storage holds.
 * @param {readonly string[]} [preferred]  The browser's languages, most wanted first, e.g. ["en-GB", "lt"].
 */
export function chooseLanguage(saved, preferred = []) {
  if (UI_LANGUAGES.includes(saved)) return saved;
  for (const tag of preferred ?? []) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (UI_LANGUAGES.includes(base)) return base;
  }
  return "en";
}

/**
 * @param {{ storage?: Storage, preferred?: readonly string[] }} [options]
 *   Without a working storage the chosen language lasts until the page is reloaded.
 * @returns {{
 *   readonly language: "lt" | "en",
 *   setLanguage: (language: string) => boolean,
 *   t: (key: string, ...values: unknown[]) => string | undefined,
 *   number: (value: number) => string,
 * }}
 */
export function createI18n({ storage, preferred } = {}) {
  let saved = null;
  try {
    saved = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Blocked storage: the browser's languages decide.
  }
  let language = chooseLanguage(saved, preferred);

  return {
    get language() {
      return language;
    },

    /** False, and nothing changes, when the page does not have the language. */
    setLanguage(next) {
      if (!UI_LANGUAGES.includes(next)) return false;
      language = next;
      try {
        storage?.setItem(STORAGE_KEY, next);
      } catch {
        // Blocked or full storage: the choice lasts until the reload.
      }
      return true;
    },

    /** The text under `key` in the current language; undefined when there is no such text. */
    t(key, ...values) {
      const entry = TEXT[language][key];
      return typeof entry === "function" ? entry(...values) : entry;
    },

    number: (value) => formatNumber(language, value),
  };
}
