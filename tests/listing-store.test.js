import { test } from "node:test";
import assert from "node:assert/strict";
import { createListingStore, STORAGE_KEY, LEGACY_KEY } from "../public/js/listing-store.js";
import { STORAGE_KEY as AUTH_KEY } from "../public/js/auth.js";
import { sqlite } from "./sqlite-engine.js";

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

const record = (number, overrides = {}) => ({ number, addedBy: "jonas", input: { title: `Paslauga ${number}`, tags: "ąčę, šūž" }, ...overrides });
const numbers = (store) => store.records().map((item) => item.number);
const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");

/** The stored value of a database made by hand: for images this page did not write. */
function imageOf(statements) {
  const db = sqlite.open();
  for (const [sql, params] of statements) db.exec(sql, params);
  const value = toBase64(db.image());
  db.close();
  return value;
}

test("listing store: it starts empty and writes nothing until a listing is added", () => {
  const storage = fakeStorage();
  const store = createListingStore({ sqlite, storage });
  assert.deepEqual(store.records(), []);
  assert.equal(storage.items.size, 0);
  assert.notEqual(STORAGE_KEY, AUTH_KEY);
  assert.notEqual(STORAGE_KEY, LEGACY_KEY);
});

test("listing store: an added listing is one stored value, the image of a SQLite file", () => {
  const storage = fakeStorage();
  const store = createListingStore({ sqlite, storage });
  assert.equal(store.append(record(61)), true);
  assert.deepEqual(store.records(), [record(61)]);

  assert.deepEqual([...storage.items.keys()], [STORAGE_KEY]);
  const bytes = Buffer.from(storage.items.get(STORAGE_KEY), "base64");
  assert.equal(bytes.subarray(0, 16).toString("latin1"), "SQLite format 3\u0000");
  assert.equal(bytes.toString("base64"), storage.items.get(STORAGE_KEY), "plain base64, nothing around it");
});

test("listing store: stored listings come back after a reload, lowest number first", () => {
  const storage = fakeStorage();
  const before = createListingStore({ sqlite, storage });
  before.append(record(62, { addedBy: "ona" }));
  before.append(record(61));
  assert.deepEqual(createListingStore({ sqlite, storage }).records(), [record(61), record(62, { addedBy: "ona" })]);
});

test("listing store: a number is stored once and has 1 to 9 digits", () => {
  const storage = fakeStorage();
  const store = createListingStore({ sqlite, storage });
  assert.equal(store.append(record(61)), true);
  assert.equal(store.append(record(61, { addedBy: "ona" })), false);
  for (const number of [0, -5, 1_000_000_000, 61.5]) assert.equal(store.append(record(number)), false, String(number));
  assert.equal(store.append(record(999_999_999)), true);
  assert.deepEqual(createListingStore({ sqlite, storage }).records(), [record(61), record(999_999_999)]);
});

test("listing store: what another tab added is seen, and neither tab loses the other's listing", () => {
  const storage = fakeStorage();
  const here = createListingStore({ sqlite, storage });
  const there = createListingStore({ sqlite, storage });
  assert.equal(there.append(record(61)), true);
  assert.deepEqual(numbers(here), [61]);
  // This tab has not read since; append looks into the storage first.
  assert.equal(there.append(record(62)), true);
  assert.equal(here.append(record(63)), true);
  assert.deepEqual(numbers(there), [61, 62, 63]);
  assert.deepEqual(numbers(createListingStore({ sqlite, storage })), [61, 62, 63]);

  storage.items.delete(STORAGE_KEY);
  assert.deepEqual(numbers(here), [], "the site data was cleared");
});

test("listing store: a stored value that is not a usable database is left alone until the next write replaces it", () => {
  const values = {
    "not base64": "not base64 !!!",
    "empty": "",
    "base64 of text": toBase64(Buffer.from("this is not a database ".repeat(200))),
    "a table of another shape": imageOf([["CREATE TABLE listings (id TEXT, body TEXT)"], ["INSERT INTO listings VALUES ('svc-70', '{}')"]]),
  };
  for (const [name, value] of Object.entries(values)) {
    const storage = fakeStorage({ [STORAGE_KEY]: value });
    const store = createListingStore({ sqlite, storage });
    assert.deepEqual(store.records(), [], name);
    assert.equal(storage.items.get(STORAGE_KEY), value, `${name}: reading does not write`);
    assert.equal(store.append(record(61)), true, name);
    assert.deepEqual(numbers(createListingStore({ sqlite, storage })), [61], name);
  }
});

test("listing store: a database made elsewhere is used, and its rows that are not listings are left out", () => {
  const value = imageOf([
    ["CREATE TABLE other (x)"],
    ["CREATE TABLE listings (number, added_by, input)"],
    ["INSERT INTO listings VALUES ('x', 'jonas', '{}')"],
    ["INSERT INTO listings VALUES (0, 'jonas', '{}')"],
    ["INSERT INTO listings VALUES (2000000000, 'jonas', '{}')"],
    ["INSERT INTO listings VALUES (70.5, 'jonas', '{}')"],
    ["INSERT INTO listings VALUES (71, 5, '{}')"],
    ["INSERT INTO listings VALUES (72, 'jonas', 'not json')"],
    ["INSERT INTO listings VALUES (73, 'jonas', 5)"],
    ["INSERT INTO listings VALUES (74, 'ona', ?)", [JSON.stringify({ title: "Gera" })]],
  ]);
  const storage = fakeStorage({ [STORAGE_KEY]: value });
  const store = createListingStore({ sqlite, storage });
  assert.deepEqual(store.records(), [{ number: 74, addedBy: "ona", input: { title: "Gera" } }]);
  assert.equal(store.append(record(75)), true);
  assert.deepEqual(numbers(createListingStore({ sqlite, storage })), [74, 75]);
});

