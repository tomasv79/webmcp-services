-- The services directory in Postgres: the catalog, the listings visitors add, and the search the page and the
-- WebMCP tools call. Run this once in the Supabase SQL editor, then fill the tables with scripts/seed.js.
--
-- Who may do what:
--   anyone (the publishable key)   read listings, call search_listings and listing_counts
--   a signed-in visitor            also insert a listing, which becomes theirs
--   the secret key (seed script)   everything
-- Nobody can change or delete a listing through the API.

-- ── Reference values: a listing can only be in a category and a city that are listed here ──────────────────────

create table public.categories (
  id text primary key,
  name_lt text not null,
  name_en text not null
);

create table public.cities (
  name text primary key,
  country text not null check (country in ('LT', 'LV', 'EE')),
  unique (name, country)
);

-- ── Listings ───────────────────────────────────────────────────────────────────────────────────────────────────

-- The catalog has the numbers 1 to 10000; a listing a visitor adds gets the next free one (svc-10001, ...).
create sequence public.listing_number as integer start with 10001;

/** Weekly working hours: a day is null (closed) or ["HH:MM", "HH:MM"]. */
create function public.valid_hours(hours jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select case when jsonb_typeof(hours) = 'object' then not exists (
    select 1 from jsonb_each(hours) as day
    where day.key not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
       or not coalesce(
         day.value = 'null'::jsonb
         or (
           jsonb_typeof(day.value) = 'array' and jsonb_array_length(day.value) = 2
           and (day.value ->> 0) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           and (day.value ->> 1) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         ), false)
  ) else false end
$$;

create table public.listings (
  number integer primary key check (number between 1 and 999999999),  -- the 61 of svc-00061
  owner uuid references auth.users (id) on delete cascade,            -- who added it; null for the catalog
  data jsonb not null,                                                -- the listing as the page and the tools use it
  -- Search words, written by the page's own text.js (js/directory.js: searchWords): " word1 word2 ...".
  -- A match in `strong` (title, category) counts double.
  strong text not null default '' check (length(strong) <= 2000),
  weak text not null default '' check (length(weak) <= 8000),

  -- What the search filters and sorts by, read out of `data` so the two can never disagree.
  added boolean generated always as (owner is not null) stored,
  category text not null generated always as (data ->> 'category') stored references public.categories (id),
  country text not null generated always as (data #>> '{location,country}') stored,
  city text not null generated always as (data #>> '{location,city}') stored,
  price_from numeric not null generated always as ((data #>> '{price,from}')::numeric) stored check (price_from > 0),
  price_unit text not null generated always as (data #>> '{price,unit}') stored
    check (price_unit in ('hour', 'job', 'm2', 'visit', 'day')),
  rating_average numeric not null generated always as ((data #>> '{rating,average}')::numeric) stored
    check (rating_average between 0 and 5),
  rating_count integer not null generated always as ((data #>> '{rating,count}')::integer) stored check (rating_count >= 0),
  travels boolean not null generated always as ((data #>> '{serviceArea,travelsToClient}')::boolean) stored,
  lead_days integer not null generated always as ((data #>> '{availability,leadTimeDays}')::integer) stored
    check (lead_days between 0 and 60),
  emergency boolean not null generated always as ((data #>> '{availability,emergency}')::boolean) stored,
  hours jsonb not null generated always as (data #> '{availability,hours}') stored check (public.valid_hours(hours)),
  languages jsonb not null generated always as (data -> 'languages') stored
    check (
      jsonb_typeof(languages) = 'array' and jsonb_array_length(languages) between 1 and 5
      and languages <@ '["lt", "lv", "et", "en", "ru"]'::jsonb
    ),

  foreign key (city, country) references public.cities (name, country),
  -- The id in the data is the number of the row: "svc-001", "svc-00061" and "svc-10001" are 1, 61 and 10001.
  constraint listings_id check (
    case when (data ->> 'id') ~ '^svc-[0-9]{1,9}$' then substr(data ->> 'id', 5)::integer = number else false end
  ),
  -- The page checks a visitor's listing field by field before it shows it; this keeps the worst out of the table.
  -- A missing field makes the test null, and a check lets null through: hence the coalesce.
  constraint listings_shape check (coalesce(
    length(data::text) <= 12000
    and length(data ->> 'title') between 1 and 200
    and length(data ->> 'description') between 1 and 2000
    and jsonb_typeof(data -> 'tags') = 'array'
    and jsonb_typeof(data -> 'provider') = 'object'
    and jsonb_typeof(data -> 'contact') = 'object'
    and jsonb_typeof(data -> 'location') = 'object'
    and jsonb_typeof(data -> 'serviceArea') = 'object'
    and jsonb_typeof(data -> 'price') = 'object',
    false))
);

create index listings_owner on public.listings (owner) where owner is not null;

-- A listing that arrives from a signed-in visitor: the server decides its number and its owner, and it starts
-- without reviews and unverified, whatever was sent. The seed script (secret key, no user) is left alone.
create function public.listings_from_visitor() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  visitor uuid := auth.uid();
begin
  if visitor is null then
    return new;
  end if;
  if (select count(*) from public.listings where owner = visitor) >= 50 then
    raise exception 'A visitor can add at most 50 listings.' using errcode = 'P0001';
  end if;
  new.number := nextval('public.listing_number');
  new.owner := visitor;
  new.data := jsonb_set(
    new.data || jsonb_build_object(
      'id', 'svc-' || new.number,
      'rating', jsonb_build_object('average', 0, 'count', 0)
    ),
    '{provider,verified}', 'false'::jsonb
  );
  return new;
end
$$;

create trigger listings_from_visitor before insert on public.listings
  for each row execute function public.listings_from_visitor();

-- ── Search ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One search for the page and for the tools. The caller (js/directory.js) has already turned the query into word
 * stems and picked the sort; everything else of search_services is decided here.
 *
 * p_stems        a listing must have a word that starts with at least one of them; more matches rank higher
 * p_open_now     only providers inside working hours at p_now (Europe/Vilnius); emergency providers always are
 * p_within_days  work can start within this many days: lead time, then the first working day
 * p_sort         relevance | rating | price_asc | price_desc | soonest
 * p_now          the caller's clock, so that the answer and what the caller computes from it agree
 *
 * Returns { total, all, mixedUnits, items: [{ data, added, score }] }: `total` counts every match, `all` every
 * listing, and `mixedUnits` says that the matches are priced per different units.
 */
create function public.search_listings(
  p_stems text[] default '{}',
  p_category text default null,
  p_country text default null,
  p_city text default null,
  p_price_max numeric default null,
  p_price_unit text default null,
  p_min_rating numeric default null,
  p_language text default null,
  p_travels boolean default null,
  p_open_now boolean default false,
  p_within_days integer default null,
  p_sort text default 'rating',
  p_limit integer default 10,
  p_offset integer default 0,
  p_now timestamptz default now()
) returns jsonb
language sql stable
set search_path = ''
as $$
  with clock as (
    select
      local_time::date as today,
      extract(dow from local_time)::integer as dow,
      to_char(local_time, 'HH24:MI') as now_time,
      array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as days,
      coalesce(p_open_now, false) or p_within_days is not null or p_sort = 'soonest' as wanted
    from (select p_now at time zone 'Europe/Vilnius' as local_time) as vilnius
  ),
  matched as materialized (
    select l.number, l.data, l.added, l.price_from, l.price_unit, l.rating_average, l.rating_count,
           words.score, free.open, free.days
    from public.listings as l
    cross join clock as c
    cross join lateral (
      select coalesce(sum(
        case when strpos(l.strong, ' ' || stem) > 0 then 2 when strpos(l.weak, ' ' || stem) > 0 then 1 else 0 end
      ), 0)::integer as score
      from unnest(p_stems) as stem
    ) as words
    -- Availability costs a little per listing, so it is worked out only where a filter or the sort needs it.
    cross join lateral (
      select
        c.wanted and (l.emergency or coalesce(
          jsonb_typeof(today.slot) = 'array'
          and (today.slot ->> 0) <= c.now_time collate "C"
          and c.now_time < (today.slot ->> 1) collate "C", false)) as open,
        case
          when not c.wanted then null
          when l.emergency then 0
          else start.days + coalesce((
            select min(later) from generate_series(0, 6) as later
            where jsonb_typeof(l.hours -> c.days[(c.dow + start.days + later) % 7 + 1]) = 'array'
          ), 0)
        end as days
      from (select l.hours -> c.days[c.dow + 1] as slot) as today
      -- With no lead time, a day that is closed or already past closing time does not count.
      cross join lateral (
        select l.lead_days + case
          when l.lead_days = 0 and (
            coalesce(jsonb_typeof(today.slot) <> 'array', true) or c.now_time >= (today.slot ->> 1) collate "C"
          ) then 1 else 0 end as days
      ) as start
    ) as free
    where (p_category is null or l.category = p_category)
      and (p_country is null or l.country = p_country)
      and (p_city is null or l.city = p_city)
      and (p_price_unit is null or l.price_unit = p_price_unit)
      and (p_price_max is null or l.price_from <= p_price_max)
      and (p_min_rating is null or l.rating_average >= p_min_rating)
      and (p_language is null or l.languages ? p_language)
      and (p_travels is null or l.travels = p_travels)
      and (cardinality(p_stems) = 0 or words.score > 0)
      and (not coalesce(p_open_now, false) or free.open)
      and (p_within_days is null or free.days <= p_within_days)
  ),
  ranked as (
    select m.*, row_number() over (order by
      case when p_sort = 'relevance' then -m.score end,
      case when p_sort = 'price_asc' then m.price_from when p_sort = 'price_desc' then -m.price_from end,
      case when p_sort = 'soonest' then m.days end,
      case when p_sort = 'soonest' then not m.open end,
      case when p_sort in ('relevance', 'rating', 'soonest') then -m.rating_average end,
      case when p_sort in ('relevance', 'rating', 'soonest') then -m.rating_count end,
      m.number
    ) as position
    from matched as m
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'all', (select count(*) from public.listings),
    'mixedUnits', (select count(distinct price_unit) > 1 from matched),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('data', r.data, 'added', r.added, 'score', r.score) order by r.position)
      from ranked as r
      where r.position > greatest(coalesce(p_offset, 0), 0)
        and r.position <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 10), 0), 100)
    ), '[]'::jsonb)
  )
$$;

/** How many listings each filter value has: what list_service_filters reports. */
create function public.listing_counts() returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.listings),
    'categories', coalesce((
      select jsonb_object_agg(category, n) from (select category, count(*) as n from public.listings group by category) as c
    ), '{}'::jsonb),
    'cities', coalesce((
      select jsonb_object_agg(city, n) from (select city, count(*) as n from public.listings group by city) as c
    ), '{}'::jsonb),
    'priceUnits', coalesce((
      select jsonb_object_agg(price_unit, n) from (select price_unit, count(*) as n from public.listings group by price_unit) as u
    ), '{}'::jsonb),
    'languages', coalesce((
      select jsonb_object_agg(code, n) from (
        select code, count(*) as n from public.listings, jsonb_array_elements_text(languages) as code group by code
      ) as l
    ), '{}'::jsonb)
  )
$$;

-- ── Access ─────────────────────────────────────────────────────────────────────────────────────────────────────

alter table public.categories enable row level security;
alter table public.cities enable row level security;
alter table public.listings enable row level security;

create policy "Anyone can read categories" on public.categories for select to anon, authenticated using (true);
create policy "Anyone can read cities" on public.cities for select to anon, authenticated using (true);
create policy "Anyone can read listings" on public.listings for select to anon, authenticated using (true);
create policy "A signed-in visitor adds their own listing" on public.listings for insert to authenticated
  with check (owner = (select auth.uid()));

-- Supabase may have granted everything on new tables already; start from nothing and give back what is needed.
revoke all on public.categories, public.cities, public.listings from anon, authenticated;
revoke all on sequence public.listing_number from anon, authenticated;
revoke execute on function public.listings_from_visitor() from public, anon, authenticated;

grant select on public.categories, public.cities to anon, authenticated;
-- Every column except `owner`: who added a listing stays between that person and the database.
grant select (
  number, data, strong, weak, added, category, country, city, price_from, price_unit,
  rating_average, rating_count, travels, lead_days, emergency, hours, languages
) on public.listings to anon, authenticated;
-- The number and the owner are set by the trigger above, so a visitor cannot send them.
grant insert (data, strong, weak) on public.listings to authenticated;

grant execute on function public.search_listings(
  text[], text, text, text, numeric, text, numeric, text, boolean, boolean, integer, text, integer, integer, timestamptz
) to anon, authenticated;
grant execute on function public.listing_counts() to anon, authenticated;
grant execute on function public.valid_hours(jsonb) to anon, authenticated;

grant all on public.categories, public.cities, public.listings to service_role;
grant usage, select on sequence public.listing_number to service_role;
grant execute on function public.search_listings(
  text[], text, text, text, numeric, text, numeric, text, boolean, boolean, integer, text, integer, integer, timestamptz
) to service_role;
grant execute on function public.listing_counts() to service_role;
