import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { generateListings } from "../public/js/generate.js";
import * as catalog from "../public/js/catalog.js";
import { searchServices } from "../public/js/search.js";
import { createTools } from "../public/js/tools.js";

const WED_1000 = new Date("2026-11-25T08:00:00Z"); // Wednesday 10:00 in Vilnius

const tools = Object.fromEntries(
  createTools({ catalog, now: () => WED_1000, showFilters: () => {}, showListing: () => {} }).map((tool) => [tool.name, tool]),
);

const timed = (work) => {
  const start = performance.now();
  const result = work();
  return { result, ms: performance.now() - start };
};

test("ACA2.1 generating the catalog is fast", (t) => {
  const { result, ms } = timed(() => generateListings({ count: 9_940, startNumber: 61 }));
  t.diagnostic(`generate 9,940 listings: ${ms.toFixed(0)} ms`);
  assert.equal(result.length, 9_940);
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
});

test("ACA2.2 and ACA2.3 searching 10,000 listings is fast", (t) => {
  const first = timed(() => searchServices(catalog, { limit: 30 }, WED_1000));
  t.diagnostic(`first search, builds the index: ${first.ms.toFixed(0)} ms`);
  assert.equal(first.result.total, 10_000);
  assert.ok(first.ms < 2000, `first search took ${first.ms.toFixed(0)} ms`);

  const cases = {
    "no filter, 30 shown": { limit: 30 },
    "two-word query": { query: "santechnikas Kaune", limit: 30 },
    "open now": { openNow: true, limit: 30 },
    "soonest sort": { sortBy: "soonest", limit: 30 },
    "free today, cheapest per hour": { availableWithinDays: 0, priceUnit: "hour", sortBy: "price_asc", limit: 30 },
    "everything returned": {},
  };
  for (const [name, filters] of Object.entries(cases)) {
    searchServices(catalog, filters, WED_1000); // warm up
    const { ms } = timed(() => searchServices(catalog, filters, WED_1000));
    t.diagnostic(`${name}: ${ms.toFixed(1)} ms`);
    assert.ok(ms < 150, `${name} took ${ms.toFixed(0)} ms`);
  }
});

test("ACA2.4 every returned item has its availability, whichever path computed it", () => {
  const keys = ["daysUntilFree", "emergency", "leadTimeDays", "nextFreeDate", "openNow", "todayHours"];
  for (const filters of [{ limit: 5 }, { openNow: true, limit: 5 }, { sortBy: "soonest", limit: 5 }, { query: "valymas", limit: 5 }]) {
    const { items } = searchServices(catalog, filters, WED_1000);
    assert.equal(items.length, 5);
    for (const item of items) assert.deepEqual(Object.keys(item.availability).sort(), keys);
  }
});

test("ACA2.4 availability filters and the soonest sort are still correct on the full catalog", () => {
  const open = searchServices(catalog, { openNow: true }, WED_1000);
  assert.ok(open.total > 1000 && open.total < 10_000);
  assert.ok(open.items.every((i) => i.availability.openNow));

  const today = searchServices(catalog, { availableWithinDays: 0 }, WED_1000);
  assert.ok(today.total > 500);
  assert.ok(today.items.every((i) => i.availability.daysUntilFree === 0));

  const soonest = searchServices(catalog, { sortBy: "soonest", category: "plumbing" }, WED_1000).items;
  for (let i = 1; i < soonest.length; i += 1) {
    assert.ok(soonest[i - 1].availability.daysUntilFree <= soonest[i].availability.daysUntilFree);
  }
});

test("tools over the full catalog", () => {
  const all = tools.search_services.execute({});
  assert.equal(all.total, 10_000);
  assert.equal(all.returned, 10);

  const plumbers = tools.search_services.execute({ query: "santechnikas Kaune", limit: 20 });
  assert.ok(plumbers.total > 100);
  assert.ok(plumbers.results.every((r) => r.category === "plumbing" && r.location.city === "Kaunas"), "both words match the top results");

  const exact = tools.search_services.execute({ category: "plumbing", city: "Kaunas", limit: 1 });
  assert.ok(exact.total > 20 && exact.total < plumbers.total);

  assert.ok(tools.search_services.execute({ city: "Ventspilis" }).total >= 20);
  assert.equal(tools.search_services.execute({ city: "Ventspilis" }).appliedFilters.city, "Ventspils");
  assert.equal(tools.search_services.execute({ city: "kohtla jarve" }).appliedFilters.city, "Kohtla-Järve");
  assert.equal(tools.search_services.execute({ city: "Paris" }).error.validValues.length, 31);

  const last = tools.get_service.execute({ id: "svc-10000" });
  assert.equal(last.service.id, "svc-10000");
  assert.equal(tools.get_service.execute({ id: "svc-001" }).service.provider.name, "Vandens Meistrai");
  assert.equal(tools.get_service.execute({ id: "svc-10001" }).error.field, "id");

  const options = tools.list_service_filters.execute({});
  assert.equal(options.totalListings, 10_000);
  assert.equal(options.categories.reduce((sum, c) => sum + c.count, 0), 10_000);
  assert.equal(options.countries.flatMap((c) => c.cities).length, 31);
  assert.equal(options.countries.reduce((sum, c) => sum + c.count, 0), 10_000);
});

test("get_service accepts an id with any number of leading zeros", () => {
  assert.equal(tools.get_service.execute({ id: "svc-00001" }).service.id, "svc-001");
  assert.equal(tools.get_service.execute({ id: "svc-1" }).service.id, "svc-001");
  assert.equal(tools.get_service.execute({ id: "svc-61" }).service.id, "svc-00061");
  assert.equal(tools.get_service.execute({ id: "SVC-0010000" }).service.id, "svc-10000");
  for (const id of ["svc-0", "svc-", "svc-1e3", "svc-12345678901", "61", "svc--61", "svc-61 x"]) {
    assert.equal(tools.get_service.execute({ id }).error?.field, "id", id);
  }
});

test("on a tie the lower listing number comes first, so hand-written listings are not pushed behind generated ones", () => {
  const a = structuredClone(catalog.listings[0]); // svc-001
  const b = structuredClone(catalog.listings[60]); // svc-00061
  const c = structuredClone(catalog.listings[9_999]); // svc-10000
  for (const listing of [a, b, c]) listing.rating = { average: 4.5, count: 10 };
  const small = { ...catalog, listings: [c, b, a] };
  assert.deepEqual(searchServices(small, {}, WED_1000).items.map((i) => i.listing.id), ["svc-001", "svc-00061", "svc-10000"]);
});

test("paging walks through a large result without gaps or repeats", () => {
  const seen = new Set();
  let total;
  for (let offset = 0; offset < 100; offset += 20) {
    const page = tools.search_services.execute({ category: "cleaning", country: "LT", limit: 20, offset });
    total = page.total;
    for (const r of page.results) seen.add(r.id);
  }
  assert.ok(total > 100);
  assert.equal(seen.size, 100);
});
