// The whole catalog the page and the tools work with: the 60 hand-written listings from data.js
// followed by generated ones, 10,000 in total. Same module shape as data.js.

import { listings as handWritten, cityAliases as handWrittenAliases } from "./data.js";
import { generateListings, extraCityAliases } from "./generate.js";

export { categories, countries, PRICE_UNITS, LANGUAGES, WEEKDAYS } from "./data.js";

export const TOTAL_LISTINGS = 10_000;

export const cityAliases = { ...handWrittenAliases, ...extraCityAliases };

export const listings = [
  ...handWritten,
  ...generateListings({ count: TOTAL_LISTINGS - handWritten.length, startNumber: handWritten.length + 1 }),
];
