import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuth, browserStorage, STORAGE_KEY } from "../public/js/auth.js";

function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

const brokenStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};

const NOW = 1_800_000_000_000;
const NOW_SECONDS = NOW / 1000;
const ok = (data) => ({ ok: true, status: 200, data });
const refused = (status, data) => ({ ok: false, status, data });
const unreachable = { ok: false, status: 0, data: null };

const supabaseUser = (overrides = {}) => ({ id: "user-1", email: "ona@test.example", user_metadata: { name: "Ona Onaitė" }, ...overrides });
const supabaseSession = (overrides = {}) => ({
  access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, expires_at: NOW_SECONDS + 3600, user: supabaseUser(), ...overrides,
});
const ONA = { id: "user-1", email: "ona@test.example", name: "Ona Onaitė" };

/** A Supabase client whose Auth API answers what the test says, and records what it was asked. */
function fakeClient(answers = {}) {
  const calls = [];
  const method = (name) => async (...args) => {
    calls.push([name, ...args]);
    const answer = answers[name];
    return typeof answer === "function" ? answer(...args) : answer ?? unreachable;
  };
  return { calls, auth: { signUp: method("signUp"), signIn: method("signIn"), refresh: method("refresh"), user: method("user"), signOut: method("signOut") } };
}

function setup({ answers, storage = fakeStorage(), clock = { now: NOW } } = {}) {
  const client = fakeClient(answers);
  return { client, storage, clock, auth: createAuth({ client, storage, now: () => clock.now }) };
}

test("login: nobody is signed in at the start", async () => {
  const { auth } = setup();
  assert.equal(auth.currentUser(), null);
  assert.equal(await auth.token(), null);
});

test("login: a right email and password sign the person in, and the session is stored without the password", async () => {
  const { auth, client, storage } = setup({ answers: { signIn: ok(supabaseSession()) } });
  assert.deepEqual(await auth.signIn("  Ona@Test.Example ", "secret-123"), { ok: true, user: ONA });
  // The email ignores case and surrounding spaces; the password is sent as typed.
  assert.deepEqual(client.calls, [["signIn", { email: "ona@test.example", password: "secret-123" }]]);
  assert.deepEqual(auth.currentUser(), ONA);
  assert.equal(await auth.token(), "access-1");

  const stored = storage.items.get(STORAGE_KEY);
  assert.deepEqual(JSON.parse(stored), { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: NOW_SECONDS + 3600, user: ONA });
  assert.doesNotMatch(stored, /secret-123/);
  assert.deepEqual([...storage.items.keys()], [STORAGE_KEY]);
});

test("login: an account without a name is shown by its email", async () => {
  for (const user_metadata of [{}, { name: "   " }, { name: 5 }, undefined]) {
    const { auth } = setup({ answers: { signIn: ok(supabaseSession({ user: supabaseUser({ user_metadata }) })) } });
    assert.equal((await auth.signIn("ona@test.example", "secret-123")).user.name, "ona@test.example");
  }
});

