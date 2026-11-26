// The database is described in SQL and the page in JavaScript. These checks read the migration as text and make
// sure the two say the same; tests/supabase.live.test.js checks a real database when one is at hand.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectory, SORT_OPTIONS } from "../public/js/directory.js";
import { LIMITS } from "../public/js/listing-input.js";
import * as vocabulary from "../public/js/vocabulary.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
const sql = files.map((file) => readFileSync(join(root, "supabase/migrations", file), "utf8")).join("\n");
const quoted = (text) => [...text.matchAll(/'([^']*)'/g)].map((m) => m[1]);

test("migration: the allowed values in the database are the vocabulary's", () => {
  assert.deepEqual(quoted(/price_unit in \(([^)]*)\)/.exec(sql)[1]), vocabulary.PRICE_UNITS);
  assert.deepEqual(JSON.parse(/languages <@ '(\[[^']*\])'::jsonb/.exec(sql)[1]), vocabulary.LANGUAGES);
  assert.deepEqual(quoted(/country in \(([^)]*)\)/.exec(sql)[1]), vocabulary.countries.map((c) => c.code));
  assert.deepEqual(quoted(/day\.key not in \(([^)]*)\)/.exec(sql)[1]), vocabulary.WEEKDAYS);
  assert.equal(Number(/lead_days between 0 and (\d+)/.exec(sql)[1]), LIMITS.leadTimeDays);
  assert.equal(Number(/jsonb_array_length\(languages\) between 1 and (\d+)/.exec(sql)[1]), vocabulary.LANGUAGES.length);
  // What the form lets through fits what the database lets through.
  assert.ok(Number(/length\(data ->> 'title'\) between 1 and (\d+)/.exec(sql)[1]) >= LIMITS.title[1]);
  assert.ok(Number(/length\(data ->> 'description'\) between 1 and (\d+)/.exec(sql)[1]) >= LIMITS.description[1]);
});

test("migration: the search function takes every argument the page sends, and knows every sort", async () => {
  const declaration = /create function public\.search_listings\(([\s\S]*?)\) returns jsonb/.exec(sql)[1];
  const parameters = [...declaration.matchAll(/^\s*(p_\w+) /gm)].map((m) => m[1]);
  let sent;
  const client = { rpc: async (name, args) => { sent = args; return { ok: true, status: 200, data: { total: 0, all: 0, mixedUnits: false, items: [] } }; } };
  await createDirectory({ client, catalog: vocabulary }).search({}, new Date());
  assert.deepEqual(Object.keys(sent), parameters);
  // Every argument has a default, so one that the page leaves out is not an error.
  assert.equal(declaration.split("\n").filter((line) => /^\s*p_\w+ /.test(line) && !/ default /.test(line)).length, 0);
  for (const sort of SORT_OPTIONS) assert.ok(sql.includes(`'${sort}'`), `${sort} is ranked in the function`);
  assert.match(sql, /at time zone 'Europe\/Vilnius'/);
});

test("migration: visitors may read and add, and nothing else", () => {
  for (const table of ["categories", "cities", "listings"]) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security;`), `${table} has row-level security`);
  }
  assert.doesNotMatch(sql, /for (update|delete|all) /i, "no policy lets a visitor change or delete");
  assert.doesNotMatch(sql, /grant (update|delete|all)[^;]*to (anon|authenticated)/i);
  // A visitor sends the listing and its search words; the number and the owner are the database's to set.
  assert.match(sql, /grant insert \(data, strong, weak\) on public\.listings to authenticated;/);
  assert.doesNotMatch(sql, /grant insert[^;]*\banon\b/);
  // Who added a listing is not readable through the API.
  const readable = /grant select \(([^)]*)\) on public\.listings to anon, authenticated;/.exec(sql)[1].split(",").map((name) => name.trim());
  assert.ok(readable.includes("data") && readable.includes("added"));
  assert.ok(!readable.includes("owner"));
  // A visitor's listing starts unrated and unverified, whatever was sent.
  assert.match(sql, /'rating', jsonb_build_object\('average', 0, 'count', 0\)/);
  assert.match(sql, /'\{provider,verified\}', 'false'::jsonb/);
  // The first number a visitor's listing gets comes right after the catalog.
  assert.match(sql, /create sequence public\.listing_number as integer start with 10001;/);
});
