# Plan: land base matrix

**Goal.** On the analysis page, a widget that breaks a Commander deck's lands down
along several dimensions at once: which of the commander's colours each land
produces, whether it is basic, and what else it does (enters tapped, sac outlet,
activated ability, fetch, MDFC, creature land, card draw, cycling).

**Status.**

| Step | Scope | State |
|---|---|---|
| 1 | `Card.producedMana` column, migration, sync + every Card writer, re-sync | done (applied locally, uncommitted) |
| 2 | `src/lib/land-capabilities.ts` detectors + fixture tests | done (uncommitted) |
| 3 | `analyzeLandBase` aggregation + tests; thread `producedMana` into `DeckEntry`; `landBase` on the analysis route | not started |
| 4 | `LandBaseMatrix` component, wired into `deck-analysis-view.tsx` | not started |
| 5 | Signed-in browser check against real decks | not started |

### Step 1 notes

- `producedMana String[] @default([])` on `Card`; `produced_mana?: string[]` on
  `ScryfallCard`; `producedMana` added to `base` (so `update` fills existing rows) in
  both Card writers — `scripts/sync-cards.ts` and `src/app/api/library/import/route.ts`.
  The theme route only updates the relation and needs nothing.
- **Migration hand-written** (`20260913130000_add_card_produced_mana`) and applied
  with `prisma migrate deploy`. `migrate dev` fails replaying
  `20260910120000_add_ownership_and_rls` into its shadow DB (`schema "auth" does not
  exist`), and `migrate diff --from-config-datasource` refuses the cross-schema FKs
  to `auth.users`. Future migrations in this app need the same route until a shadow
  DB with the Supabase `auth` schema is configured.
- No `GRANT`: `Card`'s grants are table-level (`anon` SELECT, `authenticated` all),
  so the new column is covered.
- Verified: `migrate status` up to date, `tsc` 0, ESLint clean on touched files.
- **`sync:cards` OOMs** (pre-existing, not caused by this column): the first run
  died with `JavaScript heap out of memory` at 97,600 upserted. Rerun with
  `NODE_OPTIONS=--max-old-space-size=8192`. Worth a separate fix later.
- Spot-checks after the first (partial) run: Temple Garden `{G,W}`, Plains `{W}`,
  Wastes and Reliquary Tower `{C}`, Command Tower and City of Brass `{B,G,R,U,W}`,
  Evolving Wilds and Windswept Heath `{}`.
- **MDFCs answered:** Scryfall does populate top-level `produced_mana` for
  spell // land cards (Agadeem's Awakening `{B}`, Barkchannel Pathway `{G,U}`), so
  no face-text fallback is needed for them.