test("login: a refused sign-in says why, signs nobody in and stores nothing", async () => {
  const cases = [
    [refused(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" }), "credentials"],
    [refused(400, { error_code: "email_not_confirmed", msg: "Email not confirmed" }), "unconfirmed"],
    [refused(429, { error_code: "over_request_rate_limit" }), "rate"],
    [refused(500, null), "unavailable"],
    [unreachable, "unavailable"],
    // An answer that is not a session is not trusted.
    [ok({ access_token: "a" }), "unavailable"],
    [ok(null), "unavailable"],
  ];
  for (const [answer, reason] of cases) {
    const { auth, storage } = setup({ answers: { signIn: answer } });
    assert.deepEqual(await auth.signIn("ona@test.example", "secret-123"), { ok: false, reason }, JSON.stringify(answer));
    assert.equal(auth.currentUser(), null);
    assert.equal(storage.items.size, 0);
  }
});

test("login: an empty or wrong-typed email or password is refused without asking Supabase", async () => {
  const { auth, client } = setup({ answers: { signIn: ok(supabaseSession()) } });
  for (const [email, password] of [["", "x"], ["   ", "x"], ["ona@test.example", ""], [undefined, "x"], ["ona@test.example", null], [5, 5], [{}, []]]) {
    assert.deepEqual(await auth.signIn(email, password), { ok: false, reason: "credentials" });
  }
  assert.deepEqual(client.calls, []);
});

test("sign-up: where emails are not confirmed, the new account is signed in at once", async () => {
  const { auth, client } = setup({ answers: { signUp: ok(supabaseSession()) } });
  const result = await auth.signUp({ email: " Ona@Test.Example", password: "secret-123", name: "  Ona   Onaitė ", redirectTo: "https://site.example/" });
  assert.deepEqual(result, { ok: true, user: ONA });
  assert.deepEqual(client.calls, [["signUp", { email: "ona@test.example", password: "secret-123", name: "Ona Onaitė", redirectTo: "https://site.example/" }]]);
  assert.deepEqual(auth.currentUser(), ONA);
});

test("sign-up: where emails are confirmed, nobody is signed in until the link is followed", async () => {
  // Supabase answers with the user alone, without a session.
  const { auth, storage } = setup({ answers: { signUp: ok(supabaseUser()) } });
  assert.deepEqual(await auth.signUp({ email: "ona@test.example", password: "secret-123" }), { ok: true, confirm: true });
  assert.equal(auth.currentUser(), null);
  assert.equal(storage.items.size, 0);
});

test("sign-up: a refusal says why", async () => {
  const cases = [
    [refused(422, { error_code: "user_already_exists" }), "exists"],
    [refused(422, { error_code: "weak_password" }), "password"],
    [refused(400, { error_code: "email_address_invalid" }), "email"],
    [refused(400, { error_code: "validation_failed" }), "email"],
    [refused(429, { error_code: "over_email_send_rate_limit" }), "rate"],
    [refused(422, { error_code: "signup_disabled" }), "closed"],
    [refused(400, { error_code: "something_new" }), "unavailable"],
    [refused(503, null), "unavailable"],
    [unreachable, "unavailable"],
  ];
  for (const [answer, reason] of cases) {
    const { auth } = setup({ answers: { signUp: answer } });
    assert.deepEqual(await auth.signUp({ email: "ona@test.example", password: "secret-123" }), { ok: false, reason }, JSON.stringify(answer));
    assert.equal(auth.currentUser(), null);
  }
  const { auth, client } = setup();
  assert.deepEqual(await auth.signUp({ email: " ", password: "secret-123" }), { ok: false, reason: "email" });
  assert.deepEqual(await auth.signUp({ email: "ona@test.example", password: "" }), { ok: false, reason: "password" });
  assert.deepEqual(client.calls, []);
});

test("login: signing out forgets the session here at once and tells Supabase", async () => {
  const { auth, client, storage } = setup({ answers: { signIn: ok(supabaseSession()), signOut: unreachable } });
  await auth.signIn("ona@test.example", "secret-123");
  auth.signOut();
  assert.equal(auth.currentUser(), null);
  assert.equal(await auth.token(), null);
  assert.equal(storage.items.size, 0);
  assert.deepEqual(client.calls.at(-1), ["signOut", "access-1"]);
  // Signing out twice is harmless and asks nothing.
  auth.signOut();
  assert.equal(client.calls.length, 2);
});

test("login: the session survives a reload and is shared by the tabs of the site", async () => {
  const storage = fakeStorage();
  const first = setup({ storage, answers: { signIn: ok(supabaseSession()) } });
  await first.auth.signIn("ona@test.example", "secret-123");

  const second = setup({ storage });
  assert.deepEqual(second.auth.currentUser(), ONA);
  assert.equal(await second.auth.token(), "access-1");
  second.auth.signOut();
  assert.equal(first.auth.currentUser(), null, "signed out in the other tab too");
});

test("login: a token that is about to end is renewed once, however many ask for it", async () => {
  const renewed = supabaseSession({ access_token: "access-2", refresh_token: "refresh-2", expires_at: NOW_SECONDS + 7200 });
  const { auth, client, clock, storage } = setup({ answers: { signIn: ok(supabaseSession()), refresh: ok(renewed) } });
  await auth.signIn("ona@test.example", "secret-123");

  clock.now = NOW + 3000 * 1000;
  assert.equal(await auth.token(), "access-1", "ten minutes left: still good");
  clock.now = NOW + 3570 * 1000;
  assert.deepEqual(await Promise.all([auth.token(), auth.token(), auth.token()]), ["access-2", "access-2", "access-2"]);
  assert.deepEqual(client.calls.filter(([name]) => name === "refresh"), [["refresh", "refresh-1"]]);
  assert.equal(JSON.parse(storage.items.get(STORAGE_KEY)).refreshToken, "refresh-2");
  assert.equal(await auth.token(), "access-2");
  assert.equal(client.calls.filter(([name]) => name === "refresh").length, 1);
});

test("login: a session Supabase no longer accepts is over; one it could not be asked about is kept", async () => {
  const expired = { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: NOW_SECONDS - 10, user: ONA };
  const stored = () => fakeStorage({ [STORAGE_KEY]: JSON.stringify(expired) });

  const ended = setup({ storage: stored(), answers: { refresh: refused(400, { error_code: "refresh_token_not_found" }) } });
  assert.deepEqual(ended.auth.currentUser(), ONA, "still shown as signed in until the token is needed");
  assert.equal(await ended.auth.token(), null);
  assert.equal(ended.auth.currentUser(), null);

  for (const answer of [unreachable, refused(503, null), refused(429, null)]) {
    const kept = setup({ storage: stored(), answers: { refresh: answer } });
    assert.equal(await kept.auth.token(), null);
    assert.deepEqual(kept.auth.currentUser(), ONA, "the next try may work");
  }
});

test("login: when another tab has renewed the session first, its token is used", async () => {
  const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: NOW_SECONDS - 10, user: ONA }) });
  const other = { accessToken: "access-2", refreshToken: "refresh-2", expiresAt: NOW_SECONDS + 3600, user: ONA };
  const { auth } = setup({
    storage,
    answers: {
      refresh: () => {
        storage.setItem(STORAGE_KEY, JSON.stringify(other));
        return refused(400, { error_code: "refresh_token_already_used" });
      },
    },
  });
  assert.equal(await auth.token(), "access-2");
  assert.deepEqual(auth.currentUser(), ONA);
});

