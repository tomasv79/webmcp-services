import { test } from "node:test";
import assert from "node:assert/strict";
import { USERS, STORAGE_KEY, browserStorage, createAuth } from "../public/js/auth.js";

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

const [first, second] = USERS;

test("login: there are two demo users with different usernames and a password each", () => {
  assert.equal(USERS.length, 2);
  assert.notEqual(first.username, second.username);
  for (const user of USERS) {
    assert.match(user.username, /^[a-z]+$/);
    assert.ok(user.name.length > 0);
    assert.ok(user.password.length >= 6);
  }
});

test("login: nobody is signed in at the start", () => {
  assert.equal(createAuth({ storage: fakeStorage() }).currentUser(), null);
});

test("login: each user signs in with their own password", () => {
  for (const user of USERS) {
    const auth = createAuth({ storage: fakeStorage() });
    assert.deepEqual(auth.signIn(user.username, user.password), { ok: true, user: { username: user.username, name: user.name } });
    assert.deepEqual(auth.currentUser(), { username: user.username, name: user.name });
  }
});

test("login: the answer and the storage never hold the password", () => {
  const storage = fakeStorage();
  const auth = createAuth({ storage });
  const result = auth.signIn(first.username, first.password);
  assert.ok(!JSON.stringify(result).includes(first.password));
  assert.ok(!JSON.stringify(auth.currentUser()).includes(first.password));
  assert.deepEqual([...storage.items], [[STORAGE_KEY, first.username]]);
});

test("login: a wrong password, another user's password or an unknown user is refused", () => {
  const auth = createAuth({ storage: fakeStorage() });
  assert.deepEqual(auth.signIn(first.username, "wrong"), { ok: false });
  assert.deepEqual(auth.signIn(first.username, second.password), { ok: false });
  assert.deepEqual(auth.signIn("nobody", first.password), { ok: false });
  assert.deepEqual(auth.signIn(first.username, ""), { ok: false });
  assert.equal(auth.currentUser(), null);
});

test("login: the username ignores case and spaces, the password does not", () => {
  const auth = createAuth({ storage: fakeStorage() });
  assert.equal(auth.signIn(`  ${first.username.toUpperCase()} `, first.password).ok, true);
  auth.signOut();
  assert.equal(auth.signIn(first.username, first.password.toUpperCase()).ok, false);
  assert.equal(auth.signIn(first.username, ` ${first.password}`).ok, false);
});

test("login: input that is not text is refused without throwing", () => {
  const auth = createAuth({ storage: fakeStorage() });
  for (const value of [undefined, null, 0, {}, [], true]) {
    assert.deepEqual(auth.signIn(value, value), { ok: false });
    assert.deepEqual(auth.signIn(first.username, value), { ok: false });
  }
  // A name from Object.prototype must not be mistaken for a user.
  assert.deepEqual(auth.signIn("constructor", "constructor"), { ok: false });
});

test("login: a failed attempt does not sign out the user who is already in", () => {
  const auth = createAuth({ storage: fakeStorage() });
  auth.signIn(first.username, first.password);
  assert.equal(auth.signIn(second.username, "wrong").ok, false);
  assert.equal(auth.currentUser().username, first.username);
});

test("login: the user stays signed in after a reload and across tabs that share the storage", () => {
  const storage = fakeStorage();
  const tabA = createAuth({ storage });
  const tabB = createAuth({ storage });
  tabA.signIn(second.username, second.password);
  assert.equal(tabB.currentUser().username, second.username);
  assert.equal(createAuth({ storage }).currentUser().username, second.username);
  tabB.signOut();
  assert.equal(tabA.currentUser(), null);
  assert.equal(storage.items.size, 0);
});

test("login: a stored name that is not a user counts as signed out", () => {
  assert.equal(createAuth({ storage: fakeStorage({ [STORAGE_KEY]: "nobody" }) }).currentUser(), null);
  assert.equal(createAuth({ storage: fakeStorage({ [STORAGE_KEY]: "" }) }).currentUser(), null);
});

test("login: without a storage, or with one that throws, sign-in works until the page is reloaded", () => {
  for (const storage of [undefined, brokenStorage]) {
    const auth = createAuth({ storage });
    assert.equal(auth.currentUser(), null);
    assert.equal(auth.signIn(first.username, first.password).ok, true);
    assert.equal(auth.currentUser().username, first.username);
    auth.signOut();
    assert.equal(auth.currentUser(), null);
  }
});

test("login: browserStorage answers undefined where localStorage is missing or blocked", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
    assert.equal(browserStorage(), undefined);
    const storage = fakeStorage();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => storage });
    assert.equal(browserStorage(), storage);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
