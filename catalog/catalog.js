// The whole catalog that scripts/seed.js writes to the database: the 60 hand-written listings from data.js
// followed by generated ones, 10,000 in total, and the agent notes of each. The page does not load this; it asks
// the database.

import { listings as handWritten } from "./data.js";
import { generateListings } from "./generate.js";
import { noteRow } from "./notes.js";

export { categories, countries, cities, cityAliases, PRICE_UNITS, LANGUAGES, WEEKDAYS } from "../public/js/vocabulary.js";

export const TOTAL_LISTINGS = 10_000;

export const listings = [
  ...handWritten,
  ...generateListings({ count: TOTAL_LISTINGS - handWritten.length, startNumber: handWritten.length + 1 }),
];

/** One row of the agent_notes table per listing: what only the WebMCP tools return. */
export const agentNotes = listings.map(noteRow);
