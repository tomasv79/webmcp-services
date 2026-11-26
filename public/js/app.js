// The page: one paged list of listings, a few controls, and the WebMCP tools wired to the same search.
// The listings and the accounts are in a Supabase project; the page asks it for one page of the list at a time.
// All DOM is built with createElement and textContent, so text coming from an agent can never become markup.

import * as catalog from "./vocabulary.js";
import { computeAvailability } from "./availability.js";
import { browserStorage, createAuth } from "./auth.js";
import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";
import { createDirectory, SORT_OPTIONS, sortFor } from "./directory.js";
import { createI18n } from "./i18n.js";
import { createListingReader, WEEKDAY_LABELS } from "./listing-input.js";
import { createSupabase } from "./supabase.js";
import { createTools } from "./tools.js";
import { registerTools } from "./webmcp.js";

const supabase = createSupabase({ url: SUPABASE_URL, key: SUPABASE_KEY });
const auth = createAuth({ client: supabase, storage: browserStorage() });
const directory = createDirectory({ client: supabase, catalog, token: () => auth.token() });
const readListing = createListingReader(catalog);

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
  language: $("language"),
  loginDialog: $("login-dialog"),
  loginForm: $("login-form"),
  loginTitle: $("login-title"),
  loginNameField: $("login-name-field"),
  loginName: $("login-name"),
  loginEmail: $("login-email"),
  loginPassword: $("login-password"),
  loginMode: $("login-mode"),
  loginSubmit: $("login-submit"),
  loginError: $("login-error"),
  loginCancel: $("login-cancel"),
  loginReason: $("login-reason"),
  serviceSubmit: $("service-submit"),
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
const TYPING_PAUSE_MS = 200;

const categoryById = new Map(catalog.categories.map((c) => [c.id, c]));
const countryByCode = new Map(catalog.countries.map((c) => [c.code, c]));

// Cities per country and the country of each city, worked out once: a new listing can only be in a city that is already here.
const countryOfCity = new Map(catalog.cities.map((city) => [city.name, city.country]));
const citiesByCountry = new Map(catalog.countries.map((country) => [country.code, []]));
for (const [city, code] of countryOfCity) citiesByCountry.get(code).push(city);
for (const cities of citiesByCountry.values()) cities.sort((a, b) => a.localeCompare(b, "lt"));

// ── Language: the page's own words are Lithuanian or English; the texts are in i18n.js ──

const i18n = createI18n({ storage: browserStorage(), preferred: globalThis.navigator?.languages });
const { t, number } = i18n;
const inEnglish = () => i18n.language === "en";

/** A name from one of the small tables of i18n.js ("unit", "priceFor", "language", "sort"), or the code itself. */
const labelOf = (group, code) => t(`${group}.${code}`) ?? code;
const weekdayLabel = (day) => WEEKDAY_LABELS[i18n.language][day];

// The catalog has both names of a category and a country, and both texts of a listing.
// A listing added with the form has one text, whatever the language.
const nameOf = (entry) => (inEnglish() ? entry.nameEn : entry.nameLt);
const titleOf = (listing) => (inEnglish() ? listing.titleEn : listing.title);
const descriptionOf = (listing) => (inEnglish() ? listing.descriptionEn : listing.description);
const categoryName = (id) => {
  const category = categoryById.get(id);
  return category ? nameOf(category) : id;
};
const countryName = (code) => {
  const country = countryByCode.get(code);
  return country ? nameOf(country) : code;
};

// What the page shows. `filters` has the same shape as the search_services input, without limit and offset.
let filters = {};
let page = 1;
// The listing shown above the list, and the i18n.js key of the line above it.
let pinned = null;
let pinnedLabel = "";
// The last answer of the database; null before the first one and after a search that did not get through.
let shown = null;
let failed = false;
// Counts the searches, so that an answer that arrives after a newer search has started is dropped.
let searches = 0;
let searchTimer;

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

// Texts of elements that are built once: written now and again whenever the language changes.
const relabels = [];

function live(write) {
  relabels.push(write);
  write();
}

/** An option that is built once; `label` gives its text in the current language. */
function liveOption(value, label) {
  const node = option(value, "");
  live(() => {
    node.textContent = label();
  });
  return node;
}

const TRANSLATED_ATTRIBUTES = ["aria-label", "placeholder", "content"];

