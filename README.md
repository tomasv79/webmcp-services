# WebMCP services directory (demo)

A one-page services directory in the style of paslaugos.lt, with 10,000 fictional providers from Lithuania, Latvia and Estonia.
AI agents search it through three WebMCP tools, and a fourth tool lets an agent fill in the new-service form for the
visitor to submit. The site has no backend. It has two forms: a demo sign-in, and a form that adds a service and keeps it
in the visitor's own browser.

**All shipped data is invented.** Emails and websites use the reserved `.example` domain, and phone numbers start with `000`, which no Baltic operator assigns.
A service added with the form holds whatever its author typed; it never leaves that browser.

## Run

```bash
docker compose up -d --build
```

Then open <http://localhost:5175>. The `public/` folder is mounted into the container, so an edit shows after a refresh.
The image also contains the files, so it runs on its own:

```bash
docker run --rm -p 127.0.0.1:5176:80 webmcp-services:local
```

Stop and remove the image with `docker compose down --rmi local`.

## Tests

```bash
npm test
```

No install step: the tests use Node's built-in runner (Node 22 or newer). Run them once more with another machine time zone to check the date logic:

```bash
TZ=America/New_York npm test
```

## Sign-in

The header has a **Prisijungti** button that opens a sign-in dialog. Two demo users exist:

| Username | Password | Shown as |
|---|---|---|
| `jonas` | `jonas123` | Jonas Jonaitis |
| `ona` | `ona123` | Ona Onaitė |

- This is a demo sign-in, not security. The user list is in `public/js/auth.js`, which the browser downloads, and the
  check runs in the page. It tells the page who is using it and protects nothing. Never put a real password there.
- Signing in changes the header: it shows the user's name and an **Atsijungti** button. It is also needed to add a
  service (see below). The directory and the WebMCP tools work the same signed in or out.
- The username ignores case and surrounding spaces; the password must match exactly.
- The signed-in username (never the password) is kept in `localStorage` under `webmcp-services.user`, so it survives a
  reload and is shared by all tabs of the site. Where `localStorage` is blocked, sign-in lasts until the reload.
- The form has `method="dialog"` and no `action`, so nothing is sent anywhere and the fields never reach the address bar.

## Adding a service

The header has a **Pridėti paslaugą** button that opens the new-service form. A signed-out visitor gets the sign-in
dialog first and the form right after signing in.

- There is no backend, so a new service is kept in `localStorage` under `webmcp-services.listings`. It is visible only in
  that browser, in all tabs of the site, and survives a reload. Clearing the site data removes it; the page has no
  button to edit or delete a service yet.
- A new service is a normal listing: the list, the filters and the three search tools find it. It gets the next free id
  (`svc-10001`, `svc-10002`, ...), a **Pridėta šioje naršyklėje** badge, and is shown highlighted above the list right
  after it is added.
- It has no reviews: `rating` is `{ average: 0, count: 0 }`, so it sorts after the rated listings and `minRating` leaves
  it out. It is never `verified`. The form asks for one language only, so `titleEn` and `descriptionEn` repeat the text
  as typed.
- The city is chosen from the cities the catalog already has, so the city filter and the tool vocabulary do not change.
- The fields are checked by `js/listing-input.js`, with messages in Lithuanian under each wrong field. The browser's own
  validation is off (`novalidate`). A decimal comma is accepted in prices; a postal code may be typed without the
  country prefix (`08318` becomes `LT-08318`).
- What is stored is the form input, not the finished listing. Every page load reads it through the same checks, so a
  damaged or hand-edited entry is skipped instead of breaking the page.
