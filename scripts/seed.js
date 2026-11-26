// Writes the catalog to the Supabase database: the categories, the cities and the 10,000 fictional listings.
// Run it after the migration in supabase/migrations, and again whenever the catalog changes; it replaces the
// catalog's rows and leaves the listings that visitors added alone.
//
//   SUPABASE_SECRET_KEY=... node scripts/seed.js
//
// The secret key (Supabase dashboard: Project Settings, API keys) may write past the row-level security, so it is
// read from the environment and never stored in a file. SUPABASE_URL overrides the project in public/js/config.js.

import * as catalog from "../catalog/catalog.js";
import { SUPABASE_URL } from "../public/js/config.js";
import { searchWords } from "../public/js/directory.js";

const BATCH = 500;

const url = (process.env.SUPABASE_URL ?? SUPABASE_URL).replace(/\/+$/, "");
const key = process.env.SUPABASE_SECRET_KEY;
if (!key) {
  console.error("Set SUPABASE_SECRET_KEY to the project's secret (service role) key.");
  process.exit(1);
}

/** Insert the rows, replacing the ones that are already there. */
async function upsert(table, conflict, rows) {
  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
}

try {
  await upsert("categories", "id", catalog.categories.map((c) => ({ id: c.id, name_lt: c.nameLt, name_en: c.nameEn })));
  await upsert("cities", "name", catalog.cities.map((c) => ({ name: c.name, country: c.country })));
  console.log(`${catalog.categories.length} categories, ${catalog.cities.length} cities`);

  const rows = catalog.listings.map((listing) => ({
    number: Number(listing.id.slice(4)),
    data: listing,
    ...searchWords(listing, catalog),
  }));
  for (let start = 0; start < rows.length; start += BATCH) {
    await upsert("listings", "number", rows.slice(start, start + BATCH));
    console.log(`listings ${Math.min(start + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log(`Done: ${url}`);
} catch (error) {
  console.error(`Seeding failed. ${error.message}`);
  process.exit(1);
}