/** The texts written in index.html: data-i18n names the text of an element, data-i18n-<attribute> of an attribute. */
function showStaticText() {
  document.documentElement.lang = i18n.language;
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  for (const name of TRANSLATED_ATTRIBUTES) {
    for (const node of document.querySelectorAll(`[data-i18n-${name}]`)) node.setAttribute(name, t(node.getAttribute(`data-i18n-${name}`)));
  }
  for (const button of dom.language.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.language === i18n.language));
  }
}

/** Everything that depends on the language and is not drawn again by render(). */
function showLanguage() {
  showStaticText();
  fillStaticControls();
  for (const write of relabels) write();
}

function bindLanguage() {
  dom.language.addEventListener("click", (event) => {
    const language = event.target.closest?.("button")?.dataset.language;
    if (!language || language === i18n.language || !i18n.setLanguage(language)) return;
    showLanguage();
    // Messages under the fields of the new-service form are in the old language; the next submit shows them again.
    clearServiceErrors();
    showLoginError(loginError);
    renderAccount();
    renderNotice();
    // The listings on screen are drawn again in the new language; the database is not asked again.
    draw();
  });
}

// ── Controls ──────────────────────────────────────────────────────────────

/** The options are written again when the language changes; render() then puts the chosen values back. */
function fillStaticControls() {
  dom.category.replaceChildren(option("", t("filters.allCategories")), ...catalog.categories.map((c) => option(c.id, nameOf(c))));
  dom.country.replaceChildren(option("", t("filters.allCountries")), ...catalog.countries.map((c) => option(c.code, nameOf(c))));
  dom.sort.replaceChildren(option("", t("filters.defaultSort")), ...SORT_OPTIONS.map((sort) => option(sort, labelOf("sort", sort))));
}

function fillCities() {
  const countries = filters.country ? [countryByCode.get(filters.country)] : catalog.countries;
  const groups = countries.map((country) =>
    el("optgroup", { attrs: { label: nameOf(country) } }, citiesByCountry.get(country.code).map((city) => option(city, city))),
  );
  const options = [option("", t("filters.allCities")), ...groups];
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

/**
 * Any change made by a person: new filters, back to the first page, nothing pinned, no agent notice.
 * With `typing` the database is asked only after a short pause, so not once per letter.
 */
function applyUserFilters(next, { typing = false } = {}) {
  filters = next;
  page = 1;
  pinned = null;
  hideNotice();
  if (!typing) {
    render();
    return;
  }
  // An answer to an older search no longer fits what the controls say.
  searches += 1;
  drawFrame(new Date());
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, TYPING_PAUSE_MS);
}

function setFilter(key, value, options) {
  const next = { ...filters };
  if (value === "" || value === undefined || value === false) delete next[key];
  else next[key] = value;
  // A city chosen earlier may not belong to the newly chosen country.
  if (key === "country" && next.city && next.country && countryOfCity.get(next.city) !== next.country) delete next.city;
  applyUserFilters(next, options);
}

function goToPage(nextPage) {
  page = nextPage;
  render();
  dom.count.scrollIntoView({ block: "start" });
}

function bindControls() {
  dom.query.addEventListener("input", () => setFilter("query", dom.query.value.trim() ? dom.query.value : "", { typing: true }));
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
  query: (v) => t("chip.query", v),
  category: (v) => t("chip.category", categoryName(v)),
  country: (v) => t("chip.country", countryName(v)),
  city: (v) => t("chip.city", v),
  priceMax: (v) => t("chip.priceMax", v),
  priceUnit: (v) => t("chip.priceUnit", labelOf("priceFor", v)),
  minRating: (v) => t("chip.minRating", v),
  language: (v) => t("chip.language", labelOf("language", v)),
  travelsToClient: (v) => (v ? t("chip.travels") : t("chip.doesNotTravel")),
  openNow: () => t("chip.openNow"),
  availableWithinDays: (v) => t("chip.availableWithinDays", v),
  sortBy: (v) => t("chip.sortBy", labelOf("sort", v)),
};

