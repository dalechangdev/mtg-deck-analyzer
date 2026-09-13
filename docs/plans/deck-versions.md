# Plan: deck versions

**Goal.** For a given deck, keep several named versions. For each version: name
it, swap cards, log notes about games played with it, and compare it to other
versions.

**Status.**

| Step | Scope | State |
|---|---|---|
| 1 | Schema, migration + backfill, RLS, `requireVersionAccess` | done (applied locally, uncommitted) |
| 2 | Card routes + loaders take `versionId`; pages use the current version | done (uncommitted) |
| 3 | Version routes, switcher, branch / rename / make current | done (uncommitted) |
| 4 | Game log routes + page | done (uncommitted) |
| 5 | `deck-version.ts`, compare route + page | done (uncommitted) |

### Step 2 notes

- Card routes moved to `/api/decks/[id]/versions/[versionId]/cards[/deckCardId]`,
  gated by `requireVersionAccess`; the deck-scoped `/api/decks/[id]/cards` routes
  are deleted. Clients build the URL with `versionCardsUrl` (`src/lib/deck-api.ts`).
- `src/lib/deck-version-loader.ts` — `resolveVersionId(deckId, requested?)`:
  a requested id must belong to the deck (else null → 404); otherwise
  `currentVersionId`, falling back to the newest version.
- `src/lib/deck-entry.ts` — the shared `toDeckEntry` / `deckEntryInclude` /
  `deckEntryOrderBy`, replacing the four copy-pasted mappers.
- `loadDeckCards` / `loadDeckCardDetails` take `versionId`;
  `analyzeDeck(deckId, versionId, templateId, viewerId)`; role overrides stay by `deckId`.
- `GET /api/decks/[id]/analysis` accepts `?versionId=`. Pages don't read `?v=`
  yet — that lands with the switcher in step 3, together with `deck-steps.tsx` hrefs.
- `POST /api/decks` creates deck + v1 (+ commander) and sets `currentVersionId`
  in one transaction. The deck list reads commander and count from the current version.
- Verified: `tsc` 0 errors (after `next typegen` cleared stale `.next/types`
  entries for the deleted routes), ESLint clean on every touched file, and on the
  running dev server the moved routes answer 401 unauthenticated while the old
  card routes answer 404. **Not yet exercised signed in:** adding/moving/removing
  cards, creating a deck, and the analysis page, in a browser.

### Step 3 notes

- API: `GET/POST /api/decks/[id]/versions` (POST copies `fromVersionId`, default
  current, inside a transaction; the new version is not made current),
  `GET/PATCH/DELETE /versions/[versionId]`, `PUT /versions/[versionId]/current`.
  DELETE takes `SELECT … FOR UPDATE` on the deck row so concurrent deletes can't
  leave a deck with zero versions; the last version answers 409; deleting the
  current version hands "current" to its parent, else the newest remaining.
- Validation in `src/lib/deck-version-input.ts` (name ≤ 60 chars, notes ≤ 5000),
  reusing `readJsonBody` / `isUniqueViolation` from `template-input.ts`.
- **Bug fixed in the shared `isUniqueViolation`:** the pg driver adapter reports
  composite unique violations as `constraint.index` only
  (`DeckVersion_deckId_name_key`), with no `fields` and no `meta.target`, so the
  helper returned false and duplicate names were 500s. It now parses Prisma's
  default index name. This also fixes the templates' race-path 409 for
  `(ownerId, name)`.
- Every deck page reads `?v=` (`resolveVersionId`; unknown id → 404), and every
  in-app link between deck pages goes through `deckPageUrl` so navigation stays
  on the version. Client views seeded from props are keyed by `versionId` so
  switching remounts instead of showing stale state.
- UI: `version-switcher.tsx` in the builder header (switch / New version / All
  versions), `new-version-modal.tsx`, `/decks/[id]/versions` with
  `version-manager.tsx` (inline rename, notes on blur, make current, branch,
  two-click delete; W/L/D shown from `GameLog`, all zero until step 4).