test("login: a stored value that is not a session signs nobody in", async () => {
  for (const value of ["", "jonas", "null", "[]", "{}", '{"accessToken":"a"}', '{"accessToken":"a","refreshToken":"r","expiresAt":"soon","user":{"id":"1"}}', '{"accessToken":"a","refreshToken":"r","expiresAt":1,"user":{}}']) {
    const { auth } = setup({ storage: fakeStorage({ [STORAGE_KEY]: value }) });
    assert.equal(auth.currentUser(), null, value);
    assert.equal(await auth.token(), null, value);
  }
});

test("login: without a working storage the session lasts until the reload", async () => {
  for (const storage of [undefined, brokenStorage]) {
    const client = fakeClient({ signIn: ok(supabaseSession()) });
    const auth = createAuth({ client, storage, now: () => NOW });
    assert.equal(auth.currentUser(), null);
    assert.equal((await auth.signIn("ona@test.example", "secret-123")).ok, true);
    assert.deepEqual(auth.currentUser(), ONA);
    assert.equal(await auth.token(), "access-1");
    auth.signOut();
    assert.equal(auth.currentUser(), null);
  }
});

test("confirmation link: the session in the address signs the person in", async () => {
  const { auth, client } = setup({ answers: { user: ok(supabaseUser()) } });
  const result = await auth.adoptRedirect("#access_token=access-9&expires_in=3600&refresh_token=refresh-9&token_type=bearer&type=signup");
  assert.deepEqual(result, { handled: true, ok: true, user: ONA });
  // The token is checked with Supabase before it is believed.
  assert.deepEqual(client.calls, [["user", "access-9"]]);
  assert.deepEqual(auth.currentUser(), ONA);
  assert.equal(await auth.token(), "access-9");
});

test("confirmation link: an address without a session is left alone, and a bad one signs nobody in", async () => {
  for (const hash of ["", "#", "#section", "#access_token=only", undefined, null, 5]) {
    const { auth, client } = setup({ answers: { user: ok(supabaseUser()) } });
    assert.deepEqual(await auth.adoptRedirect(hash), { handled: false }, String(hash));
    assert.deepEqual(client.calls, []);
  }
  const expired = setup();
  assert.deepEqual(await expired.auth.adoptRedirect("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"), { handled: true, ok: false });
  const forged = setup({ answers: { user: refused(401, { error_code: "bad_jwt" }) } });
  assert.deepEqual(await forged.auth.adoptRedirect("#access_token=made-up&refresh_token=made-up"), { handled: true, ok: false });
  assert.equal(forged.auth.currentUser(), null);
});

test("browserStorage: gives localStorage when there is one and survives a getter that throws", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    const storage = fakeStorage();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => storage });
    assert.equal(browserStorage(), storage);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("SecurityError"); } });
    assert.equal(browserStorage(), undefined);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