function renderChips(usedSort) {
  const chips = Object.keys(CHIP_LABEL)
    .filter((key) => filters[key] !== undefined)
    .map((key) => {
      let label = CHIP_LABEL[key](filters[key]);
      // "Relevance" needs search words; without them the list is sorted by rating, and the chip says so.
      if (key === "sortBy" && usedSort !== filters.sortBy) label = t("chip.sortFallback", labelOf("sort", usedSort));
      const remove = el("button", { text: "×", attrs: { type: "button", "aria-label": t("chip.remove", label) } });
      remove.addEventListener("click", () => setFilter(key, undefined));
      return el("li", { className: "chip", attrs: { "data-filter": key } }, [el("span", { className: "chip-label", text: label }), remove]);
    });
  dom.chips.replaceChildren(...chips);
  dom.clearAll.hidden = chips.length === 0;
}

// ── Cards ─────────────────────────────────────────────────────────────────

function priceText(price) {
  const amount = price.to !== undefined && price.to !== price.from ? t("card.priceRange", price.from, price.to) : t("card.priceFrom", price.from);
  const notes = [];
  if (price.calloutFee !== undefined) notes.push(t("card.callout", price.calloutFee));
  if (price.negotiable) notes.push(t("card.negotiable"));
  return { amount, unit: `/ ${labelOf("unit", price.unit)}`, notes: notes.join(" · ") };
}

function freeText(availability) {
  if (availability.daysUntilFree === 0) return t("card.today");
  if (availability.daysUntilFree === 1) return t("card.tomorrow");
  return availability.nextFreeDate;
}

function serviceAreaText(area) {
  const parts = [area.travelsToClient ? t("card.travels", area.radiusKm) : t("card.onSite")];
  if (area.remote) parts.push(t("card.remote"));
  return parts.join(", ");
}

function fact(term, ...content) {
  return el("div", {}, [el("dt", { text: term }), el("dd", {}, content)]);
}

function card({ listing, availability }, { pinned = false } = {}) {
  const { provider, location, contact } = listing;
  const price = priceText(listing.price);

  const providerLine = el("p", { className: "provider" }, [
    `${provider.name} · ${t(provider.type === "company" ? "card.type.company" : "card.type.individual")} · ${t("card.experience", provider.yearsExperience)}`,
  ]);
  if (provider.verified) providerLine.append(" · ", el("span", { className: "verified", text: t("card.verified") }));

  const hoursText = availability.todayHours ? t("card.todayHours", ...availability.todayHours) : t("card.todayClosed");
  const availabilityParts = [
    el("span", { className: `pill ${availability.openNow ? "open" : "closed"}`, text: availability.openNow ? t("card.openNow") : t("card.closedNow") }),
    `${hoursText} · ${t("card.nextFree", freeText(availability))}`,
  ];
  if (availability.emergency) availabilityParts.push(` · ${t("card.emergency")}`);

  const priceBox = el("div", { className: "price" }, [el("strong", { text: price.amount }), el("span", { text: price.unit })]);
  if (price.notes) priceBox.append(el("small", { text: price.notes }));

  const badges = [el("span", { className: "badge", text: categoryName(listing.category) })];
  if (listing.added === true) badges.push(el("span", { className: "badge own", text: t("card.own") }));

  // A listing that a visitor added has no reviews yet.
  const { rating } = listing;
  const ratingText = rating.count > 0 ? t("card.rating", rating.average, rating.count) : t("card.noReviews");

  const attrs = { id: pinned ? "pinned-card" : `card-${listing.id}`, "data-id": listing.id };
  return el(pinned ? "div" : "li", { className: pinned ? "card highlight" : "card", attrs }, [
    el("div", { className: "card-head" }, [
      el("div", { className: "card-title" }, [...badges, el("h2", { text: titleOf(listing) }), providerLine]),
      priceBox,
    ]),
    el("p", { className: "desc", text: descriptionOf(listing) }),
    el("dl", { className: "facts" }, [
      fact(t("fact.location"), `${location.address}, ${location.city}, ${countryName(location.country)}`),
      fact(t("fact.availability"), ...availabilityParts),
      fact(t("fact.rating"), ratingText),
      fact(t("fact.contact"), `${contact.phone} · ${contact.email}`),
      fact(t("fact.languages"), listing.languages.map((code) => labelOf("language", code)).join(", ")),
      fact(t("fact.serviceArea"), serviceAreaText(listing.serviceArea)),
    ]),
    el("p", { className: "card-id", text: listing.id }),
  ]);
}

