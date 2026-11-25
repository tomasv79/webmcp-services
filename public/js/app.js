// The page: one paged list of listings, a few controls, and the WebMCP tools wired to the same search.
// All DOM is built with createElement and textContent, so text coming from an agent can never become markup.

import * as catalog from "./catalog.js";
import { computeAvailability } from "./availability.js";
import { searchServices, SORT_OPTIONS } from "./search.js";
import { createTools } from "./tools.js";
import { registerTools } from "./webmcp.js";

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
};

const PAGE_SIZE = 10;

const categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
const countryByCode = new Map(catalog.countries.map((c) => [c.code, c]));
const listingById = new Map(catalog.listings.map((l) => [l.id, l]));

// Cities per country and the country of each city, worked out once: the catalog does not change.
const countryOfCity = new Map(catalog.listings.map((l) => [l.location.city, l.location.country]));
const citiesByCountry = new Map(catalog.countries.map((country) => [country.code, []]));
for (const [city, code] of countryOfCity) citiesByCountry.get(code).push(city);
for (const cities of citiesByCountry.values()) cities.sort((a, b) => a.localeCompare(b, "lt"));

const UNIT_LABEL = { hour: "val.", job: "darbas", m2: "m²", visit: "vizitas", day: "diena" };
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

  const attrs = { id: pinned ? "pinned-card" : `card-${listing.id}`, "data-id": listing.id };
  return el(pinned ? "div" : "li", { className: pinned ? "card highlight" : "card", attrs }, [
    el("div", { className: "card-head" }, [
      el("div", { className: "card-title" }, [
        el("span", { className: "badge", text: categoryById.get(listing.category)?.nameLt ?? listing.category }),
        el("h2", { text: listing.title }),
        providerLine,
      ]),
      priceBox,
    ]),
    el("p", { className: "desc", text: listing.description }),
    el("dl", { className: "facts" }, [
      fact("Vieta", `${location.address}, ${location.city}, ${countryByCode.get(location.country)?.nameLt ?? location.country}`),
      fact("Užimtumas", ...availabilityParts),
      fact("Įvertinimas", `★ ${number(listing.rating.average)} (${number(listing.rating.count)} atsiliepimai)`),
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
    el("div", { className: "pinned-head" }, [el("p", { text: "DI agento atidaryta paslauga" }), close]),
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
  render();
  dom.pinned.scrollIntoView({ block: "start", behavior: "smooth" });
  showNotice(`DI agentas atidarė paslaugą: ${listing.title}.`);
}

// ── Start ─────────────────────────────────────────────────────────────────

fillStaticControls();
bindControls();
render();

// "Dirba dabar" depends on the clock, so refresh once a minute while the page is visible.
// Not while someone is using a control: an open dropdown would close.
setInterval(() => {
  const usingControls = document.activeElement?.closest?.(".controls") != null;
  if (!document.hidden && !usingControls) render();
}, 60_000);

const tools = createTools({ catalog, now: () => new Date(), showFilters, showListing });
await registerTools(tools);