- Verified: `tsc` 0, ESLint clean; signed-in end-to-end script against the dev
  server with a throwaway Supabase user — 39/39: branch copies cards as new rows,
  swaps in one version don't touch the other, 409 on duplicate names (POST and
  PATCH), make current, pages with `?v=`, cross-deck and cross-account 404s,
  delete-current fallback to parent, last-version 409. **Not clicked through in a
  browser:** the switcher Select, the modal, and the manager's inline edits.

### Step 4 notes

- API: `GET/POST /api/decks/[id]/versions/[versionId]/games` (newest first),
  `PATCH/DELETE /games/[gameId]`, gated by `requireVersionAccess` and scoped by
  `{ id, versionId }` like the card routes.
- Validation in `src/lib/game-log-input.ts`: notes required (trimmed, ≤ 10 000);
  `result` WIN/LOSS/DRAW/null; `podSize` 2–10; `turns` 1–99; `opponents` ≤ 500;
  `playedAt` a real `YYYY-MM-DD`, not in the future (36h slack for timezones
  ahead of UTC). PATCH only touches keys it was sent; `null` clears.
- `playedAt` is stored at **12:00 UTC** on the chosen date and read back with
  `toISOString().slice(0, 10)`, so the calendar day survives any timezone. The
  form's "today" default is computed in the browser (the create form only opens
  on click), never during a server render.
- Page `/decks/[id]/versions/[versionId]/games`: record + win rate (over games
  with a result), chips to jump between versions' logs, create / edit / two-click
  delete. Links from the builder switcher ("Games (n)") and each version card.
- Result colours are `GAME_RESULT_STYLE` / `GAME_RESULT_LABEL` in
  `mtg-styles.ts`, on the success / danger / warning tokens.
