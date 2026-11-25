// Demo sign-in. The user list ships with the page and is checked in the browser, so it protects nothing:
// it only tells the page who is using it. Never put a real password here.
// Pure logic: the storage is passed in, so everything runs in Node tests without a browser.

export const USERS = [
  { username: "jonas", name: "Jonas Jonaitis", password: "jonas123" },
  { username: "ona", name: "Ona Onaitė", password: "ona123" },
];

export const STORAGE_KEY = "webmcp-services.user";

const publicUser = (user) => ({ username: user.username, name: user.name });
const normalizeUsername = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/** The browser's localStorage, or undefined where it is missing or blocked (reading the property can throw). */
export function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * @param {{ users?: Array<{ username: string, name: string, password: string }>, storage?: Storage }} [options]
 *   Without a working storage the signed-in user is kept in memory and lasts until the page is reloaded.
 * @returns {{
 *   currentUser: () => { username: string, name: string } | null,
 *   signIn: (username: unknown, password: unknown) => { ok: true, user: { username: string, name: string } } | { ok: false },
 *   signOut: () => void,
 * }}
 */
export function createAuth({ users = USERS, storage } = {}) {
  const byUsername = new Map(users.map((user) => [normalizeUsername(user.username), user]));
  // Used only when the storage cannot be read or written.
  let remembered = null;
  let storageWorks = Boolean(storage);

  function load() {
    if (!storageWorks) return remembered;
    try {
      return storage.getItem(STORAGE_KEY);
    } catch {
      storageWorks = false;
      return remembered;
    }
  }

  function save(username) {
    remembered = username;
    if (!storageWorks) return;
    try {
      if (username === null) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, username);
    } catch {
      storageWorks = false;
    }
  }

  return {
    /** Read from the storage on every call, so signing in or out in another tab is seen here too. */
    currentUser() {
      const user = byUsername.get(normalizeUsername(load()));
      return user ? publicUser(user) : null;
    },

    /** The username ignores case and surrounding spaces; the password must match exactly. */
    signIn(username, password) {
      const user = byUsername.get(normalizeUsername(username));
      if (!user || typeof password !== "string" || password !== user.password) return { ok: false };
      save(user.username);
      return { ok: true, user: publicUser(user) };
    },

    signOut() {
      save(null);
    },
  };
}
