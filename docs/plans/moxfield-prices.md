# Plan: Moxfield deck → Ítaca prices

**Goal.** A page, `/prices`, where I paste a Moxfield deck link and get one row
per card with its Ítaca price and stock, plus a deck total. It is a lookup
tool: nothing is imported into my decks and nothing user-owned is written.

**Status.** Shipping paste-only (decided 2026-10-01): the Moxfield-link path
waits on an approved User-Agent, and the pasted list feeds the same pipeline.

| Step | Scope | State |
|---|---|---|
| 1 | `src/lib/decklist.ts`: plain-text decklist parser (pure) | done (uncommitted) — `test/decklist.test.ts` |
| 2 | Moxfield API client | deferred — needs an approved User-Agent; see Open questions |
| 3 | `@mtg/itaca`: `getPricing(…, { scan: false })` | done (uncommitted) — `packages/itaca/test/client.test.ts` |
| 4 | `ItacaPrice` cache table | done (uncommitted) — `20261001120000_add_itaca_price`, applied local + hosted |
| 5 | `POST /api/prices/decklist` — streams NDJSON (`src/lib/price-events.ts`) | done (uncommitted) — `src/lib/deck-pricing.ts` |
| 6 | `/prices` page + nav link | done (uncommitted) — `src/components/prices/decklist-pricer.tsx` |
| 7 | Tests | done — parser and itaca option; the route has no test (needs DB + network) |
| 8 | Browser check against a real list | done 2026-10-01 — streaming, cache hits, DFC names, unknown cards, basics skip all confirmed; found two bugs, fixed below |
| 9 | Cheapest in-stock copy across a card's printings (see "Other printings") | done (uncommitted) — `src/lib/printing-choice.ts`, `test/printing-choice.test.ts`; browser-checked 2026-10-01 (Aether Spellbomb MMA sold out → FDC €0.15; Sol Ring CMM €2.45 → €0.95; Arcane Signet M3C €0.95 → €0.25) |

