// The page: one paged list of listings, a few controls, and the WebMCP tools wired to the same search.
// All DOM is built with createElement and textContent, so text coming from an agent can never become markup.

import * as baseCatalog from "./catalog.js";
import { computeAvailability } from "./availability.js";
import { browserStorage, createAuth } from "./auth.js";
import { createListingReader, WEEKDAY_LABEL } from "./listing-input.js";
import { createListingStore } from "./listing-store.js";
import { searchServices, SORT_OPTIONS } from "./search.js";
import { loadSqlite } from "./sqlite.js";
import { createTools } from "./tools.js";
import { createUserListings } from "./user-listings.js";
import { registerTools } from "./webmcp.js";

// The page's own copy of the catalog: the listings a person adds with the form are appended to its list.
const catalog = { ...baseCatalog, listings: [...baseCatalog.listings] };

const $ = (id) => document.getElementById(id);
const dom = {
  query: $("f-query"),
  category: $("f-category"),
  country: $("f-country"),
  city: $("f-city"),
  sort: $("f-sort"),
  open: $("f-open"),
  count: $("result-count"),
  chips: $("chips"),
  clearAll: $("clear-all"),
  notice: $("agent-notice"),
  pinned: $("pinned"),
  results: $("results"),
  pager: $("pager"),
  pagePrev: $("page-prev"),
  pageInfo: $("page-info"),
  pageNext: $("page-next"),
  empty: $("empty"),
  accountUser: $("account-user"),
  signIn: $("sign-in"),
  signOut: $("sign-out"),
  loginDialog: $("login-dialog"),
  loginForm: $("login-form"),
  loginUsername: $("login-username"),
  loginPassword: $("login-password"),
  loginError: $("login-error"),
  loginCancel: $("login-cancel"),
  loginReason: $("login-reason"),
  addService: $("add-service"),
  serviceDialog: $("service-dialog"),
  serviceForm: $("service-form"),
  serviceError: $("service-error"),
  serviceDraft: $("service-draft"),
  serviceCancel: $("service-cancel"),
  serviceLanguages: $("s-languages"),
  serviceHours: $("s-hours"),
};

// The fields of the new-service form, by the names the form reader uses.
const serviceFields = {
  title: $("s-title"),
  category: $("s-category"),
  description: $("s-description"),
  tags: $("s-tags"),
  providerName: $("s-provider-name"),
  providerType: $("s-provider-type"),
  yearsExperience: $("s-years"),
  phone: $("s-phone"),
  email: $("s-email"),
  country: $("s-country"),
  city: $("s-city"),
  address: $("s-address"),
  postalCode: $("s-postal"),
  travelsToClient: $("s-travels"),
  radiusKm: $("s-radius"),
  remote: $("s-remote"),
  priceFrom: $("s-price-from"),
  priceTo: $("s-price-to"),
  priceUnit: $("s-price-unit"),
  calloutFee: $("s-callout"),
  negotiable: $("s-negotiable"),
  leadTimeDays: $("s-lead"),
  emergency: $("s-emergency"),
};

const PAGE_SIZE = 10;

const categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
const countryByCode = new Map(catalog.countries.map((c) => [c.code, c]));
const listingById = new Map(catalog.listings.map((l) => [l.id, l]));

// Cities per country and the country of each city, worked out once: a new listing can only be in a city that is already here.
const countryOfCity = new Map(catalog.listings.map((l) => [l.location.city, l.location.country]));
const citiesByCountry = new Map(catalog.countries.map((country) => [country.code, []]));
for (const [city, code] of countryOfCity) citiesByCountry.get(code).push(city);
for (const cities of citiesByCountry.values()) cities.sort((a, b) => a.localeCompare(b, "lt"));

const UNIT_LABEL = { hour: "val.", job: "darbas", m2: "m²", visit: "vizitas", day: "diena" };
// The same units after "Kaina už" in the new-service form.
const PRICE_FOR_LABEL = { hour: "valandą", job: "darbą", m2: "m²", visit: "vizitą", day: "dieną" };
const LANGUAGE_LABEL = { lt: "lietuvių", lv: "latvių", et: "estų", en: "anglų", ru: "rusų" };
const SORT_LABEL = {
  relevance: "Aktualumas",
  rating: "Įvertinimas",
  price_asc: "Kaina: nuo mažiausios",
  price_desc: "Kaina: nuo didžiausios",
  soonest: "Greičiausiai laisvi",
};

