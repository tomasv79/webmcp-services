// Accounts: sign-up, sign-in and sign-out with Supabase Auth, and the session of the signed-in person.
// The password is sent to Supabase and checked there; this page never keeps it.
// Pure logic: the Supabase client, the storage and the clock are passed in, so everything runs in Node tests.

export const STORAGE_KEY = "webmcp-services.session";

// The demo account is jonas@webmcp-services.example, and signs in as "jonas": a sign-in name without "@" gets this
// domain. ".example" is reserved, so no such address can belong to anybody.
export const DEMO_DOMAIN = "webmcp-services.example";

// A token this close to its end is replaced before it is used.
const REFRESH_MARGIN_SECONDS = 60;

/** The browser's localStorage, or undefined where it is missing or blocked (reading the property can throw). */
export function browserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value) => (typeof value === "string" ? value : "");
const errorCode = (data) => text(data?.error_code) || text(data?.code) || text(data?.error);

/** What the page shows of an account: the name given at sign-up, or the email where there is none. */
function publicUser(user) {
  const email = text(user?.email);
  const name = text(user?.user_metadata?.name).trim();
  return { id: text(user?.id), email, name: name || email };
}

/** A session as it is stored, from what Supabase answers to a sign-in; null when it is not one. */
function sessionOf(data, nowSeconds) {
  if (!isPlainObject(data) || !text(data.access_token) || !text(data.refresh_token) || !isPlainObject(data.user)) return null;
  const lifetime = Number(data.expires_in);
  const expiresAt = Number.isFinite(Number(data.expires_at)) && Number(data.expires_at) > 0
    ? Number(data.expires_at)
    : nowSeconds + (Number.isFinite(lifetime) && lifetime > 0 ? lifetime : 3600);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt, user: publicUser(data.user) };
}

const SIGN_UP_FAILURES = {
  user_already_exists: "exists",
  email_exists: "exists",
  weak_password: "password",
  email_address_invalid: "email",
  validation_failed: "email",
  over_email_send_rate_limit: "rate",
  over_request_rate_limit: "rate",
  signup_disabled: "closed",
  email_provider_disabled: "closed",
};

/**
 * @param {object} options
 * @param {object} options.client  The Supabase client, see createSupabase in supabase.js.
 * @param {Storage} [options.storage]  Without a working storage the session lasts until the page is reloaded.
 * @param {() => number} [options.now]  Milliseconds, as Date.now.
 * @returns {{
 *   currentUser: () => { id: string, email: string, name: string } | null,
 *   signIn: (email: unknown, password: unknown) => Promise<{ ok: true, user: object } | { ok: false, reason: "credentials" | "unconfirmed" | "rate" | "unavailable" }>,
 *   signUp: (account: { email: unknown, password: unknown, name?: unknown, redirectTo?: string }) =>
 *     Promise<{ ok: true, user: object } | { ok: true, confirm: true } | { ok: false, reason: "exists" | "password" | "email" | "rate" | "closed" | "unavailable" }>,
 *   signOut: () => void,
 *   token: () => Promise<string | null>,
 *   adoptRedirect: (hash: string) => Promise<{ handled: false } | { handled: true, ok: true, user: object } | { handled: true, ok: false }>,
 * }}
 */
