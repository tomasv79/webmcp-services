// Agent notes: what the WebMCP tools tell about a listing of the catalog and the page does not show.
// Fictional, like the rest of the catalog. They are worked out from the listing alone, so a listing keeps its notes
// whatever happens to the others, and the generator's own sequence of random draws is left as it was.

import { mulberry32 } from "./generate.js";

export const NOTES_SEED = 20261126;

/** How many hours a provider usually takes to reply. An emergency provider answers within the hour. */
export const RESPONSE_HOURS = [2, 4, 8, 24, 48];
export const DISCOUNT_PERCENTS = [5, 10, 15];
// No 0, 1, I or O: a code is read out and typed by people.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** What to have ready before contacting a provider of each category. */
export const PREPARE = {
  plumbing: "A photo of the problem, where the pipe or fitting is, and whether the water is shut off.",
  electrical: "What stopped working, a photo of the fuse box, and the age of the wiring if known.",
  renovation: "The area in m2, photos of the rooms, and the finish you want.",
  cleaning: "The area in m2, the number of rooms, and whether there are pets.",
  moving: "Both addresses with floors and lifts, a list of the large items, and the date.",
  "auto-repair": "The make, model and year of the car, the mileage, and the symptoms or warning lights.",
  "appliance-repair": "The brand and model of the appliance, its age, and the error code or symptom.",
  gardening: "The size of the plot, photos of it, and what should happen to the green waste.",
  beauty: "The service you want, a preferred time, and any allergies or sensitivities.",
  tutoring: "The pupil's age or grade, the goal (an exam, catching up), and preferred times.",
  "it-support": "The device and its operating system, what happens and since when, and any error message.",
  photography: "The date and place, how many hours, and what the photos are for.",
};

const numberOf = (listing) => Number(listing.id.slice(4));

/**
 * @param {object} listing  A listing of the catalog.
 * @returns {{ responseHours: number, prepare: string, agentOffer: { code: string, discountPercent: number } }}
 *          The notes as get_service returns them.
 */
export function notesFor(listing) {
  const number = numberOf(listing);
  const random = mulberry32(NOTES_SEED + number);
  const pick = (items) => items[Math.floor(random() * items.length)];

  const responseHours = pick(RESPONSE_HOURS);
  const discountPercent = pick(DISCOUNT_PERCENTS);
  let letters = "";
  for (let i = 0; i < 4; i += 1) letters += pick(CODE_LETTERS);
  return {
    responseHours: listing.availability.emergency ? 1 : responseHours,
    prepare: PREPARE[listing.category],
    // The number makes the code unique; the letters keep it from being guessed from the id.
    agentOffer: { code: `MCP-${number}-${letters}`, discountPercent },
  };
}

/** The notes of a listing as a row of the agent_notes table (supabase/migrations). */
export function noteRow(listing) {
  const notes = notesFor(listing);
  return {
    number: numberOf(listing),
    response_hours: notes.responseHours,
    prepare: notes.prepare,
    offer_code: notes.agentOffer.code,
    offer_percent: notes.agentOffer.discountPercent,
  };
}