const number = (value) => value.toLocaleString("lt-LT");

// What the page shows. `filters` has the same shape as the search_services input, without limit and offset.
let filters = {};
let page = 1;
let pinnedId = null;
let pinnedLabel = "";

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function option(value, label) {
  return el("option", { text: label, attrs: { value } });
}

// ── Controls ──────────────────────────────────────────────────────────────

function fillStaticControls() {
  dom.category.append(option("", "Visos kategorijos"), ...catalog.categories.map((c) => option(c.id, c.nameLt)));
  dom.country.append(option("", "Visos šalys"), ...catalog.countries.map((c) => option(c.code, c.nameLt)));
  dom.sort.append(option("", "Numatytasis"), ...SORT_OPTIONS.map((sort) => option(sort, SORT_LABEL[sort])));
}

function fillCities() {
  const countries = filters.country ? [countryByCode.get(filters.country)] : catalog.countries;
  const groups = countries.map((country) =>
    el("optgroup", { attrs: { label: country.nameLt } }, citiesByCountry.get(country.code).map((city) => option(city, city))),
  );
  const options = [option("", "Visi miestai"), ...groups];
  // A tool may ask for a city outside the chosen country (the result is then empty). Keep it visible in the control.
  const listed = countries.some((country) => citiesByCountry.get(country.code).includes(filters.city));
  if (filters.city && !listed) options.push(option(filters.city, filters.city));
  dom.city.replaceChildren(...options);
}

function syncControls() {
  // Leave the box alone while it already says the same thing, so typing (and trailing spaces) is not disturbed.
  if (dom.query.value.trim() !== (filters.query ?? "").trim()) dom.query.value = filters.query ?? "";
  dom.category.value = filters.category ?? "";
  dom.country.value = filters.country ?? "";
  fillCities();
  dom.city.value = filters.city ?? "";
  dom.sort.value = filters.sortBy ?? "";
  dom.open.checked = filters.openNow === true;
}

/** Any change made by a person: new filters, back to the first page, nothing pinned, no agent notice. */
function applyUserFilters(next) {
  filters = next;
  page = 1;
  pinnedId = null;
  hideNotice();
  render();
}

function setFilter(key, value) {
  const next = { ...filters };
  if (value === "" || value === undefined || value === false) delete next[key];
  else next[key] = value;
  // A city chosen earlier may not belong to the newly chosen country.
  if (key === "country" && next.city && next.country && countryOfCity.get(next.city) !== next.country) delete next.city;
  applyUserFilters(next);
}

function goToPage(nextPage) {
  page = nextPage;
  render();
  dom.count.scrollIntoView({ block: "start" });
}

function bindControls() {
  dom.query.addEventListener("input", () => setFilter("query", dom.query.value.trim() ? dom.query.value : ""));
  dom.category.addEventListener("change", () => setFilter("category", dom.category.value));
  dom.country.addEventListener("change", () => setFilter("country", dom.country.value));
  dom.city.addEventListener("change", () => setFilter("city", dom.city.value));
  dom.sort.addEventListener("change", () => setFilter("sortBy", dom.sort.value));
  dom.open.addEventListener("change", () => setFilter("openNow", dom.open.checked));
  dom.clearAll.addEventListener("click", () => applyUserFilters({}));
  dom.pagePrev.addEventListener("click", () => goToPage(page - 1));
  dom.pageNext.addEventListener("click", () => goToPage(page + 1));
}

// ── Chips: every active filter, including the ones only a tool can set ────

