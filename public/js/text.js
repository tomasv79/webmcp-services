// Text helpers for search: case and diacritics are ignored, and word endings are matched loosely
// so that inflected Lithuanian words ("Vilniuje", "santechniko") still find their listing.

/** Lower-case and strip diacritics: "Šiauliai" -> "siauliai", "Rīga" -> "riga", "Pärnu" -> "parnu". */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/** Split text into normalized words (letters and digits only). */
export function words(text) {
  return normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const MIN_TOKEN_LENGTH = 3;

/** Usable search words of a query: at least 3 characters, no duplicates. */
export function queryTokens(query) {
  return [...new Set(words(query).filter((word) => word.length >= MIN_TOKEN_LENGTH))];
}

/** The part of a query word that must match: all but the last two letters, and never fewer than four. */
export function stem(token) {
  return token.slice(0, Math.max(4, token.length - 2));
}

/**
 * Pack the words of a text into one searchable string: " word1 word2 word3".
 * One string per listing keeps the index small and lets the engine's native substring search do the matching.
 */
export function wordIndex(text) {
  return ` ${[...new Set(words(text))].join(" ")}`;
}

/** True when some word in the index starts with the stem of the query word. */
export function hasWordStartingWith(index, token) {
  return index.includes(` ${stem(token)}`);
}