- Verified: `tsc` 0, ESLint clean; the signed-in end-to-end script now runs
  63/63 (step 3's 39 plus 24 for games): validation 400s, date round-trip,
  ordering, the version record, PATCH preserving untouched fields, clearing with
  null, cross-version / cross-deck / cross-account 404s on API and page, delete.
  **Not clicked through in a browser:** the log form and inline edit.

### Step 5 notes

- `src/lib/deck-version.ts` (pure, client-safe): `diffVersions(from, to)` keyed
  by card id, main slot only, with commander changes; `curveBins` /
  `curveAverage` (moved out of `mana-curve.tsx`, so the builder and the compare
  page compute the curve and average CMC identically — 7+ counted as 7);
  `versionStats`; `winRate` (over games with a result); the `VersionComparison`
  payload type.
- `deck-version-loader.ts`: `resolveComparePair(deckId, a?, b?)` — `a` defaults
  to current; `b` to a's parent, else the newest other version; a requested id
  from another deck is not-found; a one-version deck is nothing-to-compare.
  `loadVersionComparison` loads both card lists once and scores both against
  the same template with the deck's role overrides.
- `GET /api/decks/[id]/compare?a=&b=&templateId=` (404 not-found, 400 when
  there's nothing to compare) and `/decks/[id]/compare` (friendly message for a
  one-version deck). The diff runs from baseline `b` to version `a`.
- `version-compare.tsx`: version and baseline pickers with swap, template
  picker, at-a-glance table with differences, card changes (in a not b / in b
  not a / count changed), `ManaCurveComparison` (a in the builder's curve
  colour, b in `--chart-2`), and a per-requirement scorecard. Entry points:
  "Compare" in the builder switcher and on each version card (hidden with one
  version).
- `REQUIREMENT_STATUS_STYLE` moved to `mtg-styles.ts`; the analysis page imports
  it rather than keeping its own copy.
- Tests: `apps/mtg/test/deck-version.test.ts`, run with
  `pnpm --filter @mtg/deck-builder test` (new script; CLAUDE.md updated).
- Verified: `tsc` 0, ESLint clean, 10/10 unit tests; the signed-in end-to-end
  script now runs 83/83 (20 new for compare: default baseline is the parent,
  diff contents and direction, stats, shared template, game records, swapped
  sides, 404s for unknown / other-deck / other-account versions, 400 for a
  one-version deck, and the page in each state). **Not clicked through in a
  browser:** the pickers, the chart, and the page layout.

### Step 1 notes

- Three migrations, not one: `20260913120000_add_deck_versions` (schema,
  backfill, RLS), `…120100_grant_deck_versions` (table grants — this database
  has no default privileges on `public`), `…120200_fix_deck_version_policy_recursion`
  (moves the cross-table checks into `private.is_own_version_of_deck`, a
  `SECURITY DEFINER` helper; the inline versions recursed and broke every Data
  API write to `Deck` and `DeckVersion`). Squash them before committing if
  preferred — nothing outside the local DB has applied them.
- `prisma migrate dev` is broken repo-wide, independent of this feature: its
  shadow database has no `auth` schema, so `…_add_ownership_and_rls` fails to
  replay. Migrations are hand-written and applied with `prisma migrate deploy`.
- Verified locally: 6 decks / 214 `DeckCard` rows / 246 cards before and after,
  every deck on its own v1. As the Data API `authenticated` role: owner sees own
  versions, cards, games; a stranger sees none; pointing `currentVersionId`,
  a `GameLog`, or a `parentVersionId` at another account's version is rejected;
  renaming a deck, adding a version, branching and switching current succeed.

## Core decision: each version owns a full copy of its card list

`DeckCard` moves from `Deck` to a new `DeckVersion`. Branching copies the
parent's rows. Diffs are computed at read time, never stored.

Rejected: storing versions as add/remove deltas against a base. Every read
would replay a chain, editing the base silently mutates every child, and the
storage saved is ~100–150 rows per version. Copy-on-branch matches the existing
"derived, never stored" rule in `deck-template-loader.ts`.

| Stays on `Deck` (shared by all versions) | Moves to `DeckVersion` |
|---|---|
| name, description, themes, templates | version name, notes about the version |
| `CardAnnotation` (already designed to survive a card leaving the deck) | `DeckCard` rows: main, maybe, wishlist, commander |
| `DeckCardRole` overrides (a card's role doesn't change per version) | `GameLog` entries |
| `maybeboardName` / `wishlistName` | |

**Accepted trade-off:** Potential and Wishlist piles are per version, because
`slot` is a column on `DeckCard`. A card added to Potential in v2 won't appear
in v1. A shared per-deck pool would need a separate `DeckVersionCard` table and
a much larger rewrite of `deck-builder.tsx`; revisit only if per-version piles
prove annoying in use.

## 1. Schema (`apps/mtg/prisma/schema.prisma`)

- `DeckVersion { id, deckId, name, notes?, parentVersionId?, createdAt, updatedAt }`,
  `@@unique([deckId, name])`. `parentVersionId` records lineage so compare can
  default to "vs parent"; `onDelete: SetNull`.
- `Deck.currentVersionId String? @unique`, FK to `DeckVersion`, `onDelete: SetNull`.
  An FK rather than an `isActive` boolean, because the boolean needs a partial
  unique index Prisma can't express. Cost: creating a deck is two writes in one
  transaction.
- `DeckCard.deckId` → `DeckCard.versionId` (`onDelete: Cascade`),
  `@@unique([versionId, cardId])`. No denormalised `deckId` kept — ownership
  joins through the version.
- `GameLog { id, versionId, playedAt, result: GameResult?, podSize?, opponents?, turns?, notes, createdAt, updatedAt }`,
  `@@index([versionId, playedAt])`. `enum GameResult { WIN LOSS DRAW }`.

## 2. Migration (`prisma migrate dev --create-only`, then hand-edited)

Never `supabase db reset` in `apps/mtg`.

1. Create `DeckVersion`, `GameLog`.
2. Insert one version named `v1` per deck (`gen_random_uuid()::text` ids), set
   `Deck.currentVersionId`.
3. Add `DeckCard.versionId`, backfill from `deckId` via that deck's v1, `SET NOT NULL`.
4. Swap the unique index, drop `DeckCard.deckId`.
5. RLS, same shape as `20260910120000_add_ownership_and_rls`: enable on both new
   tables, `EXISTS` policy on `DeckVersion` through `Deck`, and `DeckCard` /
   `GameLog` policies rewritten to join `version → Deck`.

## 3. Ownership (`src/lib/ownership.ts`)

`requireVersionAccess(deckId, versionId)` counts
`deckVersion { id: versionId, deckId, deck: { userId } }`. Someone else's
version answers 404. Every `DeckCard` query then scopes by `{ id, versionId }`,
the way `cards/[deckCardId]/route.ts` scopes by `{ id, deckId }` today.

## 4. API routes

```
/api/decks/[id]/versions                     GET list (+ card count, W/L), POST { name, fromVersionId? } → copy cards
/api/decks/[id]/versions/[versionId]         GET entries, PATCH { name, notes }, DELETE (refuse if last version)
/api/decks/[id]/versions/[versionId]/current PUT → set Deck.currentVersionId
/api/decks/[id]/versions/[versionId]/cards               ← moved from /api/decks/[id]/cards
/api/decks/[id]/versions/[versionId]/cards/[deckCardId]  ← moved
/api/decks/[id]/versions/[versionId]/games               GET, POST
/api/decks/[id]/versions/[versionId]/games/[gameId]      PATCH, DELETE
/api/decks/[id]/compare?a=&b=                            diff + stat deltas + game records
```

- Annotations, roles, templates stay deck-scoped.
- `POST /api/decks` creates deck + v1 + commander card in one transaction.
- `GET /api/decks` reads commander and count from `currentVersion`.
- `GET /api/decks/[id]` loses `entries` (moves to the version GET).
- `analysis` route takes `?versionId=`, defaulting to current.
- Branching: `createMany` from the source rows inside `$transaction`; name
  unique per deck (409 on clash).

## 5. Library

- `deck-template-loader.ts`: `loadDeckCards` / `loadDeckCardDetails` take
  `versionId`; `analyzeDeck(deckId, versionId, …)` keeps loading role overrides
  by `deckId`.
- New `src/lib/deck-version.ts`, pure:
  - `diffVersions(a, b)` → `{ added, removed, changedQuantity, unchanged }`, main slot, keyed by `cardId`.
  - `versionStats(entries)` → count, avg CMC, curve buckets (same as `mana-curve.tsx`), ramp via `isManaRamp`, colour split.
  - `gameRecord(games)` → W/L/D, win rate.
- Extract the `dc → DeckEntry` mapper now copy-pasted in `decks/[id]/page.tsx`,
  `builder/page.tsx`, `api/decks/[id]/route.ts` and the loader.

## 6. Pages / URLs

Selected version lives in `?v=<versionId>`; absent means current, so existing
links keep working.

- `decks/[id]/page.tsx`, `builder/page.tsx`, `builder/sacrifice/page.tsx`,
  `analysis/page.tsx`: resolve version (fallback `currentVersionId`), load cards
  through it, pass `versionId` + version list to the client.
- New `decks/[id]/versions/page.tsx`: name, notes, card count, W/L/D, last
  played; branch, make current, rename, delete.
- New `decks/[id]/versions/[versionId]/games/page.tsx`: log form (date, result,
  pod size, opponents, turns, notes) + history.
- New `decks/[id]/compare/page.tsx?a=&b=`: cards in / out / quantity changes,
  stat deltas, overlaid curves (`mana-curve.tsx` gains a second series), each
  version's template scorecard (`analyzeDeck` twice, same template), game
  records. `b` defaults to the parent.

## 7. Components

- `deck-builder.tsx`, `builder-view.tsx`, `deck-analysis-view.tsx`: the ~15
  `fetch` calls go through a `versionApi(deckId, versionId)` path helper.
- `deck-steps.tsx`: hrefs carry `?v=`.
- New `version-switcher.tsx` (builder header): current version, switch, "new
  version from this", "compare with…", "log a game".
- New `version-compare.tsx`, `game-log-form.tsx` on `components/ui`
  primitives and token classes (result colours from `--success-*` etc., no
  literals).
- `card-annotation-modal.tsx`, `cmc-compare-modal.tsx` unchanged.

## Verification

- `pnpm turbo run typecheck`; request another account's version / game ids and
  expect 404.
- `apps/mtg` has no test suite; `deck-version.ts` is pure, so a `node:test` file
  for `diffVersions` and `gameRecord` (same setup as `packages/itaca`) is cheap.
