import { test } from "node:test";
import assert from "node:assert/strict";
import { registerTools } from "../public/js/webmcp.js";

const tool = (name) => ({ name, description: `${name} tool`, inputSchema: { type: "object", properties: {} }, execute: () => ({}) });

function fakeLog() {
  const calls = { info: [], warn: [] };
  return { calls, info: (...args) => calls.info.push(args), warn: (...args) => calls.warn.push(args) };
}

test("AC5.1 without document.modelContext nothing throws and one info line is written", async () => {
  const log = fakeLog();
  const result = await registerTools([tool("a"), tool("b")], { doc: {}, log });
  assert.deepEqual(result.registered, []);
  assert.equal(log.calls.info.length, 1);
  assert.equal(log.calls.warn.length, 0);
  assert.doesNotThrow(() => result.abort());
});

test("AC5.1 without a document at all nothing throws", async () => {
  const log = fakeLog();
  const result = await registerTools([tool("a")], { doc: undefined, log });
  assert.deepEqual(result.registered, []);
  assert.equal(log.calls.info.length, 1);
});

test("AC5.1 every tool is registered with the same abort signal", async () => {
  const seen = [];
  const doc = { modelContext: { registerTool: async (t, options) => { seen.push({ name: t.name, signal: options.signal }); } } };
  const log = fakeLog();
  const result = await registerTools([tool("a"), tool("b"), tool("c")], { doc, log });
  assert.deepEqual(result.registered, ["a", "b", "c"]);
  assert.deepEqual(result.failed, []);
  assert.equal(seen.length, 3);
  assert.ok(seen[0].signal instanceof AbortSignal);
  assert.equal(seen[0].signal, seen[1].signal);
  assert.equal(seen[1].signal, seen[2].signal);
  assert.equal(seen[0].signal.aborted, false);
  result.abort();
  assert.equal(seen[0].signal.aborted, true);
});

test("AC5.1 a rejected registration is logged once and the other tools still register", async () => {
  const doc = {
    modelContext: {
      registerTool: async (t) => {
        if (t.name === "b") throw new Error("A tool named b is already registered");
      },
    },
  };
  const log = fakeLog();
  const result = await registerTools([tool("a"), tool("b"), tool("c")], { doc, log });
  assert.deepEqual(result.registered, ["a", "c"]);
  assert.deepEqual(result.failed, ["b"]);
  assert.equal(log.calls.warn.length, 1);
  assert.match(String(log.calls.warn[0][0]), /b/);
});

test("AC5.1 a registerTool that throws synchronously is handled the same way", async () => {
  const doc = { modelContext: { registerTool: () => { throw new TypeError("bad tool"); } } };
  const log = fakeLog();
  const result = await registerTools([tool("a")], { doc, log });
  assert.deepEqual(result.failed, ["a"]);
  assert.equal(log.calls.warn.length, 1);
});
