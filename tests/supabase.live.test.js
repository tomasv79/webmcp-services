// Checks a real database against the reference search: every search below must give the same listings, in the same
// order, from Postgres (search_listings) and from tests/support/reference-search.js.
// It needs a migrated and seeded Supabase project, so it is skipped unless both variables are set:
//
//   SUPABASE_URL=https://<project>.supabase.co SUPABASE_KEY=<publishable key> npm test
//
// It only reads. Listings that visitors added are fetched first and counted in on both sides.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as base from "../catalog/catalog.js";
import { createDirectory } from "../public/js/directory.js";
import { createSupabase } from "../public/js/supabase.js";
import { LIMIT_MAX } from "../public/js/tools.js";
import { createMemoryDirectory } from "./support/memory-directory.js";
import { notesFor } from "../catalog/notes.js";

const { SUPABASE_URL: url, SUPABASE_KEY: key } = process.env;
const skip = url && key ? false : "set SUPABASE_URL and SUPABASE_KEY to run";

// Wednesday morning, Saturday evening, Sunday night and a Friday just after most providers close (Vilnius time).
const MOMENTS = ["2026-11-25T08:30:00Z", "2026-11-28T17:45:00Z", "2026-11-29T23:30:00Z", "2026-11-27T16:01:00Z", "2026-06-15T09:00:00Z"];

const SEARCHES = [
  {},
  { offset: 9990 },
  { query: "santechnikas" },
  { query: "santechnikas Vilniuje" },
  { query: "plumber vilnius emergency" },
  { query: "Šiauliai valymas" },
  { query: "elektrikas", city: "Kaunas" },
  { query: "remont", sortBy: "rating" },
  { query: "ab cd" },
  { query: "nothingmatchesthisword" },
  { category: "plumbing" },
  { category: "beauty", country: "LV" },
  { country: "ee", sortBy: "price_asc" },
  { city: "riga" },
  { city: "Ryga", sortBy: "price_desc" },
  { city: "Kohtla Jarve" },
  { city: "Atlantis" },
  { priceMax: 20 },
  { priceMax: 20, priceUnit: "hour", sortBy: "price_asc" },
  { priceUnit: "m2", sortBy: "price_desc", offset: 30 },
  { minRating: 4.8 },
  { minRating: 4.5, category: "tutoring", language: "en" },
  { language: "RU", country: "LT" },
  { travelsToClient: true, category: "it-support" },
  { travelsToClient: false },
  { openNow: true },
  { openNow: true, category: "auto-repair", city: "Tallinn" },
  { availableWithinDays: 0 },
  { availableWithinDays: 2, category: "renovation" },
  { availableWithinDays: 90 },
  { sortBy: "soonest" },
  { sortBy: "soonest", category: "cleaning", country: "LT" },
  { sortBy: "soonest", query: "fotograf", openNow: true },
  { sortBy: "relevance" },
  { query: "valymas", sortBy: "soonest", availableWithinDays: 1, minRating: 4, priceMax: 50, language: "lt" },
];

const view = (result) => ({
  total: result.total,
  all: result.all,
  offset: result.offset,
  sortBy: result.sortBy,
  warnings: result.warnings,
  items: result.items.map(({ listing, availability, score }) => ({ id: listing.id, score, availability })),
});

test("live: the database answers every search as the reference search does", { skip }, async () => {
  const client = createSupabase({ url, key });
  const directory = createDirectory({ client, catalog: base });
  const added = await client.select("listings", { select: "data,added", added: "is.true", order: "number" });
  assert.ok(added.ok, `reading the listings failed: ${added.status}`);
  const visitors = (await Promise.all(added.data.map((row) => directory.get(Number(row.data.id.slice(4)))))).filter(Boolean);
  const reference = createMemoryDirectory({ ...base, listings: [...base.listings, ...visitors] });

  let compared = 0;
  for (const moment of MOMENTS) {
    const now = new Date(moment);
    for (const filters of SEARCHES) {
      for (const limit of [10, LIMIT_MAX]) {
        const input = { limit, ...filters };
        const [live, expected] = await Promise.all([directory.search(input, now), reference.search(input, now)]);
        assert.deepEqual(view(live), view(expected), `${moment} ${JSON.stringify(input)}`);
        compared += 1;
      }
    }
  }
  assert.equal(compared, MOMENTS.length * SEARCHES.length * 2);
});

test("live: a listing and the counts come back as the catalog has them", { skip }, async () => {
  const client = createSupabase({ url, key });
  const directory = createDirectory({ client, catalog: base });
  for (const number of [1, 60, 61, 5000, 10000]) {
    assert.deepEqual(await directory.get(number), base.listings[number - 1], `svc-${number}`);
  }
  assert.equal(await directory.get(999_999_999), null);
  for (const number of [1, 60, 61, 5000, 10000]) {
    assert.deepEqual(await directory.notes(number), notesFor(base.listings[number - 1]), `notes of svc-${number}`);
  }
  assert.equal(await directory.notes(999_999_999), null);

  const counts = await directory.counts();
  const expected = await createMemoryDirectory(base).counts();
  assert.ok(counts.total >= expected.total);
  for (const [group, table] of Object.entries(expected)) {
    if (group === "total") continue;
    for (const [name, count] of Object.entries(table)) assert.ok(counts[group][name] >= count, `${group} ${name}`);
  }
});
