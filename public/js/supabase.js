// The few Supabase calls the page makes, over fetch: the database through its REST API and the accounts through
// the Auth API. No library and no build step.
// Pure logic: fetch is passed in, so everything runs in Node tests without a network.

/**
 * @typedef {{ ok: boolean, status: number, data: any }} Answer
 *   `status` is 0 when the request did not get through. `data` is the parsed JSON body, or null without one:
 *   on a failure it is what the service says about it, e.g. { code, message } or { error_code, msg }.
 *
 * @param {object} options
 * @param {string} options.url   The address of the Supabase project.
 * @param {string} options.key   The project's publishable (anon) key.
 * @param {typeof fetch} [options.fetch]
 * @returns {{
 *   rpc: (name: string, args?: object) => Promise<Answer>,
 *   select: (table: string, query: Record<string, string>) => Promise<Answer>,
 *   insert: (table: string, row: object, options: { token: string, select: string }) => Promise<Answer>,
 *   auth: {
 *     signUp: (account: { email: string, password: string, name?: string, redirectTo?: string }) => Promise<Answer>,
 *     signIn: (account: { email: string, password: string }) => Promise<Answer>,
 *     refresh: (refreshToken: string) => Promise<Answer>,
 *     user: (token: string) => Promise<Answer>,
 *     signOut: (token: string) => Promise<Answer>,
 *   },
 * }}
 */
export function createSupabase({ url, key, fetch: send = (...args) => globalThis.fetch(...args) }) {
  const base = String(url).replace(/\/+$/, "");

  /** Never throws. A signed-in person's token goes in `token`; without one the request is anonymous. */
  async function request(path, { method = "GET", body, token, headers = {} } = {}) {
    const options = { method, headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, ...headers } };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await send(`${base}${path}`, options);
    } catch {
      return { ok: false, status: 0, data: null };
    }
    let data = null;
    try {
      const text = await response.text();
      if (text) data = JSON.parse(text);
    } catch {
      // No body, or one that is not JSON: the status says enough.
    }
    return { ok: response.ok, status: response.status, data };
  }

  const queryString = (query) => new URLSearchParams(query).toString();

  return {
    /** Call a database function with named arguments. */
    rpc: (name, args = {}) => request(`/rest/v1/rpc/${encodeURIComponent(name)}`, { method: "POST", body: args }),

    /** Read rows; `query` is the PostgREST query, e.g. { select: "data", number: "eq.61" }. */
    select: (table, query) => request(`/rest/v1/${encodeURIComponent(table)}?${queryString(query)}`),

    /** Insert one row as the signed-in person and get the stored row back, with the columns named in `select`. */
    insert: (table, row, { token, select }) =>
      request(`/rest/v1/${encodeURIComponent(table)}?${queryString({ select })}`, {
        method: "POST",
        body: row,
        token,
        headers: { Prefer: "return=representation" },
      }),

    auth: {
      /** The confirmation email, where the project sends one, links back to `redirectTo`. */
      signUp: ({ email, password, name, redirectTo }) =>
        request(`/auth/v1/signup${redirectTo ? `?${queryString({ redirect_to: redirectTo })}` : ""}`, {
          method: "POST",
          body: { email, password, data: name ? { name } : {} },
        }),
      signIn: ({ email, password }) =>
        request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }),
      refresh: (refreshToken) =>
        request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken } }),
      user: (token) => request("/auth/v1/user", { token }),
      signOut: (token) => request("/auth/v1/logout?scope=local", { method: "POST", token }),
    },
  };
}