**As built, where it differs from the design below.** The route is
`/api/prices/decklist` (body `{ text, skipBasics }`), not `/moxfield`. Cache rows
are keyed `(cardId, setCode)` — Scryfall oracle id plus printing — rather than a
name string, so lines are resolved against `Card`/`CardFace` first and an
unrecognised name is reported as "Unknown card" without an Ítaca request.
There is no "refresh stale" button: stale rows past their TTL are simply
refetched, and each row's age shows on hover. Not-found rows carry no link to
the Ítaca set page (`getPricing` doesn't return the expansion slug). A list is
capped at 150 distinct cards.

**Found in the browser check.**

- *Set codes never matched.* `CardPrinting` holds **one** printing per card.
  `sync:cards` downloads `default_cards` (every printing) but upserts by oracle
  id and only creates printings in the `create` branch, so every printing after
  the first one seen is dropped. Fixed for /prices by step 9, which asks
  Scryfall for printings instead; the sync itself is unchanged. The "newest
  printing" heuristic in `/api/cards/[id]/price` has the same flaw: `setCode
  desc` over one row is just that row.
- *Precon sets matched the wrong Ítaca expansion.* Scryfall's "Modern Horizons 3
  Commander" is Ítaca's "Commander: Modern Horizons 3"; the fuzzy fallback took
  the first containing name (the generic "Commander"). `findExpansionSlug` now
  tries a word-order-insensitive match, then the closest-length containing name.
- *Some printings simply aren't on Ítaca under the guessed slug* (Atraxa, C16:
  the slug is right by Ítaca's conventions, the page 302s). With `scan: false`
  these stay "Not found" — the intended trade.

## Other printings (step 9)

A card's named printing can be sold out while another set has it in stock
(Aether Spellbomb: Modern Masters sold out, Commander: Foundations €0.15).
Ítaca's product page doesn't link a card's other printings, and its search is
disallowed by robots.txt (`/search/*`, `/searchBuyList/*`), so:

1. **Printings from Scryfall.** `fetchPaperPrintings(oracleId)` —
   `oracleid:… game:paper unique:prints`, newest first, one per set. One
   request per card, paced at 100ms, cached by Next for 24h.
2. **Free filter.** Each set name maps to an Ítaca expansion through the cached
   expansions index; a set Ítaca doesn't list costs no request. Only the named
   printing may match loosely (`findExpansionSlug(…, { fuzzy: false })` for the
   rest), so a guess never spends 5s. Printings mapping to the same expansion
   are tried once.
3. **Order and cap.** Named printing first, then newest first, at most
   `MAX_ATTEMPTS_PER_CARD` (8) Ítaca requests per card.
4. **Result: cheapest in stock** (decided 2026-10-01, over "first in stock").
   `pickBest`: cheapest in-stock attempt; else "sold out" if any printing is
   listed; else "not found". The row shows the printing the price came from
   and, if it isn't the listed one, what happened to the listed one.
5. **Cache is unchanged in shape.** `ItacaPrice` was already one row per
   (card, printing set) — now several rows per card. A stopped run keeps every
   attempt made, so a re-run resumes.

Cost: up to 8 × 5s per card uncached. Aether Spellbomb (8 paper sets, all on
Ítaca) took 36s. A staple-heavy 100-card deck can take 30+ minutes cold; the
cache makes re-pricing cheap.

## The two constraints that shape everything

**Ítaca allows one request every 5 seconds.** `itaca-client.ts` is a process
singleton so that limit holds across requests (see `docs/RATE_LIMITING.md`).
`getPricing` costs one product-page fetch per card when the slug guess hits
(the expansions index is cached for 24h). A 100-card Commander deck with ~70
unique non-basic cards is therefore **~6 minutes** on a cold cache. The page
cannot be a request that blocks until it has every price. Hence:

- **Stream** results as they arrive (NDJSON from a Route Handler), so the
  table fills in row by row with a progress count and an ETA.
- **Cache** each lookup in the database, so the second look at a deck — or a
  different deck sharing staples — costs nothing for cached cards.
- **Dedupe** by (name, set) before lookup, and **skip basic lands** by default.
- **Never run the set-scan fallback for a deck.** On a slug miss, `getPricing`
  walks the whole expansion — up to 60 pages, 5 minutes, for one card. For a
  deck that is unbounded. Step 3 adds `{ scan: false }`; a miss is reported as
  "not found" with a link to the Ítaca set page instead.
- **Stop when the client leaves.** The handler checks `request.signal` between
  cards, so a closed tab stops spending the crawl budget.

Because the limiter is shared, a deck lookup in progress also delays the card
modal's single-card price lookups. Acceptable for a personal tool; noted so it
isn't a surprise.

**Moxfield's API is gated.** `api2.moxfield.com/v3/decks/all/{publicId}` answers
403 to an arbitrary client (checked 2026-10-01). Moxfield issues approved
User-Agent strings on request; without one the API is unusable from a server.
So:

- The server sends `MOXFIELD_USER_AGENT` from `.env` when set. Unset, or a 403,
  is reported to the page as `moxfield_unavailable`, not a generic error.
- The page always offers a second input: **paste the decklist** (Moxfield →
  Export → "Copy as plain text", lines like `1 Sol Ring (CMM) 410`). This path
  never touches Moxfield and is the one that works today. It is also the
  natural test fixture.

Both paths produce the same `DeckLine[]`, so everything after step 2 is
indifferent to where the list came from.

## Design

**Which printing.** Superseded by "Other printings (step 9)" above: v1 priced
only the printing the deck named, which reported cards as sold out that were in
stock in another set.

**Shapes.**

```ts
// src/lib/moxfield.ts
type DeckLine = {
  quantity: number;
  name: string;            // front-face name for DFCs
  setCode: string | null;  // "cmm"
  setName: string | null;  // filled from Moxfield, or from CardPrinting for pasted lines
  board: "commanders" | "mainboard";
};

parseMoxfieldUrl(url): string | null   // moxfield.com/decks/{publicId}
parseDecklist(text): DeckLine[]        // tolerant: "1x", set/collector suffix, foil marks, section headers
```

Sideboard and maybeboard are dropped in v1. Commanders are priced like any card.

**Stream protocol** (`POST /api/prices/moxfield`, body `{ url } | { text }`):

```
{"type":"deck","name":"…","lines":[…DeckLine],"toLookup":64,"cached":12}
{"type":"price","key":"sol ring|cmm","status":"found","lowestPriceCents":150,"currency":"EUR","inStock":true,"url":"https://itaca.gg/…","cached":false}
{"type":"price","key":"…","status":"not_found"}
{"type":"done"}
{"type":"error","code":"moxfield_unavailable"}      // or invalid_url, deck_not_found
```

Money is converted to integer cents at the edge: `ItacaPricing.lowestPrice` is
a float in euros from JSON-LD, and stays inside the route.

**Cache table.** Not user data — a price is the same for every account.

```prisma
model ItacaPrice {
  key              String   @id   // normalised "name|setCode"
  status           String          // "found" | "not_found"
  lowestPriceCents Int?
  currency         String?
  inStock          Boolean  @default(false)
  url              String?
  fetchedAt        DateTime @default(now())
}
```

TTL 24h for found rows, 7d for not-found (a miss is usually a slug mismatch,
which won't fix itself). The page shows each row's age and a "refresh stale"
button rather than refetching silently. Enable RLS on the table with no
policies, so the Data API can't read or write it; Prisma is unaffected.

**Auth.** The route requires a signed-in user (`requireUserIdOr401`). It writes
no user rows, but it makes outbound requests on the server, and an anonymous
endpoint that triggers 5-minute crawls is an invitation.

**The page.** `src/app/prices/page.tsx` + a client component in
`src/components/prices/`. Two inputs (link, or paste) and a "skip basic lands"
toggle. The table: qty, name, set, unit price, line total, stock, Ítaca link;
sortable by line total. Header: running total of found cards, "N of M priced",
ETA (`remaining × 5s`, cached rows excluded). Not-found and out-of-stock cards
grouped at the bottom. Values from the token layer and `mtg-styles.ts`, not
literals.

## Steps in detail

1. **`moxfield.ts`** — pure functions, no imports from `server-only` modules, so
   `node:test` can load them.
2. **`moxfield-client.ts`** — the only place in the deck builder that fetches
   Moxfield. One request per lookup; still, keep a 1s minimum interval in the
   module so a retrying user can't hammer it. Map `boards.commanders` and
   `boards.mainboard` (`{ quantity, card: { name, set, set_name } }`) to
   `DeckLine`. That response shape is from memory, not verified (the API
   answered 403) — confirm it once a User-Agent is approved.
3. **Itaca option** — `getPricing(name, setName, { scan?: boolean })`, default
   `true` so the card modal keeps today's behaviour. Test in `packages/itaca`.
4. **Migration** — `prisma migrate dev` locally, then `migrate deploy` to the
   hosted project (accepted practice, per CLAUDE.md).
5. **Route** — resolve lines → set names, dedupe, read cache, emit the `deck`
   event, then look up misses one at a time through the `itaca` singleton,
   writing each to the cache before emitting it.
6. **Page.**
7. **Tests** — `test/moxfield.test.ts` (URL forms, decklist variants: DFC
   `A // B`, `1x`, foil `*F*`, blank lines and headers, commander section);
   the itaca `scan: false` path against an existing fixture.
8. **Browser check** — paste a real list, watch it stream, reload and confirm
   the second run is served from cache. `.env` points at the hosted database,
   so this writes real `ItacaPrice` rows; that's fine (not user data) but worth
   knowing.

## Open questions

- **Moxfield User-Agent.** Request one from Moxfield, or ship paste-only first?
  Recommendation: build both; paste-only is fully usable while the request is
  pending.
- **Ítaca terms.** Personal price lookup is the use `itaca-client.ts` already
  claims. If this page ever lands in the restock SaaS, the Terms-of-Service
  question in CLAUDE.md applies to it too.

## Later

- "Add missing cards to cart" — `ShoppingCartCard` already exists.
- Price a deck already in the app (`/decks/[id]`) through the same route with
  `{ deckId }`, behind `ownership.ts`.