- Where `localStorage` is blocked or full, the service is added until the reload and the page says so.
- Like the sign-in, the form has `method="dialog"` and no `action`: nothing is sent anywhere.
- A form that is cancelled keeps what was typed; it is emptied after the service is added.
- An agent can fill in the form with the `draft_service` tool (see below). The form then shows a line saying that an AI
  agent filled it in. Only the person can submit it.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search_services` | `query`, `category`, `country`, `city`, `priceMax`, `priceUnit`, `minRating`, `language`, `travelsToClient`, `openNow`, `availableWithinDays`, `sortBy`, `limit`, `offset` (all optional) | `total`, `returned`, `offset`, `appliedFilters`, `warnings`, `results[]` |
| `get_service` | `id` | `service`: the full listing with weekly hours and computed availability |
| `list_service_filters` | none | valid categories, countries, cities, price units, languages, sort options, with counts |
| `draft_service` | the fields of the new-service form | `status`, `message`, `draft`, `warnings` |

Things worth knowing when calling them:

- Every answer starts with `notice: "Fictional demo data"`, `currency: "EUR"` and `timeZone: "Europe/Vilnius"`.
- Wrong input never throws. The answer is `{ error: { field, message, validValues? } }`.
- `query` matches Lithuanian and English text, ignores case and diacritics, and tolerates word endings (`Vilniuje` finds Vilnius). Words shorter than 3 letters are ignored. A listing needs at least one matching word; more matches rank higher.
- `city` accepts local and Lithuanian spellings without diacritics (`Rīga`, `riga`, `Ryga`).
- `openNow` means inside working hours right now. It says nothing about free capacity. "Can start today" is `availableWithinDays: 0`.
- Prices are the advertised starting price. Call-out fees are returned separately. Without `priceUnit`, `priceMax` and the price sorts compare across units and the answer carries a warning.
- `search_services` also filters the list on the page and opens the page that holds the returned results. `get_service` shows the listing highlighted above the list; the filters stay as they are.
- `limit` is clamped to 1..20 (default 10); walk through a large result with `offset`. The page itself shows 10 cards per page, so a tool answer of up to 20 results can cover two pages; the page opens at the first of them.
- The input schema lists the canonical values. The tools also accept other letter case, country names (`Latvia`, `Estija`) and city spellings, but a client that validates against the schema first will only let the canonical values through.

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
  vendor/webmcp-polyfill.js   W3C polyfill, unchanged copy; a no-op where the browser has WebMCP
  js/data.js                  categories, countries, city aliases, 60 hand-written listings
  js/generate.js              seeded generator for the other 9,940 listings
  js/catalog.js               data.js + generated listings = the 10,000 the page and tools use
  js/text.js                  normalise, tokenise, stem match
  js/availability.js          Vilnius clock, openNow, nextFreeDate
  js/search.js                searchServices(catalog, filters, now)
  js/tools.js                 createTools({ catalog, now, showFilters, showListing, showDraft })
  js/webmcp.js                registerTools(tools)
  js/auth.js                  two demo users, createAuth({ storage }): signIn, signOut, currentUser
  js/listing-input.js         createListingReader(catalog): form values in, a listing or a list of errors out;
                              inputOfListing(listing): the way back, used to fill the form from a draft
  js/user-listings.js         createUserListings({ catalog, read, storage }): sync, add; added listings in localStorage
  js/app.js                   page rendering and wiring
tests/                        one file per module, plus page.test.js for index.html rules
```

The page and the tools call the same `searchServices`, so a tool answer and the visible list agree.
The page works on its own copy of the catalog and appends added services to it; the search index and the tools' id
lookup take in whatever was appended since their last call.
Availability is computed from the current time on every call, so the data does not go stale.

## Data

- 60 listings are written by hand in `js/data.js`.
- 9,940 more are generated in the browser at page load by `js/generate.js` from a fixed seed, so every load and every
  test run sees the same 10,000 listings (`svc-001` to `svc-060`, then `svc-00061` to `svc-10000`). No large data file is
  shipped. Change `TOTAL_LISTINGS` in `js/catalog.js` for a different size, or `DEFAULT_SEED` in `js/generate.js` for
  different data.
- 12 categories, 4 generated service types each; 31 cities: 13 in Lithuania, 9 in Latvia, 9 in Estonia.
  About half the listings are Lithuanian, a quarter Latvian and a quarter Estonian.
- The ids of generated listings are stable as long as `generate.js` and the number of hand-written listings do not
  change. Editing the word lists or service types reshuffles which listing an id stands for; a test pins three listings
  so that this never happens by accident.
- `get_service` accepts an id with any zero padding: `svc-1`, `svc-001` and `svc-00001` are the same listing.
- Company names are built from generic words, without city names or utility words (energy, heat, light, water), to stay
  away from real municipal companies. A generic combination can still coincide with a real small business; the phone
  numbers, emails and websites cannot reach anyone. Street names are ordinary ones and house numbers are kept between
  300 and 990, so a generated address is unlikely to exist.
- Latvian and Estonian phone numbers have four free digits, which holds about 9,000 generated listings per country.
  The generator throws a clear error beyond that.
- Measured on the development machine: generating takes about 35 ms, building the search index about 0.3 s (once),
  a search 3-30 ms. The page loads in about 0.3 s and renders 10 cards per page.

## Relay

The page loads the `@mcp-b/webmcp-local-relay` bridge (version 6.2.0, pinned by integrity hash) from jsDelivr.
The relay accepts a page only if its origin is listed in the relay's `--widget-origin` option, so add:

```
http://localhost:5175,http://127.0.0.1:5175
```

Until then the browser console shows `host-origin-not-allowed`, and the tools work only inside the page.
Every running relay process has to be restarted after the change; if several Claude sessions run the relay, the one that
owns the relay port decides, so restart them all.

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

- Every URL the page loads is relative except the one relay script, so the site works at `/`, under a sub-path, or on a subdomain.
- The container listens on plain port 80; put it behind any reverse proxy.
- WebMCP needs a secure context: `localhost` or HTTPS. The subdomain must be HTTPS, and its origin must be added to the relay.
