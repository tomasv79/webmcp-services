// The agent notes of the catalog: what get_service returns and the page does not show.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as catalog from "../catalog/catalog.js";
import { notesFor, noteRow, PREPARE, RESPONSE_HOURS, DISCOUNT_PERCENTS } from "../catalog/notes.js";
import { createDirectory } from "../public/js/directory.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(resolve(root, "supabase/migrations/20261126120000_agent_notes.sql"), "utf8");

test("notes: every category has a text about what to have ready, in plain English", () => {
  assert.deepEqual(Object.keys(PREPARE), catalog.categories.map((c) => c.id));
  for (const [category, text] of Object.entries(PREPARE)) {
    assert.match(text, /^[A-Z][\x20-\x7E]{20,200}\.$/, category);
  }
});

test("notes: every listing of the catalog has notes with values of the known kinds", () => {
  assert.equal(catalog.agentNotes.length, catalog.listings.length);
  for (const listing of catalog.listings) {
    const notes = notesFor(listing);
    assert.deepEqual(Object.keys(notes), ["responseHours", "prepare", "agentOffer"], listing.id);
    assert.ok(listing.availability.emergency ? notes.responseHours === 1 : RESPONSE_HOURS.includes(notes.responseHours), listing.id);
    assert.equal(notes.prepare, PREPARE[listing.category], listing.id);
    assert.deepEqual(Object.keys(notes.agentOffer), ["code", "discountPercent"], listing.id);
    assert.ok(DISCOUNT_PERCENTS.includes(notes.agentOffer.discountPercent), listing.id);
  }
});

test("notes: an offer code names its listing, is unique, and is not the same letters for everyone", () => {
  const codes = catalog.listings.map((listing) => notesFor(listing).agentOffer.code);
  assert.equal(new Set(codes).size, codes.length);
  catalog.listings.forEach((listing, index) => {
    assert.match(codes[index], new RegExp(`^MCP-${Number(listing.id.slice(4))}-[A-HJ-NP-Z2-9]{4}$`), listing.id);
  });
  assert.ok(new Set(codes.map((code) => code.slice(-4))).size > 9_000);
});

test("notes: the same listing always has the same notes, and the values are spread", () => {
  const [first] = catalog.listings;
  assert.deepEqual(notesFor(first), notesFor(structuredClone(first)));
  // Pinned, so that a change to the notes of the catalog is always deliberate: a hand-written listing and the last
  // generated one.
  assert.deepEqual(notesFor(first), {
    responseHours: 1, // an emergency provider
    prepare: "A photo of the problem, where the pipe or fitting is, and whether the water is shut off.",
    agentOffer: { code: "MCP-1-X4F6", discountPercent: 5 },
  });
  assert.deepEqual(notesFor(catalog.listings.at(-1)), {
    responseHours: 4,
    prepare: "The area in m2, the number of rooms, and whether there are pets.",
    agentOffer: { code: "MCP-10000-RUK6", discountPercent: 15 },
  });
  const hours = new Set(catalog.listings.map((listing) => notesFor(listing).responseHours));
  assert.deepEqual([...hours].sort((a, b) => a - b), [1, ...RESPONSE_HOURS]);
  const discounts = new Set(catalog.listings.map((listing) => notesFor(listing).agentOffer.discountPercent));
  assert.deepEqual([...discounts].sort((a, b) => a - b), DISCOUNT_PERCENTS);
});

test("notes: a row of the table fits the checks of the migration", () => {
  const between = (column) => /between (\d+) and (\d+)/.exec(new RegExp(`check \\(${column}[^\\n]*`).exec(sql)[0]).slice(1).map(Number);
  const [hoursMin, hoursMax] = between("response_hours");
  const [percentMin, percentMax] = between("offer_percent");
  const [, prepareMax] = between("length\\(prepare\\)");
  const code = new RegExp(/offer_code ~ '([^']+)'/.exec(sql)[1]);
  for (const row of catalog.agentNotes) {
    assert.deepEqual(Object.keys(row), ["number", "response_hours", "prepare", "offer_code", "offer_percent"]);
    assert.ok(row.response_hours >= hoursMin && row.response_hours <= hoursMax, `svc-${row.number}`);
    assert.ok(row.offer_percent >= percentMin && row.offer_percent <= percentMax, `svc-${row.number}`);
    assert.ok(row.prepare.length >= 1 && row.prepare.length <= prepareMax, `svc-${row.number}`);
    assert.match(row.offer_code, code, `svc-${row.number}`);
  }
  assert.deepEqual(catalog.agentNotes.map((row) => row.number), catalog.listings.map((listing) => Number(listing.id.slice(4))));
});

test("notes: what the seed script writes is what the directory reads back", async () => {
  for (const listing of [catalog.listings[0], catalog.listings[59], catalog.listings[60], catalog.listings.at(-1)]) {
    const { number, ...columns } = noteRow(listing);
    const client = { select: async () => ({ ok: true, status: 200, data: [columns] }) };
    assert.deepEqual(await createDirectory({ client, catalog }).notes(number), notesFor(listing), listing.id);
  }
});