function renderPinned(now) {
  if (!pinned) {
    dom.pinned.replaceChildren();
    dom.pinned.hidden = true;
    return;
  }
  const close = el("button", { className: "clear-all", text: t("pinned.close"), attrs: { type: "button" } });
  close.addEventListener("click", () => {
    pinned = null;
    hideNotice();
    renderPinned(now);
  });
  dom.pinned.replaceChildren(
    el("div", { className: "pinned-head" }, [el("p", { text: t(pinnedLabel) }), close]),
    card({ listing: pinned, availability: computeAvailability(pinned.availability, now) }, { pinned: true }),
  );
  dom.pinned.hidden = false;
}

const pagesOf = (total) => Math.max(1, Math.ceil(total / PAGE_SIZE));

/** What the page shows without asking the database: the controls, the chips and the pinned listing. */
function drawFrame(now) {
  syncControls();
  renderChips(sortFor(filters));
  renderPinned(now);
}

/** The list as the database last answered, or a line saying that it is on its way or did not arrive. */
function drawResult() {
  const result = shown ?? { total: 0, all: 0, offset: 0, items: [] };
  const pages = pagesOf(result.total);
  dom.results.replaceChildren(...result.items.map((item) => card(item)));
  if (shown) dom.results.dataset.total = String(result.total);
  else delete dom.results.dataset.total;

  // Only touch the live region when the text changes, so screen readers do not repeat it.
  let countText = failed ? t("results.failed") : t("results.loading");
  if (shown) {
    countText = t("results.count", result.total, result.all);
    if (result.total > 0) countText += ` · ${t("results.shown", result.offset + 1, result.offset + result.items.length)}`;
  }
  if (dom.count.textContent !== countText) dom.count.textContent = countText;

  dom.empty.hidden = !shown || result.total > 0;
  dom.pager.hidden = pages === 1;
  dom.pagePrev.disabled = page === 1;
  dom.pageNext.disabled = page === pages;
  dom.pageInfo.textContent = t("pager.info", page, pages);
}

/** Everything again from what the page already has, e.g. in another language. */
function draw() {
  drawFrame(new Date());
  drawResult();
}

/**
 * Ask the database for the page of the list that the filters describe, and show it.
 * Resolves with the answer, or with null when the database did not answer or a newer search has taken over.
 */