const CHIP_LABEL = {
  query: (v) => `Paieška: ${v}`,
  category: (v) => `Kategorija: ${categoryById.get(v)?.nameLt ?? v}`,
  country: (v) => `Šalis: ${countryByCode.get(v)?.nameLt ?? v}`,
  city: (v) => `Miestas: ${v}`,
  priceMax: (v) => `Kaina iki ${number(v)} €`,
  priceUnit: (v) => `Kaina už: ${UNIT_LABEL[v] ?? v}`,
  minRating: (v) => `Įvertinimas nuo ${number(v)}`,
  language: (v) => `Kalba: ${LANGUAGE_LABEL[v] ?? v}`,
  travelsToClient: (v) => (v ? "Atvyksta pas klientą" : "Neatvyksta pas klientą"),
  openNow: () => "Dirba dabar",
  availableWithinDays: (v) => (v === 0 ? "Laisvas šiandien" : `Laisvas per ${v} d.`),
  sortBy: (v) => `Rikiavimas: ${SORT_LABEL[v] ?? v}`,
};

function renderChips(usedSort) {
  const chips = Object.keys(CHIP_LABEL)
    .filter((key) => filters[key] !== undefined)
    .map((key) => {
      let label = CHIP_LABEL[key](filters[key]);
      // "Relevance" needs search words; without them the list is sorted by rating, and the chip says so.
      if (key === "sortBy" && usedSort !== filters.sortBy) label = `Rikiavimas: ${SORT_LABEL[usedSort]} (nėra paieškos žodžių)`;
      const remove = el("button", { text: "×", attrs: { type: "button", "aria-label": `Pašalinti filtrą: ${label}` } });
      remove.addEventListener("click", () => setFilter(key, undefined));
      return el("li", { className: "chip", attrs: { "data-filter": key } }, [el("span", { className: "chip-label", text: label }), remove]);
    });
  dom.chips.replaceChildren(...chips);
  dom.clearAll.hidden = chips.length === 0;
}

// ── Cards ─────────────────────────────────────────────────────────────────

function priceText(price) {
  const amount = price.to !== undefined && price.to !== price.from ? `${number(price.from)}–${number(price.to)} €` : `nuo ${number(price.from)} €`;
  const notes = [];
  if (price.calloutFee !== undefined) notes.push(`iškvietimas ${number(price.calloutFee)} €`);
  if (price.negotiable) notes.push("kaina derinama");
  return { amount, unit: `/ ${UNIT_LABEL[price.unit]}`, notes: notes.join(" · ") };
}

function freeText(availability) {
  if (availability.daysUntilFree === 0) return "šiandien";
  if (availability.daysUntilFree === 1) return "rytoj";
  return availability.nextFreeDate;
}

function serviceAreaText(area) {
  const parts = [area.travelsToClient ? `Atvyksta pas klientą (iki ${number(area.radiusKm)} km)` : "Tik teikėjo vietoje"];
  if (area.remote) parts.push("galima nuotoliu");
  return parts.join(", ");
}

function fact(term, ...content) {
  return el("div", {}, [el("dt", { text: term }), el("dd", {}, content)]);
}