test("listing store: listings kept as a JSON list before SQLite are moved into the database, once", () => {
  const input = { title: "Sena paslauga" };
  const legacy = [
    { id: "svc-70", addedBy: "jonas", input },
    { id: "svc-00071", addedBy: "ona", input },                 // padded: still number 71
    { id: "svc-70", addedBy: "ona", input: { title: "Antra" } },  // the same number twice: the first stays
    null, "text", 5, [],
    { id: "other-5", addedBy: "jonas", input },
    { id: 73, addedBy: "jonas", input },
    { id: "svc-0", addedBy: "jonas", input },
    { id: "svc-74", addedBy: "jonas" },                         // no input
    { id: "svc-75", addedBy: "jonas", input: "text" },
    { id: "svc-76", addedBy: { name: "x" }, input },            // who added it is not a string
  ];
  const storage = fakeStorage({ [LEGACY_KEY]: JSON.stringify(legacy) });
  const store = createListingStore({ sqlite, storage });
  const moved = [
    { number: 70, addedBy: "jonas", input },
    { number: 71, addedBy: "ona", input },
    { number: 76, addedBy: "", input },
  ];
  assert.deepEqual(store.records(), moved);
  assert.deepEqual([...storage.items.keys()], [STORAGE_KEY], "the old list is gone");
  assert.deepEqual(createListingStore({ sqlite, storage }).records(), moved);
});

test("listing store: a listing already in the database wins over the old list", () => {
  const storage = fakeStorage();
  createListingStore({ sqlite, storage }).append(record(70));
  storage.setItem(LEGACY_KEY, JSON.stringify([{ id: "svc-70", addedBy: "ona", input: { title: "Sena" } }, { id: "svc-71", addedBy: "ona", input: { title: "Sena" } }]));
  const store = createListingStore({ sqlite, storage });
  assert.deepEqual(store.records(), [record(70), { number: 71, addedBy: "ona", input: { title: "Sena" } }]);
  assert.equal(storage.items.has(LEGACY_KEY), false);
});

test("listing store: an old list with nothing to move is removed and no database is stored", () => {
  for (const value of ["not json", "{}", "null", "[]", '[{"id":"other-5"}]']) {
    const storage = fakeStorage({ [LEGACY_KEY]: value });
    assert.deepEqual(createListingStore({ sqlite, storage }).records(), [], value);
    assert.equal(storage.items.size, 0, value);
  }
});

test("listing store: the old list stays when the database cannot be stored", () => {
  const legacy = JSON.stringify([{ id: "svc-70", addedBy: "jonas", input: { title: "Sena" } }]);
  const storage = fakeStorage({ [LEGACY_KEY]: legacy });
  const setItem = storage.setItem;
  storage.setItem = () => { throw new Error("quota"); };
  assert.deepEqual(numbers(createListingStore({ sqlite, storage })), [70], "shown on this page all the same");
  assert.deepEqual([...storage.items], [[LEGACY_KEY, legacy]]);

  storage.setItem = setItem;
  assert.deepEqual(numbers(createListingStore({ sqlite, storage })), [70]);
  assert.deepEqual([...storage.items.keys()], [STORAGE_KEY]);
});

test("listing store: without a working storage a listing is kept for this page and reported as not saved", () => {
  for (const storage of [undefined, brokenStorage]) {
    const store = createListingStore({ sqlite, storage });
    assert.deepEqual(store.records(), []);
    assert.equal(store.append(record(61)), false);
    assert.equal(store.append(record(62)), false);
    assert.deepEqual(numbers(store), [61, 62]);
  }
});

test("listing store: a storage that is full keeps what it had; the listing is stored with the next write that fits", () => {
  const storage = fakeStorage();
  const store = createListingStore({ sqlite, storage });
  store.append(record(61));
  const stored = storage.items.get(STORAGE_KEY);
  const setItem = storage.setItem;

  storage.setItem = () => { throw new Error("quota"); };
  assert.equal(store.append(record(62)), false);
  assert.equal(storage.items.get(STORAGE_KEY), stored);
  assert.deepEqual(numbers(createListingStore({ sqlite, storage })), [61]);
  assert.deepEqual(numbers(store), [61, 62]);

  storage.setItem = setItem;
  assert.equal(store.append(record(63)), true);
  assert.deepEqual(numbers(createListingStore({ sqlite, storage })), [61, 62, 63]);
});

test("listing store: a storage that stops answering does not empty the page's database", () => {
  const storage = fakeStorage();
  const store = createListingStore({ sqlite, storage });
  store.append(record(61));
  storage.getItem = () => { throw new Error("blocked"); };
  assert.deepEqual(numbers(store), [61]);
  assert.equal(store.append(record(62)), false);
  assert.deepEqual(numbers(store), [61, 62]);
});
