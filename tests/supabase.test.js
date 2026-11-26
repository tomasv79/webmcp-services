import { test } from "node:test";
import assert from "node:assert/strict";
import { createSupabase } from "../public/js/supabase.js";

/** A fetch that records what it was asked and answers from a list, one answer per call. */
function fakeFetch(...answers) {
  const calls = [];
  const send = async (url, options) => {
    calls.push({ url, ...options, body: options.body === undefined ? undefined : JSON.parse(options.body) });
    const answer = answers.shift() ?? { status: 200, body: "null" };
    if (answer instanceof Error) throw answer;
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, text: async () => answer.body ?? "" };
  };
  return { send, calls };
}

const client = (fetch) => createSupabase({ url: "https://project.example/", key: "public-key", fetch });

test("supabase: a database function is called by POST with named arguments and the publishable key", async () => {
  const { send, calls } = fakeFetch({ status: 200, body: '{"total":3}' });
  const answer = await client(send).rpc("search_listings", { p_limit: 5, p_city: undefined });
  assert.deepEqual(answer, { ok: true, status: 200, data: { total: 3 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://project.example/rest/v1/rpc/search_listings");
  assert.equal(calls[0].method, "POST");
  // An argument that is not given is left out, so the function uses its default.
  assert.deepEqual(calls[0].body, { p_limit: 5 });
  assert.deepEqual(calls[0].headers, { apikey: "public-key", Authorization: "Bearer public-key", "Content-Type": "application/json" });
});

test("supabase: rows are read with a query string that is escaped", async () => {
  const { send, calls } = fakeFetch({ status: 200, body: "[]" });
  await client(send).select("listings", { select: "data,added", number: "eq.61" });
  assert.equal(calls[0].url, "https://project.example/rest/v1/listings?select=data%2Cadded&number=eq.61");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[0].headers["Content-Type"], undefined);
});

test("supabase: an insert goes out as the signed-in person and asks for the stored row back", async () => {
  const { send, calls } = fakeFetch({ status: 201, body: '[{"data":{"id":"svc-10001"}}]' });
  const answer = await client(send).insert("listings", { data: { title: "x" } }, { token: "user-token", select: "data,added" });
  assert.equal(answer.status, 201);
  assert.deepEqual(answer.data, [{ data: { id: "svc-10001" } }]);
  assert.equal(calls[0].url, "https://project.example/rest/v1/listings?select=data%2Cadded");
  assert.equal(calls[0].headers.apikey, "public-key");
  assert.equal(calls[0].headers.Authorization, "Bearer user-token");
  assert.equal(calls[0].headers.Prefer, "return=representation");
});

test("supabase: a refusal comes back with its status and what the service said, and nothing throws", async () => {
  const { send } = fakeFetch(
    { status: 401, body: '{"code":"PGRST301","message":"JWT expired"}' },
    { status: 502, body: "<html>Bad gateway</html>" },
    { status: 204, body: "" },
    new TypeError("fetch failed"),
  );
  const supabase = client(send);
  assert.deepEqual(await supabase.rpc("x"), { ok: false, status: 401, data: { code: "PGRST301", message: "JWT expired" } });
  assert.deepEqual(await supabase.rpc("x"), { ok: false, status: 502, data: null });
  assert.deepEqual(await supabase.rpc("x"), { ok: true, status: 204, data: null });
  assert.deepEqual(await supabase.rpc("x"), { ok: false, status: 0, data: null });
});

test("supabase: the account calls go to the Auth API with the right bodies", async () => {
  const { send, calls } = fakeFetch();
  const { auth } = client(send);
  await auth.signUp({ email: "a@b.example", password: "secret-1", name: "Ona", redirectTo: "https://site.example/app/" });
  await auth.signUp({ email: "a@b.example", password: "secret-1" });
  await auth.signIn({ email: "a@b.example", password: "secret-1" });
  await auth.refresh("refresh-1");
  await auth.user("user-token");
  await auth.signOut("user-token");

  assert.deepEqual(calls.map((call) => `${call.method} ${call.url.replace("https://project.example", "")}`), [
    "POST /auth/v1/signup?redirect_to=https%3A%2F%2Fsite.example%2Fapp%2F",
    "POST /auth/v1/signup",
    "POST /auth/v1/token?grant_type=password",
    "POST /auth/v1/token?grant_type=refresh_token",
    "GET /auth/v1/user",
    "POST /auth/v1/logout?scope=local",
  ]);
  assert.deepEqual(calls[0].body, { email: "a@b.example", password: "secret-1", data: { name: "Ona" } });
  assert.deepEqual(calls[1].body, { email: "a@b.example", password: "secret-1", data: {} });
  assert.deepEqual(calls[2].body, { email: "a@b.example", password: "secret-1" });
  assert.deepEqual(calls[3].body, { refresh_token: "refresh-1" });
  for (const call of calls.slice(0, 4)) assert.equal(call.headers.Authorization, "Bearer public-key");
  for (const call of calls.slice(4)) assert.equal(call.headers.Authorization, "Bearer user-token");
  // The password travels in the body only.
  for (const call of calls) assert.doesNotMatch(call.url, /secret-1/);
});