function card({ listing, availability }, { pinned = false } = {}) {
  const { provider, location, contact } = listing;
  const price = priceText(listing.price);

  const providerLine = el("p", { className: "provider" }, [
    `${provider.name} · ${provider.type === "company" ? "įmonė" : "privatus meistras"} · ${provider.yearsExperience} m. patirtis`,
  ]);
  if (provider.verified) providerLine.append(" · ", el("span", { className: "verified", text: "✓ Patikrintas" }));

  const hoursText = availability.todayHours ? `Šiandien ${availability.todayHours[0]}–${availability.todayHours[1]}` : "Šiandien nedirba";
  const availabilityParts = [
    el("span", { className: `pill ${availability.openNow ? "open" : "closed"}`, text: availability.openNow ? "Dirba dabar" : "Dabar nedirba" }),
    `${hoursText} · Artimiausias laisvas laikas: ${freeText(availability)}`,
  ];
  if (availability.emergency) availabilityParts.push(" · Avarinė tarnyba 24/7");

  const priceBox = el("div", { className: "price" }, [el("strong", { text: price.amount }), el("span", { text: price.unit })]);
  if (price.notes) priceBox.append(el("small", { text: price.notes }));

  const badges = [el("span", { className: "badge", text: categoryById.get(listing.category)?.nameLt ?? listing.category })];
  if (listing.addedBy !== undefined) badges.push(el("span", { className: "badge own", text: "Pridėta šioje naršyklėje" }));

  // A listing that was just added has no reviews yet.
  const { rating } = listing;
  const ratingText = rating.count > 0 ? `★ ${number(rating.average)} (${number(rating.count)} atsiliepimai)` : "Atsiliepimų dar nėra";

  const attrs = { id: pinned ? "pinned-card" : `card-${listing.id}`, "data-id": listing.id };
  return el(pinned ? "div" : "li", { className: pinned ? "card highlight" : "card", attrs }, [
    el("div", { className: "card-head" }, [
      el("div", { className: "card-title" }, [...badges, el("h2", { text: listing.title }), providerLine]),
      priceBox,
    ]),
    el("p", { className: "desc", text: listing.description }),
    el("dl", { className: "facts" }, [
      fact("Vieta", `${location.address}, ${location.city}, ${countryByCode.get(location.country)?.nameLt ?? location.country}`),
      fact("Užimtumas", ...availabilityParts),
      fact("Įvertinimas", ratingText),
      fact("Kontaktai", `${contact.phone} · ${contact.email}`),
      fact("Kalbos", listing.languages.map((code) => LANGUAGE_LABEL[code] ?? code).join(", ")),
      fact("Aptarnavimas", serviceAreaText(listing.serviceArea)),
    ]),
    el("p", { className: "card-id", text: listing.id }),
  ]);
}

function renderPinned(now) {
  const listing = pinnedId ? listingById.get(pinnedId) : undefined;
  if (!listing) {
    dom.pinned.replaceChildren();
    dom.pinned.hidden = true;
    return;
  }
  const close = el("button", { className: "clear-all", text: "Uždaryti", attrs: { type: "button" } });
  close.addEventListener("click", () => {
    pinnedId = null;
    hideNotice();
    render();
  });
  dom.pinned.replaceChildren(
    el("div", { className: "pinned-head" }, [el("p", { text: pinnedLabel }), close]),
    card({ listing, availability: computeAvailability(listing.availability, now) }, { pinned: true }),
  );
  dom.pinned.hidden = false;
}

