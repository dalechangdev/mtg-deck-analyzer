# Plan: deck versions

**Goal.** For a given deck, keep several named versions. For each version: name
it, swap cards, log notes about games played with it, and compare it to other
versions.

**Status.**

| Step | Scope | State |
|---|---|---|
| 1 | Schema, migration + backfill, RLS, `requireVersionAccess` | done (applied locally, uncommitted) |
| 2 | Card routes + loaders take `versionId`; pages use the current version | done (uncommitted) |
| 3 | Version routes, switcher, branch / rename / make current | todo |
| 4 | Game log routes + page | todo |
| 5 | `deck-version.ts`, compare route + page | todo |

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