export function createAuth({ client, storage, now = Date.now }) {
  // Used only when the storage cannot be read or written.
  let remembered = null;
  let storageWorks = Boolean(storage);
  // One refresh at a time: a refresh token works once.
  let refreshing = null;
  const seconds = () => Math.floor(now() / 1000);

  function load() {
    if (!storageWorks) return remembered;
    let value = null;
    try {
      value = storage.getItem(STORAGE_KEY);
    } catch {
      storageWorks = false;
      return remembered;
    }
    if (value === null) return null;
    try {
      const session = JSON.parse(value);
      const valid = isPlainObject(session) && text(session.accessToken) && text(session.refreshToken)
        && Number.isFinite(session.expiresAt) && isPlainObject(session.user) && text(session.user.id);
      return valid ? session : null;
    } catch {
      return null;
    }
  }

  function save(session) {
    remembered = session;
    if (!storageWorks) return;
    try {
      if (session === null) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      storageWorks = false;
    }
  }

  function refresh(session) {
    refreshing ??= (async () => {
      try {
        const answer = await client.auth.refresh(session.refreshToken);
        const next = answer.ok ? sessionOf(answer.data, seconds()) : null;
        if (next) {
          save(next);
          return next.accessToken;
        }
        // Another tab may have used the refresh token first and stored the session that came of it.
        const stored = load();
        if (stored && stored.refreshToken !== session.refreshToken) return stored.accessToken;
        // Refused: the session is over. Not reached, or a server fault: it may work the next time.
        if (answer.status >= 400 && answer.status < 500 && answer.status !== 429) save(null);
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  return {
    /** Read from the storage on every call, so signing in or out in another tab is seen here too. */
    currentUser() {
      const session = load();
      return session ? { id: session.user.id, email: text(session.user.email), name: text(session.user.name) || text(session.user.email) } : null;
    },

    /**
     * The email ignores case and surrounding spaces; the password is sent as typed.
     * A name without "@" is the demo account of that name: "jonas" is jonas@webmcp-services.example.
     */
    async signIn(email, password) {
      if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) return { ok: false, reason: "credentials" };
      const typed = email.trim().toLowerCase();
      const answer = await client.auth.signIn({ email: typed.includes("@") ? typed : `${typed}@${DEMO_DOMAIN}`, password });
      const session = answer.ok ? sessionOf(answer.data, seconds()) : null;
      if (session) {
        save(session);
        return { ok: true, user: session.user };
      }
      if (answer.status === 0 || answer.status >= 500 || answer.ok) return { ok: false, reason: "unavailable" };
      if (answer.status === 429) return { ok: false, reason: "rate" };
      return { ok: false, reason: errorCode(answer.data) === "email_not_confirmed" ? "unconfirmed" : "credentials" };
    },

    /**
     * Create an account. Where the project confirms emails, the person is signed in only after following the link
     * in the email: the answer is then { ok: true, confirm: true } and nobody is signed in yet.
     */
    async signUp({ email, password, name, redirectTo }) {
      if (typeof email !== "string" || !email.trim()) return { ok: false, reason: "email" };
      if (typeof password !== "string" || !password) return { ok: false, reason: "password" };
      const answer = await client.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        name: text(name).replace(/\s+/g, " ").trim().slice(0, 80),
        redirectTo,
      });
      if (answer.ok) {
        const session = sessionOf(answer.data, seconds());
        if (!session) return { ok: true, confirm: true };
        save(session);
        return { ok: true, user: session.user };
      }
      if (answer.status === 0 || answer.status >= 500) return { ok: false, reason: "unavailable" };
      if (answer.status === 429) return { ok: false, reason: "rate" };
      return { ok: false, reason: SIGN_UP_FAILURES[errorCode(answer.data)] ?? "unavailable" };
    },

    /** Signed out here at once; Supabase is told to end the session, and it does not matter when that fails. */
    signOut() {
      const session = load();
      save(null);
      if (session) client.auth.signOut(session.accessToken).catch(() => {});
    },

    /** A token the database accepts for the signed-in person, renewed when it is about to end; null when signed out. */
    async token() {
      const session = load();
      if (!session) return null;
      if (session.expiresAt - seconds() > REFRESH_MARGIN_SECONDS) return session.accessToken;
      return refresh(session);
    },

    /**
     * The link in the confirmation email comes back to the page with the session in the address after "#".
     * `handled` says that the address held such an answer, so the page can take it out of the address bar.
     */
    async adoptRedirect(hash) {
      const params = new URLSearchParams(text(hash).replace(/^#/, ""));
      if (params.has("error") || params.has("error_code")) return { handled: true, ok: false };
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) return { handled: false };
      const answer = await client.auth.user(accessToken);
      const session = answer.ok
        ? sessionOf({ access_token: accessToken, refresh_token: refreshToken, expires_in: params.get("expires_in"), expires_at: params.get("expires_at"), user: answer.data }, seconds())
        : null;
      if (!session || !session.user.id) return { handled: true, ok: false };
      save(session);
      return { handled: true, ok: true, user: session.user };
    },
  };
}
