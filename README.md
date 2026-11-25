# WebMCP services directory (demo)

A one-page services directory in the style of paslaugos.lt, with 10,000 fictional providers from Lithuania, Latvia and Estonia.
AI agents search it through three WebMCP tools. The site is read-only: no accounts, no forms, no backend.

**All data is invented.** Emails and websites use the reserved `.example` domain, and phone numbers start with `000`, which no Baltic operator assigns.

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

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search_services` | `query`, `category`, `country`, `city`, `priceMax`, `priceUnit`, `minRating`, `language`, `travelsToClient`, `openNow`, `availableWithinDays`, `sortBy`, `limit`, `offset` (all optional) | `total`, `returned`, `offset`, `appliedFilters`, `warnings`, `results[]` |
| `get_service` | `id` | `service`: the full listing with weekly hours and computed availability |
| `list_service_filters` | none | valid categories, countries, cities, price units, languages, sort options, with counts |

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
  js/tools.js                 createTools({ catalog, now, showFilters, showListing })
  js/webmcp.js                registerTools(tools)
  js/app.js                   page rendering and wiring
tests/                        one file per module, plus page.test.js for index.html rules
```

The page and the tools call the same `searchServices`, so a tool answer and the visible list agree.
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

- With one tab of this site open, the tools keep their names: `search_services`, `get_service`, `list_service_filters`.
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
