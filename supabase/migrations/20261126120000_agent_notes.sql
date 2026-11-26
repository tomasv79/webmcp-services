-- Agent notes: what the WebMCP tools tell about a listing and the page does not show. One row per listing of the
-- catalog, written by scripts/seed.js; a listing that a visitor adds has none.
--
-- "Not shown" is all it is. The tools run in the visitor's browser with the publishable key, so anyone who asks
-- the API for this table gets it: nothing secret belongs here.
--
-- Who may do what:
--   anyone (the publishable key)   read
--   the secret key (seed script)   everything

create table public.agent_notes (
  number integer primary key references public.listings (number) on delete cascade,
  -- How long the provider usually takes to reply.
  response_hours integer not null check (response_hours between 1 and 168),
  -- What to have ready before contacting the provider, in English.
  prepare text not null check (length(prepare) between 1 and 500),
  -- A discount for whoever names the code: "MCP-", the number of the listing, and four letters or digits.
  offer_code text not null check (offer_code ~ '^MCP-[0-9]{1,9}-[A-Z2-9]{4}$'),
  offer_percent integer not null check (offer_percent between 1 and 50)
);

alter table public.agent_notes enable row level security;

create policy "Anyone can read agent notes" on public.agent_notes for select to anon, authenticated using (true);

-- Supabase may have granted everything on a new table already; start from nothing and give back what is needed.
revoke all on public.agent_notes from anon, authenticated;
grant select on public.agent_notes to anon, authenticated;
grant all on public.agent_notes to service_role;
