# WebMCP services directory (demo)

A one-page services directory in the style of paslaugos.lt, with 10,000 fictional providers from Lithuania, Latvia and Estonia.
AI agents search it through three WebMCP tools, and a fourth tool lets an agent fill in the new-service form for the
visitor to submit. Every catalog listing also has [agent notes](#agent-notes): a few facts that only the tools
return and the page does not show. The page is static files; the listings and the accounts are in a [Supabase](https://supabase.com)
project. A visitor can create an account, sign in and add a service, which every other visitor then sees.

**The catalog is invented.** Its emails and websites use the reserved `.example` domain, and its phone numbers start with `000`, which no Baltic operator assigns.
A service added with the form holds whatever its author typed, is public, and nobody checks it.

## Run

The database comes first (see [Supabase](#supabase) below). Then:

```bash
docker compose up -d --build
```

Then open <http://localhost:5175>. The `public/` folder is mounted into the container, so an edit shows after a refresh.
The image also contains the files, so it runs on its own:

```bash
docker run --rm -p 127.0.0.1:5176:80 webmcp-services:local
```

Stop and remove the image with `docker compose down --rmi local`.

The local page and the hosted page talk to the same Supabase project: there is one database, and a service added
from `localhost` is in it for everyone.

## Supabase

The project is `https://swilbbbdlcmwibyoiqmq.supabase.co`. `public/js/config.js` has its URL and its publishable key.
That key is meant to be public: what it may do is decided by the row-level security in the migration. The secret
key is never written into a file of this repository.

Setting the project up, once:

1. **Tables and functions.** With the Supabase CLI signed in (`npx supabase login`), push the migrations:

   ```bash
   npx supabase db push --remote=swilbbbdlcmwibyoiqmq
   ```

   This is how `supabase/migrations/20261126000000_directory.sql` was applied, and the project remembers it, so a
   later migration file is pushed the same way. Without the CLI, paste the files into the project's SQL editor in
   the order of their names and run them. The first creates the tables `categories`, `cities` and `listings`, the
   functions `search_listings` and `listing_counts`, and the access rules; `20261126120000_agent_notes.sql` adds
   the table `agent_notes`.
2. **The key in the page.** Copy the publishable key (Project Settings → API keys; `anon` in an older project) into
   `SUPABASE_KEY` in `public/js/config.js`.
3. **The catalog.** Write the categories, the cities, the 10,000 listings and their agent notes with the secret
   key, which is read from the environment:

   ```bash
   SUPABASE_SECRET_KEY=... npm run seed
   ```

   It sends about 20 MB in twenty-two requests, and can be run again whenever the catalog changes: it replaces the catalog's rows and leaves
   the listings that visitors added alone.
4. **Sign-up without a confirmation email.** `supabase/config.toml` switches "Confirm email" off, and is written
   to the project with:

   ```bash
   npx supabase config push --remote=swilbbbdlcmwibyoiqmq
   ```

   Only what the file declares is changed. To have new accounts confirm their email instead, set
   `enable_confirmations = true` there and push again, and in Authentication → URL Configuration set the Site URL to
   `https://tomasv79.github.io/webmcp-services/` and add `http://localhost:5175/**` to the redirect URLs; without
   that the link in the email opens `localhost:3000`.

5. **The demo account.** Create it once in the page: **Neturiu paskyros** (**I have no account**), with the email
   `jonas@webmcp-services.example` and the name and password from the table under [Accounts](#accounts).

Who may do what in the database:

| | Read listings and agent notes, search | Add a listing | Change or delete, write agent notes |
|---|---|---|---|
| Anyone (publishable key) | yes | no | no |
| A signed-in visitor | yes | yes, and it becomes theirs | no |
| The secret key (seed script, dashboard) | yes | yes | yes |

- A listing is one row: its number (the 61 of `svc-00061`), the listing itself as JSON in `data`, and its search words.
  The columns the search filters and sorts by (category, city, price, rating, working hours, ...) are generated from
  `data`, so they cannot disagree with it.
- A listing that arrives from a visitor gets its number from a sequence that starts at 10001, its owner from the
  session, a rating of zero and `verified: false`, whatever was sent. One account can add at most 50.
- The database checks the shape of a listing: a category and a city (in the right country) that exist, a positive
  price, a known unit, known languages, well-formed working hours. The text limits are checked by the form
  (`js/listing-input.js`), and the page puts every visitor's listing through those checks again before showing it, so
  a row written past the form is left out instead of breaking the page.
- Who added a listing (`owner`) is not readable through the API. To remove a listing, delete its row in the dashboard.
- The agent notes are a table of their own, `agent_notes`, one row per catalog listing. Only the seed script writes
  it, and a row goes when its listing is deleted. See [Agent notes](#agent-notes) for what "only the tools" means.
- The search runs in Postgres (`search_listings`): filters, relevance, availability at the caller's moment in
  Europe/Vilnius time, sorting and paging. The words of a query are stemmed in the page (`js/text.js`), and the same
  code writes the search words of every listing, so both sides split and fold text the same way.

## Hosting

`.github/workflows/pages.yml` publishes the `public/` folder to GitHub Pages on every push to `main`, at
<https://tomasv79.github.io/webmcp-services/>. It needs Settings → Pages → Source set to "GitHub Actions" once.
On a GitHub Free account Pages works only for a public repository.

Pages lets a browser keep every file for ten minutes, and that cannot be changed. So that a browser never runs the
new `index.html` with an old script out of its cache, the workflow first runs `scripts/stamp.js`, which adds the
commit to every address by which the page's files load each other (`js/app.js?v=<commit>`). The files in the
repository are not changed, and the container needs none of this: it answers with `Cache-Control: no-cache`.
After a deploy, an open tab shows the new page on its next reload.

Supabase holds the data and the accounts, not the page: it serves HTML as plain text, so the files stay on Pages
(or in the container).

The hosted page is unlisted, not private: anyone with the link can open it, create an account and add a service.
The page carries a `noindex` tag so search engines skip it. For the relay to accept the hosted page, add
`https://tomasv79.github.io` to its `--widget-origin` list (see Relay below).

## Tests

```bash
npm test
```

No install step: the tests use Node's built-in runner (Node 22.13 or newer) and no network. Supabase is replaced by
small stand-ins, and `tests/support/reference-search.js` is the search written out in JavaScript: what the
database function has to do. Run them once more with another machine time zone to check the date logic:

```bash
TZ=America/New_York npm test
```

One file, `tests/supabase.live.test.js`, checks a real database against that reference search: a few hundred
searches must give the same listings in the same order. It only reads, and it is skipped unless it is told where to look:

```bash
SUPABASE_URL=https://swilbbbdlcmwibyoiqmq.supabase.co SUPABASE_KEY=<publishable key> npm test
```

## Languages

The page's own words are in Lithuanian and English; the **LT** / **EN** buttons in the header switch between them
without a reload, keeping the filters, the open page of results and whatever is typed into the new-service form.

- The page opens in the language chosen before (kept in `localStorage` under `webmcp-services.language`), else in the
  first of the browser's languages that it has, else in English.
- `index.html` is the Lithuanian page. Every text in it names its entry in `js/i18n.js` with `data-i18n` (or
  `data-i18n-placeholder`, `data-i18n-aria-label`, `data-i18n-content` for an attribute), and the script writes the
  English one over it. `tests/i18n.test.js` checks that the markup and the Lithuanian entries say the same, that both
  languages have every entry, and that no text in the page is left unmarked.
- The data is not translated by the page: the catalog already has both names of every category and country and both
  texts of every listing (`title` / `titleEn`, `description` / `descriptionEn`), and the page shows the ones of its
  language. A service added with the form has one text and shows as typed in both. City names are the local ones.
- Numbers and prices follow the language: `1 234,5` and `25 €` in Lithuanian, `1,234.5` and `€25` in English.
- The tools do not depend on the page language: they answer in English and return both texts, as before.

The rest of this file calls the buttons by their Lithuanian names, with the English ones in brackets.

## Accounts

The header has a **Prisijungti** (**Sign in**) button that opens a dialog. The same dialog creates an account:
**Neturiu paskyros** (**I have no account**) switches it, and adds an optional name.

- Accounts are real ones, kept by Supabase Auth: an email and a password. The password is sent to Supabase over HTTPS
  and checked there; the page keeps it nowhere.
- "Confirm email" is switched off in the project (`supabase/config.toml`), so a new account is signed in as soon as
  it is created and no email is sent. Nobody checks that the address belongs to the person, so anyone can sign up
  and add services; one account can add at most 50.
- The page also handles a project that confirms emails: the new account then gets an email with a link, the link
  comes back to the page, and the page signs the person in and takes the session out of the address bar. Supabase's
  own mail service sends only a few emails per hour; for more, set up SMTP in the project.
- There is one demo account, for trying the page without signing up:

  | Sign in as | Password | Name |
  |---|---|---|
  | `jonas` | `jonas123` | Jonas Jonaitis |

  It is an ordinary account, `jonas@webmcp-services.example`. A sign-in name without `@` gets that domain, so
  `jonas` is enough. The password is public, so anyone can use the account, use up its 50 listings or change its
  password; to reset it, delete the user in the dashboard (Authentication → Users) and create it again.
- Signing in changes the header: it shows the name (or the email) and an **Atsijungti** (**Sign out**) button. It is
  also needed to add a service (see below). The directory and the reading tools work the same signed in or out.
- The session (two tokens and the name, never the password) is kept in `localStorage` under
  `webmcp-services.session`, so it survives a reload and is shared by all tabs of the site. A token that is about to
  end is renewed when it is next needed. Where `localStorage` is blocked, the session lasts until the reload.
- The form has `method="dialog"` and no `action`, so the browser itself sends nothing and the fields never reach the
  address bar; the script makes the one call to Supabase.

## Adding a service

The header has a **Pridėti paslaugą** (**Add service**) button that opens the new-service form. A signed-out visitor gets the sign-in
dialog first and the form right after signing in.

- A new service is saved in the Supabase database and is public at once: every visitor and every agent that searches
  the directory finds it. The form says so. The page has no button to edit or delete a service yet.
- A new service is a normal listing: the list, the filters and the three search tools find it. It gets the next free id
  (`svc-10001`, `svc-10002`, ...; a number is not reused, so there can be gaps), a **Pridėta lankytojo**
  (**Added by a visitor**) badge, and is shown highlighted above the list right after it is added.
- It has no reviews: `rating` is `{ average: 0, count: 0 }`, so it sorts after the rated listings and `minRating` leaves
  it out. It is never `verified`. The form asks for one language only, so `titleEn` and `descriptionEn` repeat the text
  as typed.
- The city is chosen from the cities of `js/vocabulary.js`, so the city filter and the tool vocabulary do not change.
- The fields are checked by `js/listing-input.js`, with messages in the page's language under each wrong field. The browser's own
  validation is off (`novalidate`). A decimal comma is accepted in prices; a postal code may be typed without the
  country prefix (`08318` becomes `LT-08318`).
- The form stays open until the database has taken the listing. When it has not (no connection, a session that ended,
  the limit of 50 per account), the form says why and keeps what was typed.
- A form that is cancelled keeps what was typed; it is emptied after the service is added.
- An agent can fill in the form with the `draft_service` tool (see below). The form then shows a line saying that an AI
  agent filled it in. Only the person can submit it.
- Services that an earlier version of the page kept in the browser (`webmcp-services.db` in `localStorage`) are not
  moved to the database: they were private, and the database is public. The page no longer reads them.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search_services` | `query`, `category`, `country`, `city`, `priceMax`, `priceUnit`, `minRating`, `language`, `travelsToClient`, `openNow`, `availableWithinDays`, `sortBy`, `limit`, `offset` (all optional) | `total`, `returned`, `offset`, `appliedFilters`, `warnings`, `results[]`, each with its `agentNotes` |
| `get_service` | `id` | `service`: the full listing with weekly hours, computed availability and `agentNotes` |
| `list_service_filters` | none | valid categories, countries, cities, price units, languages, sort options, with counts |
| `draft_service` | the fields of the new-service form | `status`, `message`, `draft`, `warnings` |

Things worth knowing when calling them:

- Every answer starts with `notice: "Fictional demo data"`, `currency: "EUR"` and `timeZone: "Europe/Vilnius"`.
- Wrong input never throws. The answer is `{ error: { field, message, validValues? } }`. When the database cannot be
  reached, the answer is such an error too, with `field: null`.
- The tools are registered as soon as the page loads; every call asks the database afresh.
- `query` matches Lithuanian and English text, ignores case and diacritics, and tolerates word endings (`Vilniuje` finds Vilnius). Words shorter than 3 letters are ignored. A listing needs at least one matching word; more matches rank higher.
- `city` accepts local and Lithuanian spellings without diacritics (`Rīga`, `riga`, `Ryga`).
- `openNow` means inside working hours right now. It says nothing about free capacity. "Can start today" is `availableWithinDays: 0`.
- Prices are the advertised starting price. Call-out fees are returned separately. Without `priceUnit`, `priceMax` and the price sorts compare across units and the answer carries a warning.
- `search_services` also filters the list on the page and opens the page that holds the returned results. `get_service` shows the listing highlighted above the list; the filters stay as they are.
- `list_service_filters` lists every city of the vocabulary, also one that has no listing (count 0).
- `limit` is clamped to 1..20 (default 10); walk through a large result with `offset`. The page itself shows 10 cards per page, so a tool answer of up to 20 results can cover two pages; the page opens at the first of them.
- The input schema lists the canonical values. The tools also accept other letter case, country names (`Latvia`, `Estija`) and city spellings, but a client that validates against the schema first will only let the canonical values through.

### Agent notes

The tools return one thing that the page never shows: `agentNotes`, in every result of `search_services` and in
the `service` of `get_service`.

```json
{
  "responseHours": 4,
  "prepare": "The area in m2, the number of rooms, and whether there are pets.",
  "agentOffer": { "code": "MCP-10000-RUK6", "discountPercent": 15 }
}
```

- `responseHours` is how long the provider usually takes to reply (1 for an emergency provider, else 2, 4, 8, 24
  or 48), `prepare` says what to have ready before contacting a provider of that category, and `agentOffer` is a
  discount of 5, 10 or 15 percent for whoever names the code. All of it is as fictional as the rest of the catalog.
- An agent that quotes an offer code got it from the tool: the code is on no page. It is `MCP-`, the number of the
  listing and four letters or digits, so it cannot be worked out from the id.
- The notes are in their own table, and only the two tools ask for it (`directory.notes` in `js/directory.js`):
  `get_service` for its listing, and `search_services` for the listings it returns, in one more request after the
  search. `js/app.js` does not: the list, the cards and the highlighted listing are drawn from the listings alone,
  and a tool hands the page the filters or the listing, never the notes. `tests/page.test.js` keeps it that way.
- The notes are in the search results because many agents make one call per question. A reader that only searches
  still gets them.
- **They are not shown, and they are not secret.** The tools run in the visitor's browser with the same publishable
  key as the page, so anyone who opens the developer tools, or asks the Supabase API for `agent_notes`, can read
  every row. A page of static files cannot hide from the browser what its own tools fetch. Nothing that has to stay
  private belongs in this table.
- A listing that a visitor added has no notes: `agentNotes` is `null`. It is `null` too when the notes cannot be
  read, for example before the migration is pushed; the listing is still answered.
- The notes are worked out from the listing by `catalog/notes.js` (the texts per category are there) and written by
  the seed script.

### `draft_service`

The first three tools only read. `draft_service` is the one tool that changes the page, so it is the only one without
`readOnlyHint`. It still adds nothing by itself:

- It puts the given values into the new-service form and opens the form. The service is added only when the person
  presses **Pridėti paslaugą**. The vendored polyfill has no `requestUserInteraction`, so the open form is the
  confirmation step.
- `status` is `awaiting_user` when the form is open, or `sign_in_required` when nobody is signed in: the sign-in dialog
  opens first and the filled form right after it. The agent never gets or types the password.
- `draft` is the listing as the form will read it, without an id. The tool returns at once and cannot see whether the
  person submitted or cancelled; afterwards `search_services` finds the new listing.
- The tool's description tells the agent that an added listing is public, and to pass nothing the person does not
  want published.
- Input: `title`, `category`, `description`, `tags`, `providerName`, `providerType`, `yearsExperience`, `phone`, `email`,
  `country`, `city`, `address`, `postalCode`, `travelsToClient`, `radiusKm`, `remote`, `priceFrom`, `priceTo`,
  `priceUnit`, `calloutFee`, `negotiable`, `languages`, `hours`, `leadTimeDays`, `emergency`. Numbers are numbers,
  `tags` and `languages` are lists, and `hours` has one `{ "open": "09:00", "close": "18:00" }` per working day
  (`mon` to `sun`); a day that is left out is a day off.
- The values go through the same checks as the form (`js/listing-input.js`). Wrong input returns every wrong field at
  once: `{ error, errors: [{ field, message, validValues? }] }`, where `error` is the first of `errors`, the messages are
  in English and the page is left alone.
- Two things the form reader lets through are refused here, because an agent would not notice them: a boolean written as
  a string (`"true"`), and an unknown day in `hours` (`monday`). Unknown fields are ignored and named in `warnings`.
- Every call replaces the whole form, including what the person typed there, so the agent always sends the complete
  listing.

## How it is built

```
public/
  index.html, styles.css
  favicon.svg                 the page's icon; named in index.html so no browser asks the host for /favicon.ico
  vendor/webmcp-polyfill.js   W3C polyfill, unchanged copy; a no-op where the browser has WebMCP
  js/config.js                the Supabase project: its URL and its publishable key
  js/supabase.js              createSupabase({ url, key, fetch }): rpc, select, insert, auth; the few calls, over fetch
  js/vocabulary.js            categories, countries, cities and their other spellings, price units, languages
  js/text.js                  normalise, tokenise, stem match
  js/availability.js          Vilnius clock, openNow, nextFreeDate
  js/directory.js             createDirectory({ client, catalog, token }): search, get, counts, notes, add; the
                              listings in the database. Also sortFor(filters) and searchWords(listing, catalog)
  js/tools.js                 createTools({ catalog, directory, now, showFilters, showListing, showDraft })
  js/webmcp.js                registerTools(tools)
  js/auth.js                  createAuth({ client, storage }): signIn, signUp, signOut, currentUser, token,
                              adoptRedirect; accounts with Supabase Auth
  js/i18n.js                  the page's own words in Lithuanian and English, createI18n({ storage, preferred }):
                              language, setLanguage, t, number
  js/listing-input.js         createListingReader(catalog): form values in, a listing or a list of errors out;
                              inputOfListing(listing): the way back, used to fill the form from a draft and to check
                              a visitor's listing that comes from the database
  js/app.js                   page rendering and wiring
catalog/                      what the seed script writes to the database; the page does not load it
  data.js                     60 hand-written listings
  generate.js                 seeded generator for the other 9,940 listings
  notes.js                    notesFor(listing): the agent notes of a listing, which only the tools return
  catalog.js                  data.js + generated listings = the 10,000, and the agent notes of each
scripts/seed.js               writes the categories, the cities, the catalog and the agent notes to Supabase with
                              the secret key
supabase/migrations/          the tables, the search function and the access rules, as SQL
supabase/config.toml          the project settings this repository decides: no confirmation email at sign-up
tests/                        one file per module, page.test.js for index.html rules, migration.test.js for the SQL,
                              supabase.live.test.js for a real database, and support/: the reference search and a
                              directory that answers from memory
```

The page and the tools call the same `directory.search`, so a tool answer and the visible list agree.
The one thing they do not share is `directory.notes`, which only `search_services` and `get_service` call.
The page keeps no copy of the listings: it asks for ten at a time, and again once a minute, because "open now"
depends on the clock. An answer that arrives after a newer search has started is dropped, and typing in the search
box asks the database only after a short pause.
The caller's moment goes to the database with every search, so the "open now" filter there and the availability the
page works out for each card are read off the same clock.

## Data

- 60 listings are written by hand in `catalog/data.js`.
- 9,940 more are generated by `catalog/generate.js` from a fixed seed, so every run of the seed script and every
  test run sees the same 10,000 listings (`svc-001` to `svc-060`, then `svc-00061` to `svc-10000`). Change
  `TOTAL_LISTINGS` in `catalog/catalog.js` for a different size (the first number a visitor's listing gets is fixed
  at 10001 in the migration), or `DEFAULT_SEED` in `catalog/generate.js` for different data, and run the seed script again.
- 12 categories, 4 generated service types each; 31 cities: 13 in Lithuania, 9 in Latvia, 9 in Estonia.
  About half the listings are Lithuanian, a quarter Latvian and a quarter Estonian.
- The ids of generated listings are stable as long as `generate.js` and the number of hand-written listings do not
  change. Editing the word lists or service types reshuffles which listing an id stands for; a test pins three listings
  so that this never happens by accident.
- Every catalog listing has agent notes, worked out by `catalog/notes.js` from the listing's number, category and
  emergency flag with a seed of their own (`NOTES_SEED`). They do not take part in the generator's random draws, so
  adding them changed no listing. A test pins the notes of two listings.
- `get_service` accepts an id with any zero padding: `svc-1`, `svc-001` and `svc-00001` are the same listing.
- Company names are built from generic words, without city names or utility words (energy, heat, light, water), to stay
  away from real municipal companies. A generic combination can still coincide with a real small business; the phone
  numbers, emails and websites cannot reach anyone. Street names are ordinary ones and house numbers are kept between
  300 and 990, so a generated address is unlikely to exist.
- Latvian and Estonian phone numbers have four free digits, which holds about 9,000 generated listings per country.
  The generator throws a clear error beyond that.
- Measured against a local Supabase Postgres: seeding takes about 2 s, a text search about 20 ms, and the slowest
  search (every listing, soonest first) about 110 ms.

## Relay

The page loads the `@mcp-b/webmcp-local-relay` bridge (version 6.2.0, pinned by integrity hash) from jsDelivr.
The relay accepts a page only if its origin is listed in the relay's `--widget-origin` option, so add:

```
http://localhost:5175,http://127.0.0.1:5175
```

Until then the browser console shows `host-origin-not-allowed`, and the tools work only inside the page.
Every running relay process has to be restarted after the change; if several Claude sessions run the relay, the one that
owns the relay port decides, so restart them all.

Where no relay is running, the console fills with failed WebSocket connections to `ws://127.0.0.1:93xx` and
`ws://[::1]:93xx`. That is the bridge looking for a relay, and it is harmless: it tries port 9333, then ports 9333 to 9348
on both loopback addresses, again after 10, 20 and 30 seconds, and after that only port 9333 every two minutes or when the
tab is shown again. The browser writes these lines itself and a page cannot hide them. The bridge has no option that
skips the search and still connects on load (`data-auto-connect="false"` waits until the tab is hidden and shown again),
so the page keeps the search: an agent with the relay must find the tools as soon as the page opens.

How the relay presents the tools (checked on 2026-11-25 with the flight demo open at the same time):

- With one tab of this site open, the tools keep their names: `search_services`, `get_service`, `list_service_filters`
  `draft_service` was added after that check; the relay lists it the same way, with its full input schema.
- With two or more tabs open, each tab's tools get the first four characters of that tab's id as a suffix,
  for example `search_services_ab69` and `search_services_7bce`. `webmcp_list_sources` shows which tab is which.
  A call acts on the page of the tab it names, so close spare tabs to keep the plain names.
- Tools of other sites do not collide with these names; the flight demo's `searchFlights` is suffixed only because two
  tabs of that demo are open.
- The relay passes the answer through as JSON text, including the `{ error: ... }` answers. `webmcp_call_tool` does not
  check arguments against the input schema, so the tolerant inputs (`country: "Latvia"`, `limit: 50`) reach the tool.

## Merging with other sites later

- Every URL the page loads is relative except the one relay script, and the scripts know one outside address, the Supabase
  project in `js/config.js`. So the site works at `/`, under a sub-path, or on a subdomain; a new address has to be added to the
  redirect URLs of the Supabase project, or the confirmation emails will not link back to it.
- The container listens on plain port 80; put it behind any reverse proxy.
- WebMCP needs a secure context: `localhost` or HTTPS. The subdomain must be HTTPS, and its origin must be added to the relay.