function render() {
  const now = new Date();
  const search = () => searchServices(catalog, { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, now);
  let result = search();
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const validPage = Math.min(pages, Math.max(1, Math.trunc(page) || 1));
  if (validPage !== page) {
    page = validPage;
    result = search();
  }

  syncControls();
  renderChips(result.sortBy);
  renderPinned(now);
  dom.results.replaceChildren(...result.items.map((item) => card(item)));
  dom.results.dataset.total = String(result.total);

  // Only touch the live region when the text changes, so screen readers do not repeat it.
  let countText = `Rasta paslaugų: ${number(result.total)} iš ${number(catalog.listings.length)}`;
  if (result.total > 0) countText += ` · rodoma ${number(result.offset + 1)}–${number(result.offset + result.items.length)}`;
  if (dom.count.textContent !== countText) dom.count.textContent = countText;

  dom.empty.hidden = result.total > 0;
  dom.pager.hidden = pages === 1;
  dom.pagePrev.disabled = page === 1;
  dom.pageNext.disabled = page === pages;
  dom.pageInfo.textContent = `Puslapis ${number(page)} iš ${number(pages)}`;
  return result;
}

// ── What a tool call does on the page ─────────────────────────────────────

function showNotice(text) {
  dom.notice.textContent = text;
  dom.notice.hidden = false;
}

function hideNotice() {
  dom.notice.hidden = true;
  dom.notice.textContent = "";
}

/** search_services: same filters as the agent used, opened at the page that holds the results it got back. */
function showFilters(nextFilters, view) {
  filters = { ...nextFilters };
  const offset = Number.isInteger(view?.offset) && view.offset > 0 ? view.offset : 0;
  page = Math.floor(offset / PAGE_SIZE) + 1;
  pinnedId = null;
  const result = render();
  showNotice(`DI agentas atliko paiešką ir pritaikė filtrus: rasta paslaugų – ${number(result.total)}.`);
}

/** get_service: show the listing above the list, whatever the filters and the page are. */
function showListing(id) {
  const listing = listingById.get(id);
  if (!listing) return;
  pinnedId = id;
  pinnedLabel = "DI agento atidaryta paslauga";
  render();
  dom.pinned.scrollIntoView({ block: "start", behavior: "smooth" });
  showNotice(`DI agentas atidarė paslaugą: ${listing.title}.`);
}

// ── Demo sign-in: shows who is using the page, locks nothing ──────────────

const auth = createAuth({ storage: browserStorage() });

function renderAccount() {
  const user = auth.currentUser();
  const text = user ? `Naudotojas: ${user.name}` : "";
  if (dom.accountUser.textContent !== text) dom.accountUser.textContent = text;
  dom.accountUser.hidden = !user;
  dom.signIn.hidden = Boolean(user);
  dom.signOut.hidden = !user;
}

// What to do once the person has signed in; set when the sign-in dialog was opened on the way to something else.
let afterSignIn = null;

function openLogin(next = null) {
  afterSignIn = next;
  dom.loginReason.hidden = next === null;
  dom.loginForm.reset();
  dom.loginError.hidden = true;
  dom.loginDialog.showModal();
}

function bindAccount() {
  dom.signIn.addEventListener("click", () => openLogin());
  dom.loginCancel.addEventListener("click", () => dom.loginDialog.close());
  // The form has method="dialog": a submit that is not stopped closes the dialog and sends nothing anywhere.
  dom.loginForm.addEventListener("submit", (event) => {
    if (auth.signIn(dom.loginUsername.value, dom.loginPassword.value).ok) {
      renderAccount();
      return;
    }
    event.preventDefault();
    dom.loginError.hidden = false;
    dom.loginPassword.value = "";
    dom.loginPassword.focus();
  });
  // The password does not stay in the page after the dialog closes, however it was closed.
  dom.loginDialog.addEventListener("close", () => {
    dom.loginForm.reset();
    const next = afterSignIn;
    afterSignIn = null;
    if (next && auth.currentUser()) next();
  });
  dom.signOut.addEventListener("click", () => {
    auth.signOut();
    renderAccount();
    dom.signIn.focus();
  });
  // Signing in or out, or adding a service, in another tab of this site.
  window.addEventListener("storage", () => {
    renderAccount();
    showStoredListings();
  });
}

// ── New service: a form for signed-in users; the listing stays in this browser ──

// The added listings are in a SQLite database, which is loaded after the page is shown: null until then.
let userListings = null;

async function openUserListings() {
  let store;
  try {
    store = createListingStore({ sqlite: await loadSqlite(), storage: browserStorage() });
  } catch (error) {
    // No WebAssembly, or the SQLite files did not arrive: the form still works, and says that nothing was saved.
    console.warn("SQLite did not start; added services will not be saved.", error);
  }
  userListings = createUserListings({ catalog, read: createListingReader(catalog), store });
  showStoredListings();
}

function adopt(listings) {
  for (const listing of listings) listingById.set(listing.id, listing);
}

/** Take in the stored listings the page does not show yet: the saved ones, then the ones added in another tab. */
function showStoredListings() {
  const added = userListings?.sync() ?? [];
  if (added.length === 0) return;
  adopt(added);
  render();
}

// One row per weekday: a checkbox for "works that day" and the two times.
const hourRows = new Map();

function fillServiceForm() {
  serviceFields.category.append(option("", "Pasirinkite kategoriją"), ...catalog.categories.map((c) => option(c.id, c.nameLt)));
  serviceFields.country.append(...catalog.countries.map((c) => option(c.code, c.nameLt)));
  serviceFields.priceUnit.append(...catalog.PRICE_UNITS.map((unit) => option(unit, PRICE_FOR_LABEL[unit] ?? unit)));

  // Defaults are written as attributes, so that form.reset() brings them back.
  dom.serviceLanguages.append(
    ...catalog.LANGUAGES.map((code, index) => {
      const attrs = { type: "checkbox", name: "languages", value: code };
      if (index === 0) attrs.checked = "";
      return el("label", { className: "check" }, [el("input", { attrs }), LANGUAGE_LABEL[code] ?? code]);
    }),
  );

  for (const day of catalog.WEEKDAYS) {
    const label = WEEKDAY_LABEL[day];
    const worksAttrs = { type: "checkbox" };
    if (day !== "sat" && day !== "sun") worksAttrs.checked = "";
    const works = el("input", { attrs: worksAttrs });
    const open = el("input", { attrs: { type: "time", value: "09:00", "aria-label": `${label}: dirbu nuo` } });
    const close = el("input", { attrs: { type: "time", value: "18:00", "aria-label": `${label}: dirbu iki` } });
    const row = el("div", { className: "hours-row" }, [el("label", { className: "check" }, [works, label]), open, "–", close]);
    hourRows.set(day, { row, works, open, close });
    dom.serviceHours.append(row);
  }
}

function fillServiceCities() {
  const cities = citiesByCountry.get(serviceFields.country.value) ?? [];
  serviceFields.city.replaceChildren(option("", "Pasirinkite miestą"), ...cities.map((city) => option(city, city)));
}

/** Fields that depend on a checkbox are switched off while they do not apply. */
function syncServiceForm() {
  for (const { works, open, close } of hourRows.values()) {
    open.disabled = !works.checked;
    close.disabled = !works.checked;
  }
  serviceFields.radiusKm.disabled = !serviceFields.travelsToClient.checked;
  serviceFields.leadTimeDays.disabled = serviceFields.emergency.checked;
}

/** The form as the input of the form reader in listing-input.js. */
function serviceInput() {
  const input = {};
  for (const [name, field] of Object.entries(serviceFields)) input[name] = field.type === "checkbox" ? field.checked : field.value;
  input.languages = [...dom.serviceLanguages.querySelectorAll("input:checked")].map((box) => box.value);
  input.hours = {};
  for (const [day, { works, open, close }] of hourRows) input.hours[day] = works.checked ? { open: open.value, close: close.value } : null;
  return input;
}

/** The opposite of serviceInput(): put a form input into the controls. A field the input does not have keeps its default. */
function setServiceInput(input) {
  dom.serviceForm.reset();
  clearServiceErrors();
  // The list of cities follows the country, so the country goes in first.
  serviceFields.country.value = input.country;
  fillServiceCities();
  for (const [name, field] of Object.entries(serviceFields)) {
    if (input[name] === undefined) continue;
    if (field.type === "checkbox") field.checked = input[name] === true;
    else field.value = input[name];
  }
  for (const box of dom.serviceLanguages.querySelectorAll("input")) box.checked = input.languages.includes(box.value);
  for (const [day, { works, open, close }] of hourRows) {
    const slot = input.hours[day];
    works.checked = Boolean(slot);
    if (slot) {
      open.value = slot.open;
      close.value = slot.close;
    }
  }
  syncServiceForm();
}

/** Where an error of a field is shown: the control that gets marked and the box the message is added to. */
function serviceErrorPlace(field) {
  if (field === "languages") return { control: dom.serviceLanguages.querySelector("input"), box: dom.serviceLanguages };
  if (field === "hours") return { control: hourRows.values().next().value.works, box: dom.serviceHours };
  if (field.startsWith("hours.")) {
    const row = hourRows.get(field.slice("hours.".length));
    return row ? { control: row.open, box: row.row } : undefined;
  }
  const control = serviceFields[field];
  return control ? { control, box: control.closest(".field") } : undefined;
}

function clearFieldError(control) {
  const messageId = control.getAttribute("aria-describedby");
  if (messageId) document.getElementById(messageId)?.remove();
  control.removeAttribute("aria-describedby");
  control.removeAttribute("aria-invalid");
}

function clearServiceErrors() {
  for (const control of dom.serviceForm.querySelectorAll("[aria-invalid]")) clearFieldError(control);
  dom.serviceError.hidden = true;
  dom.serviceError.textContent = "";
}

function showServiceErrors(errors, summary) {
  clearServiceErrors();
  let first;
  for (const { field, message } of errors) {
    const place = serviceErrorPlace(field);
    if (!place) continue;
    const messageId = `s-error-${field.replace(".", "-")}`;
    place.box.append(el("p", { className: "field-error", text: message, attrs: { id: messageId } }));
    place.control.setAttribute("aria-invalid", "true");
    place.control.setAttribute("aria-describedby", messageId);
    first ??= place.control;
  }
  dom.serviceError.textContent = summary ?? `Paslauga nepridėta. Pataisykite pažymėtus laukus: ${number(errors.length)}.`;
  dom.serviceError.hidden = false;
  first?.focus();
}

function openServiceForm() {
  if (!auth.currentUser()) {
    openLogin(openServiceForm);
    return;
  }
  dom.serviceDialog.showModal();
}

/**
 * draft_service: the agent's values go into the form and the form opens for the person to check and submit.
 * Nothing is added here. A signed-out person gets the sign-in first and the filled form right after it.
 */
function showDraft(input) {
  setServiceInput(input);
  dom.serviceDraft.hidden = false;
  const signedIn = Boolean(auth.currentUser());
  if (dom.serviceDialog.open) {
    dom.serviceDialog.scrollTop = 0;
  } else if (dom.loginDialog.open) {
    // The person is already at the sign-in: leave what they typed and open the form when they are done.
    afterSignIn = openServiceForm;
    dom.loginReason.hidden = false;
  } else {
    openServiceForm();
  }
  return { signedIn };
}

function bindServiceForm() {
  // What was typed stays in the form when it is cancelled; it is emptied only after the service is added.
  dom.addService.addEventListener("click", openServiceForm);
  dom.serviceCancel.addEventListener("click", () => dom.serviceDialog.close());
  serviceFields.country.addEventListener("change", fillServiceCities);
  dom.serviceForm.addEventListener("change", syncServiceForm);
  dom.serviceForm.addEventListener("input", (event) => {
    if (event.target.hasAttribute?.("aria-invalid")) clearFieldError(event.target);
  });

  // The form has method="dialog": a submit that is not stopped closes the dialog and sends nothing anywhere.
  dom.serviceForm.addEventListener("submit", (event) => {
    const user = auth.currentUser();
    if (!user) {
      event.preventDefault();
      showServiceErrors([], "Esate atsijungę. Uždarykite formą ir prisijunkite iš naujo: įvesti duomenys išliks.");
      return;
    }
    if (!userListings) {
      event.preventDefault();
      showServiceErrors([], "Duomenų bazė dar kraunama. Pabandykite dar kartą po akimirkos: įvesti duomenys išliks.");
      return;
    }
    const result = userListings.add(serviceInput(), user.username);
    if (!result.ok) {
      event.preventDefault();
      showServiceErrors(result.errors);
      return;
    }

    const { listing } = result;
    adopt([listing]);
    dom.serviceForm.reset();
    dom.serviceDraft.hidden = true;
    clearServiceErrors();
    fillServiceCities();
    syncServiceForm();

    pinnedId = listing.id;
    pinnedLabel = "Jūsų pridėta paslauga";
    render();
    showNotice(
      result.saved
        ? `Paslauga pridėta: ${listing.title} (${listing.id}). Ji saugoma tik šioje naršyklėje.`
        : `Paslauga pridėta: ${listing.title} (${listing.id}), bet naršyklė neleido jos išsaugoti: perkrovus puslapį ji dings.`,
    );
    // Closing the dialog puts the focus back on the button in the header; scroll to the new listing after that.
    dom.serviceDialog.addEventListener("close", () => dom.pinned.scrollIntoView({ block: "start" }), { once: true });
  });
}

// ── Start ─────────────────────────────────────────────────────────────────

fillStaticControls();
fillServiceForm();
fillServiceCities();
syncServiceForm();
bindControls();
bindAccount();
bindServiceForm();
renderAccount();
render();

// "Dirba dabar" depends on the clock, so refresh once a minute while the page is visible.
// Not while someone is using a control: an open dropdown would close.
setInterval(() => {
  const usingControls = document.activeElement?.closest?.(".controls") != null;
  if (!document.hidden && !usingControls) render();
}, 60_000);

// The tools are registered once the stored listings are in the catalog, so an agent never searches without them.
await openUserListings();
const tools = createTools({ catalog, now: () => new Date(), showFilters, showListing, showDraft });
await registerTools(tools);