async function render() {
  clearTimeout(searchTimer);
  searches += 1;
  const run = searches;
  const now = new Date();
  drawFrame(now);
  const search = () => directory.search({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, now);
  let result;
  try {
    result = await search();
    // A page past the end of the list, e.g. one a tool asked for: show the last one.
    const validPage = Math.min(pagesOf(result.total), Math.max(1, Math.trunc(page) || 1));
    if (run === searches && validPage !== page) {
      page = validPage;
      result = await search();
    }
  } catch (error) {
    if (run !== searches) return null;
    console.warn("The directory database did not answer.", error);
    shown = null;
    failed = true;
    drawResult();
    return null;
  }
  if (run !== searches) return null;
  shown = result;
  failed = false;
  drawResult();
  return result;
}

// ── What a tool call does on the page ─────────────────────────────────────

// The notice is kept as a function that writes it, so that it can be written again in the other language.
let notice = null;

function renderNotice() {
  const text = notice ? notice() : "";
  // Only touch the live region when the text changes, so screen readers do not repeat it.
  if (dom.notice.textContent !== text) dom.notice.textContent = text;
  dom.notice.hidden = !notice;
}

function showNotice(write) {
  notice = write;
  renderNotice();
}

function hideNotice() {
  notice = null;
  renderNotice();
}

/** search_services: same filters as the agent used, opened at the page that holds the results it got back. */
function showFilters(nextFilters, view) {
  filters = { ...nextFilters };
  const offset = Number.isInteger(view?.offset) && view.offset > 0 ? view.offset : 0;
  page = Math.floor(offset / PAGE_SIZE) + 1;
  pinned = null;
  const total = Number.isInteger(view?.total) ? view.total : 0;
  showNotice(() => t("notice.search", total));
  render();
}

/** get_service: show the listing above the list, whatever the filters and the page are. */
function showListing(listing) {
  pinned = listing;
  pinnedLabel = "pinned.byAgent";
  renderPinned(new Date());
  dom.pinned.scrollIntoView({ block: "start", behavior: "smooth" });
  showNotice(() => t("notice.opened", titleOf(listing)));
}

// ── Accounts: Supabase Auth checks the password; a signed-in visitor may add a service ──

function renderAccount() {
  const user = auth.currentUser();
  const text = user ? t("account.user", user.name) : "";
  if (dom.accountUser.textContent !== text) dom.accountUser.textContent = text;
  dom.accountUser.hidden = !user;
  dom.signIn.hidden = Boolean(user);
  dom.signOut.hidden = !user;
}

// What to do once the person has signed in; set when the sign-in dialog was opened on the way to something else.
let afterSignIn = null;
// The same dialog signs in and creates an account.
let creatingAccount = false;
// Why the last attempt failed, as auth.js names it; kept so that the message can be written again in the other language.
let loginError = null;

function showLoginError(reason) {
  loginError = reason;
  dom.loginError.textContent = reason ? t(`login.error.${reason}`) : "";
  dom.loginError.hidden = !reason;
}

function showLoginMode(signUp) {
  creatingAccount = signUp;
  dom.loginNameField.hidden = !signUp;
  dom.loginPassword.setAttribute("autocomplete", signUp ? "new-password" : "current-password");
  // The texts are named by their i18n.js entries, so a change of language writes the right ones.
  dom.loginTitle.dataset.i18n = signUp ? "login.titleNew" : "login.title";
  dom.loginSubmit.dataset.i18n = signUp ? "account.signUp" : "account.signIn";
  dom.loginMode.dataset.i18n = signUp ? "login.toSignIn" : "login.toSignUp";
  for (const node of [dom.loginTitle, dom.loginSubmit, dom.loginMode]) node.textContent = t(node.dataset.i18n);
  showLoginError(null);
}

function openLogin(next = null) {
  afterSignIn = next;
  dom.loginReason.hidden = next === null;
  dom.loginForm.reset();
  showLoginMode(false);
  dom.loginDialog.showModal();
}

/** The confirmation email links back to this page, wherever it is hosted. */
const pageAddress = () => `${location.origin}${location.pathname}`;

/** The link in the confirmation email comes back here with the session in the address: take it and tidy the address. */
async function adoptConfirmation() {
  const result = await auth.adoptRedirect(location.hash);
  if (!result.handled) return;
  // The session does not stay in the address bar or in the history.
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  renderAccount();
  showNotice(() => (result.ok ? t("login.confirmed", result.user.name) : t("login.confirmFailed")));
}

function bindAccount() {
  dom.signIn.addEventListener("click", () => openLogin());
  dom.loginCancel.addEventListener("click", () => dom.loginDialog.close());
  dom.loginMode.addEventListener("click", () => showLoginMode(!creatingAccount));
  // The form has method="dialog", so a submit would close the dialog at once. The answer comes from Supabase,
  // so the submit is stopped and the dialog is closed when the answer says the person is in.
  dom.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (dom.loginSubmit.disabled) return;
    dom.loginSubmit.disabled = true;
    showLoginError(null);
    const email = dom.loginEmail.value;
    const password = dom.loginPassword.value;
    const result = creatingAccount
      ? await auth.signUp({ email, password, name: dom.loginName.value, redirectTo: pageAddress() })
      : await auth.signIn(email, password);
    dom.loginSubmit.disabled = false;

    if (!result.ok) {
      showLoginError(result.reason);
      if (result.reason === "credentials") dom.loginPassword.value = "";
      dom.loginPassword.focus();
      return;
    }
    if (result.confirm) {
      // Nobody is signed in until the link in the email is followed.
      afterSignIn = null;
      dom.loginDialog.close();
      showNotice(() => t("login.confirm"));
      return;
    }
    renderAccount();
    dom.loginDialog.close();
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
  // Signing in or out in another tab of this site.
  window.addEventListener("storage", renderAccount);
}

// ── New service: a form for signed-in visitors; the listing is saved in the database ──

// One row per weekday: a checkbox for "works that day" and the two times.
const hourRows = new Map();

function fillServiceForm() {
  // The form keeps what was typed while the language changes, so its options and labels are built once and relabelled.
  serviceFields.category.append(liveOption("", () => t("form.chooseCategory")), ...catalog.categories.map((c) => liveOption(c.id, () => nameOf(c))));
  serviceFields.country.append(...catalog.countries.map((c) => liveOption(c.code, () => nameOf(c))));
  serviceFields.priceUnit.append(...catalog.PRICE_UNITS.map((unit) => liveOption(unit, () => labelOf("priceFor", unit))));

  // Defaults are written as attributes, so that form.reset() brings them back.
  dom.serviceLanguages.append(
    ...catalog.LANGUAGES.map((code, index) => {
      const attrs = { type: "checkbox", name: "languages", value: code };
      if (index === 0) attrs.checked = "";
      const name = el("span");
      live(() => {
        name.textContent = labelOf("language", code);
      });
      return el("label", { className: "check" }, [el("input", { attrs }), name]);
    }),
  );

  for (const day of catalog.WEEKDAYS) {
    const worksAttrs = { type: "checkbox" };
    if (day !== "sat" && day !== "sun") worksAttrs.checked = "";
    const works = el("input", { attrs: worksAttrs });
    const open = el("input", { attrs: { type: "time", value: "09:00" } });
    const close = el("input", { attrs: { type: "time", value: "18:00" } });
    const name = el("span");
    live(() => {
      const label = weekdayLabel(day);
      name.textContent = label;
      open.setAttribute("aria-label", t("form.hoursFrom", label));
      close.setAttribute("aria-label", t("form.hoursTo", label));
    });
    const row = el("div", { className: "hours-row" }, [el("label", { className: "check" }, [works, name]), open, "–", close]);
    hourRows.set(day, { row, works, open, close });
    dom.serviceHours.append(row);
  }
}

const chooseCity = liveOption("", () => t("form.chooseCity"));

function fillServiceCities() {
  const cities = citiesByCountry.get(serviceFields.country.value) ?? [];
  serviceFields.city.replaceChildren(chooseCity, ...cities.map((city) => option(city, city)));
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
  dom.serviceError.textContent = summary ?? t("form.errors", errors.length);
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

  // The form has method="dialog", so a submit would close the dialog at once. The listing is saved in the
  // database first, so the submit is stopped and the dialog is closed when the database has taken the listing.
  dom.serviceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (dom.serviceSubmit.disabled) return;
    if (!auth.currentUser()) {
      showServiceErrors([], t("form.signedOut"));
      return;
    }
    // The messages under the wrong fields come in the language the page is in when the form is submitted.
    const read = readListing(serviceInput(), i18n.language);
    if (!read.ok) {
      showServiceErrors(read.errors);
      return;
    }
    dom.serviceSubmit.disabled = true;
    const result = await directory.add(read.listing);
    dom.serviceSubmit.disabled = false;
    if (!result.ok) {
      // A session that ended while the form was open: the header says so too.
      if (result.reason === "signedOut") renderAccount();
      showServiceErrors([], result.reason === "signedOut" ? t("form.signedOut") : t(`form.failed.${result.reason}`));
      return;
    }

    const { listing } = result;
    dom.serviceForm.reset();
    dom.serviceDraft.hidden = true;
    clearServiceErrors();
    fillServiceCities();
    syncServiceForm();

    pinned = listing;
    pinnedLabel = "pinned.own";
    showNotice(() => t("notice.added", listing.title, listing.id));
    // Closing the dialog puts the focus back on the button in the header; scroll to the new listing after that.
    dom.serviceDialog.addEventListener("close", () => dom.pinned.scrollIntoView({ block: "start" }), { once: true });
    dom.serviceDialog.close();
    // The list may hold the new listing too, and its count has changed.
    render();
  });
}

// ── Start ─────────────────────────────────────────────────────────────────

fillServiceForm();
fillServiceCities();
syncServiceForm();
showLanguage();
bindControls();
bindLanguage();
bindAccount();
bindServiceForm();
renderAccount();
render();
adoptConfirmation();

// "Open now" depends on the clock, so ask again once a minute while the page is visible.
// Not while someone is using a control: an open dropdown would close.
setInterval(() => {
  const usingControls = document.activeElement?.closest?.(".controls") != null;
  if (!document.hidden && !usingControls) render();
}, 60_000);

// The tools are registered at once, so an agent that lists them right after the page loads finds them.
// They need nothing from the database to be listed; every call asks it afresh.
const tools = createTools({ catalog, directory, now: () => new Date(), showFilters, showListing, showDraft });
await registerTools(tools);