- **Gaps for step 2:** "choose a basic land type" lands (Thran Portal, Multiversal
  Passage) have no `produced_mana` — the detector should treat them as `any`.
  The remaining empty-mana lands are real non-producers (fetches, Maze of Ith,
  Vesuva, Dark Depths, Serra's Sanctum…).
- **Full rerun:** `Done. 107564 cards upserted, 10375 skipped`, no OOM. Volatile
  Fjord `{R,U}` and Tanglespan Bridgeworks `{G}` — both were only missing because
  the first run crashed. Totals: 2,500 cards with `producedMana`, 51 lands without,
  31,914 cards.

### Step 2 notes

- `src/lib/land-capabilities.ts`: `isLand`, `landColours(land, identity)`,
  `LAND_CAPABILITIES` (13 rows, `test(land, colours)`), `MANA_COLUMN_ORDER`,
  `LandCard = CardData & { producedMana? }`. Detectors read `landText` —
  `classifierText` with the card's own name replaced by "this land" (Mount Doom
  still names itself). Mana parsing reads `manaText`, which keeps reminder text
  (Volatile Fjord's only mana ability is reminder text).
- **`any` rule refined** from "covers every identity colour": a land is `any` when
  it is *flexible* — all five colours, "choose a basic land type", or an untyped
  fetch — or, in a 2+ colour identity, produces every identity colour. Without
  the 2+ guard every Forest was `any` in a mono-green deck.
- **Restricted mana ignored.** Scryfall lists Castle Doom, Cavern of Souls, Pillar
  of the Paruns etc. as all five colours; any line with "spend this mana only" is
  dropped and colours come from the remaining oracle text. Moved 32 lands out of
  `any` and 5 (Mishra's Workshop, Ancient Ziggurat…) to "no colours" — all checked.
- **Bug fixed in the shared `isBasicLand`** (`src/lib/commander.ts`): it matched a
  single basic land *type*, so 12 non-basics — Mystic Sanctuary, Dwarven Mine,
  Witch's Cottage… — counted as basic. That also let the builder
  (`deck-builder.tsx`, `builder-view.tsx`, `search-panel.tsx`) and `validateDeck`
  accept duplicates of those singleton lands. Now it tests the Basic supertype.
- Sac outlet = an activated cost sacrificing anything but the land alone
  (`this land` / `it`, unless followed by "and …"). Enumerating count words missed
  Westvale Abbey's "five creatures"; a first cut of the negative form caught
  Hellion Crucible's "sacrifice it".
- Tests: `test/land-capabilities.test.ts` against 41 real rows in
  `test/fixtures/lands.ts` (exported from the local DB) plus inline cost strings.
- **Corpus check** (all 1,194 commander-legal lands, script not committed): basic 12,
  nonbasic 1,182, multi 640, any-colour 144, etb-tapped 476, conditional 153,
  fetch 55, sac-outlet 34, activated 505, mdfc 90, creature-land 50, draw 69,
  cycling 50; 25 lands with no colours and no fetch, all genuine (Maze of Ith,
  Vesuva, Dark Depths, restricted-only mana). Spot-read every unfamiliar name in
  activated / draw / sac-outlet / any-colour.
- **Open — transform DFCs.** Without Scryfall's `layout`, a transform card with a
  land back (Growing Rites of Itlimoc, Westvale Abbey, the Ixalan flip lands,
  the LCI Ojer gods) is indistinguishable from a spell // land MDFC: it passes
  `isLand` and the `mdfc` row (~35 of its 90). Fix is a `Card.layout` column the
  same way as step 1; needs a decision before step 3.
- Verified: `pnpm test` 61/61, `tsc` 0, ESLint clean on touched files.

## Decisions

These were settled when the plan was written. Don't reopen them without a reason.

| Question | Decision |
|---|---|
| Shape | **Capability × colour matrix.** Rows are capabilities and columns are colours. Clicking a cell expands that cell's cards under the matrix. |
| Scope | **Lands only.** A card counts if any of its faces has `Land` in its type line, so spell/land MDFCs are included. Rocks and dorks are a possible follow-up. |
| Detection | **Scryfall `produced_mana` stored on `Card`**, plus oracle-text predicates for everything that isn't colour. |
| Counting | **Once in every colour it makes.** A W/G dual adds +1 to W and +1 to G, and a row's *total* counts it once. Columns read as "sources of X", the way Karsten counts. |
| Slots | **Main slot only, weighted by `quantity`, commander excluded.** No Potential preview in v1. |
| Judgement | **None in v1.** Raw counts only; requirement scoring stays in templates. |
| Placement | **Collapsible panel above the requirements list.** Computed client-side by a pure function, like `evaluateTemplate`, so promoting from Potential updates it instantly. |

## Data: `Card.producedMana`

- `producedMana String[] @default([])` on `Card`. Prisma scalar lists can't be
  optional, so "not yet synced" and "produces nothing" both look like `[]`. The
  detector therefore falls back to oracle parsing (`Add {G}`, `any color`) when the
  array is empty. Existing rows keep working before the re-sync, and the fallback
  also covers any card whose Scryfall entry omits the field.
- Migration `YYYYMMDDHHMMSS_add_card_produced_mana` via `pnpm --filter @mtg/deck-builder db:migrate`.
  Check whether `Card` uses column-level grants, which would need the new column
  granted. Table-level grants cover new columns automatically.
- `scripts/sync-cards.ts`: add `producedMana: card.produced_mana ?? []` to `base`,
  not `create`. Only `base` is written on `update`, which is how existing rows get
  the field.
- `ScryfallCard` in `src/lib/scryfall.ts`: add `produced_mana?: string[]`.
- Grep for every other Card writer (`card.upsert`, `card.create`, e.g. the library
  import and `api/cards/[id]`) and give each one the field.
- **Verify in step 1:** that Scryfall's top-level `produced_mana` is populated for
  spell/land MDFCs (e.g. *Emeria's Call*). If it isn't, derive the value from the
  land face's oracle text in the fallback.

## Domain: `src/lib/land-capabilities.ts` (pure, no Prisma)

```ts
export type ManaColumn = "W" | "U" | "B" | "R" | "G" | "C" | "any";

export type CapabilityGroup = "mana" | "tempo" | "utility" | "other";

export type LandCapability = {
  id: string;             // "basic", "etb-tapped", "sac-outlet", …
  group: CapabilityGroup;
  label: string;
  description: string;    // shown as the row's title tooltip
  test: (land: LandCard) => boolean;
};

/** Colours this land can put toward the deck, within the commander's identity. */
export function landColours(land: LandCard, identity: string[]): Set<ManaColumn>;

export const LAND_CAPABILITIES: LandCapability[];
```

`LandCard` is `CardData & { producedMana?: string[] }`. The detectors read land-face
text through `classifierText`, so MDFC and split faces are covered the way the
existing classifiers handle them.

**Colours (`landColours`).**
- Colours come from `producedMana`, or from the oracle fallback when that is empty.
- Fetches (`search your library for … land card`) produce nothing themselves. They
  count for the colours of the basic land types they name (Forest→G, …), or for
  every identity colour when they say "basic land card".
- Colours outside the commander's identity are dropped. `C` is kept.
- `any` applies when the land is flexible (all five colours, a chosen basic land
  type, an untyped fetch) or, in a 2+ colour identity, produces every identity
  colour (see step 2 notes). Such a land counts in every colour column **and** in
  `any`. Restricted mana ("spend this mana only…") is not counted.
- A colourless commander (`identity = []`) gets only the `C` and `any` columns.

**Rows** (rows overlap on purpose; one land often fills several):

| Group | Id | Rule of thumb |
|---|---|---|
| mana | `basic` | `isBasicLand(typeLine)` (existing helper). Includes snow basics and Wastes. |
| mana | `nonbasic` | Land and not basic. |
| mana | `multi` | `landColours` minus `C`/`any` has ≥ 2 entries. |
| mana | `any-colour` | `landColours` has `any`. |
| tempo | `etb-tapped` | `enters (the battlefield )?tapped` with no `unless` / `if` / `you may pay`. |
| tempo | `conditional` | Enters tapped *unless* something holds: check, fast, slow, shock, reveal lands. |
| utility | `fetch` | `search your library for [^.]*land card`. |
| utility | `sac-outlet` | Has a cost that sacrifices **another** permanent (`Sacrifice a creature:`, `Sacrifice another …:`). Self-sacrifice doesn't count. |
| utility | `activated` | Any activated ability (text line with `:` outside quotes) whose effect isn't just `Add …`. Fetches and outlets also match; overlap is expected. |
| other | `mdfc` | Has ≥ 2 faces, at least one of them a Land and at least one not. |
| other | `creature-land` | `becomes? an? [^.]*creature`. |
| other | `draw` | `draws? (a|one|two|three|x) cards?`. |
| other | `cycling` | `keywords` includes `Cycling`, or `\bcycling\b` in the text. |

Card names in oracle text may need normalising (e.g. to `CARDNAME`). Check what
`classifierText` already does before writing the self-sacrifice exclusion.

## Aggregation: `analyzeLandBase(entries: AnalyzedCard[])`

```ts
export type LandBaseCell = { count: number; cardIds: string[] };

export type LandBaseRow = {
  capabilityId: string;
  group: CapabilityGroup;
  label: string;
  description: string;
  total: number;                                     // each land once, × quantity
  cells: Partial<Record<ManaColumn, LandBaseCell>>;  // absent = not applicable (renders "–")
};

export type LandBaseAnalysis = {
  identity: string[];            // commander identity, WUBRG order
  columns: ManaColumn[];         // identity colours, then "C", then "any"
  rows: LandBaseRow[];           // LAND_CAPABILITIES order; rows with total 0 are kept
  sources: Partial<Record<ManaColumn, LandBaseCell>>; // footer: any land producing X
  landCount: number;
  producesNothingIds: string[];  // lands with no colours and no fetch: review queue / data gap
};
```

- It considers `slot === "main"` and `!isCommander` only, and weights every count
  by `quantity`.
- Identity comes from the commander entry. With no commander it falls back to the
  union of the lands' identities.
- `basic × any` is not applicable: that cell is left absent and renders `–`.

**API.** Extend the existing `GET /api/decks/[id]/analysis` response with
`landBase: analyzeLandBase(entries)`. That handler already runs `loadDeckCards`, so
this costs no extra query, and the route keeps the ownership path it already has
(`requireDeckAccess` → `resolveVersionId`). No new route is needed; the page itself
computes client-side.

**Plumbing.**
- `CardData` (`src/lib/commander.ts`): add optional `producedMana?: string[]`, the
  same way `faces` is optional.
- `toDeckEntry` (`src/lib/deck-entry.ts`): pass it through when the row has it. Add
  it to `DeckCardRow.card` as optional so callers with a narrower `select` still
  typecheck.
- `loadDeckCards` already `include`s the card, so the scalar arrives with no change.

## UI: `src/components/decks/land-base-matrix.tsx`

- Props: `analysis: LandBaseAnalysis`, `onInspect(cardId)`, `hasDetail(cardId)`,
  mirroring `PotentialPool`.
- **Header row:** a colour chip per column from `MANA_CHIP` (`C` already exists in
  it). `any` is a muted text chip. The collapsible title shows
  `Land base · {landCount} lands`.
- **Body:** group sub-headers (Mana / Tempo / Utility / Other), then one row per
  capability: a label with a `description` tooltip, a total, and one cell per
  column. Cells are buttons with `font-mono` counts. A zero renders as a muted `·`;
  a not-applicable cell as `–`.
- **Footer:** `Sources`, from `analysis.sources`, visually separated like the summary bar.
- **Drill-down:** one selected `{rowId, column}` at a time. Clicking toggles it, and
  the selected cell gets a ring. Under the table, the cell's cards appear in the same
  2/3-column grid as the requirements list. Clicking a name calls `onInspect`, which
  opens the existing `CardDetailModal`.
- `producesNothingIds.length > 0` shows a small warning line: "N lands produce no
  mana we can see". It lists them and hints that `sync:cards` may need re-running.
- **Collapsible:** reuse the pattern from the builder's collapsible card groups
  (commit `7ad38cd`). Open state persists per viewer in `localStorage`, with
  try/catch.
- Styling uses tokens only: `text-label` / `text-micro` / `text-body`, and
  `MANA_CHIP` / status tokens from `mtg-styles.ts`. No bare `text-[10px]` or colour
  literals. Any new map (e.g. group labels) goes in `mtg-styles.ts`.
- **Wiring in `deck-analysis-view.tsx`:**
  `const landBase = useMemo(() => analyzeLandBase(entries), [entries])`. Render it
  first inside the left scroll column, above `{/* Requirements */}`, with
  `onInspect={setSelectedCardId}`.

## Tests

- `apps/mtg/test/land-capabilities.test.ts` (node:test, offline): real oracle text
  and `producedMana` for about 20 fixture lands. Examples: Plains, Snow-Covered
  Forest, Wastes, Command Tower, Temple Garden, Overgrown Tomb, Glacial Fortress,
  Spirebluff Canal, Temple of Malady, Evolving Wilds, Windswept Heath, High Market,
  Treetop Village, Tranquil Thicket, Castle Vantress, Emeria's Call, Reliquary
  Tower, City of Brass. The test asserts each land's capability set and
  `landColours` for a given identity. Each regex bug fixed later adds a fixture.
- `apps/mtg/test/land-base.test.ts`: a dual counts in both columns but once in the
  row total; quantity weighting; the `maybe` slot and the commander are excluded;
  off-identity colours are dropped; the `any` column; `basic × any` absent; a
  colourless commander; the empty-`producedMana` oracle fallback.

## Verification (per step, recorded in the notes below)

- `pnpm turbo run typecheck`; ESLint on touched files;
  `pnpm --filter @mtg/deck-builder test`.
- Step 1: after `sync:cards`, spot-check `producedMana` in SQL for a dual, a fetch
  (expect `{}`), an MDFC and Command Tower.
- Step 5: a signed-in browser run on a 2-colour and a 4-/5-colour deck. The
  numbers should match a hand count; promoting a land from Potential should update
  the matrix instantly; a cell click should list its cards; a card click should
  open the modal.

## Out of scope / follow-ups

- Colour-source guidance, e.g. Karsten targets weighted by pip counts in the spells.
- Exposing capabilities as `CLASSIFIER` predicates so templates can set targets.
- Per-deck manual overrides for capabilities, like `DeckCardRole`.
- Non-land mana sources (rocks, dorks), and a "preview with Potential" toggle.
