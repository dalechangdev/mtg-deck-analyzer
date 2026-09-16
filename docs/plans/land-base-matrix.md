# Plan: land base matrix

**Goal.** On the analysis page, a widget that breaks a Commander deck's lands down
along several dimensions at once: which of the commander's colours each land
produces, whether it is basic, and what else it does (enters tapped, sac outlet,
activated ability, fetch, MDFC, creature land, card draw, cycling).

**Status.**

| Step | Scope | State |
|---|---|---|
| 1 | `Card.producedMana` column, migration, sync + every Card writer, re-sync | done (applied locally, uncommitted) |
| 2 | `src/lib/land-capabilities.ts` detectors + fixture tests | done (`45818e4`) |
| 2b | `Card.layout` column + re-sync; transform cards aren't MDFCs or land drops | done (`5e4fb70`) |
| 3 | `analyzeLandBase` aggregation + tests; thread `producedMana` into `DeckEntry`; `landBase` on the analysis route | done (`18ec5b9`) |
| 4 | `LandBaseMatrix` component, wired into `deck-analysis-view.tsx` | done (uncommitted; not yet seen signed in) |
| 5 | Signed-in browser check against real decks | done (uncommitted) |

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
- **Transform DFCs** were indistinguishable from spell // land MDFCs without
  Scryfall's `layout` (Growing Rites of Itlimoc, Westvale Abbey, the Ixalan flip
  lands, the LCI Ojer gods): they passed `isLand` and the `mdfc` row. Resolved by
  step 2b below.
- Verified: `pnpm test` 61/61, `tsc` 0, ESLint clean on touched files.
  Committed as `45818e4`.

### Step 2b notes — `Card.layout`

- Decided after step 2 to fix transform cards rather than accept the limitation.
- `layout String?` on `Card`, **nullable on purpose**: `@default("normal")` would
  make an unsynced transform card look like a normal one; null means "unknown" and
  keeps the face heuristic. `layout: string` on `ScryfallCard`; `layout` in `base`
  in both Card writers (sync-cards, library import).
- Migration `20260915120000_add_card_layout`, hand-written and applied with
  `migrate deploy` like step 1's. No GRANT (table-level grants).
- `land-capabilities.ts`: `LandCard` gains `layout?: string | null`.
  `isLand` — for `transform` / `flip` / `meld` only the front face's type line
  counts (Westvale Abbey is a land, Growing Rites of Itlimoc isn't); otherwise any
  land face, as before. `mdfc` — false whenever `layout` is known and isn't
  `modal_dfc`; the face heuristic still applies to unsynced rows.
- Tests: Westvale Abbey (transform, land front: sac outlet, not MDFC) and Growing
  Rites of Itlimoc (transform, land back: not a land) added as fixtures, plus the
  null-layout fallback for both.
- Re-sync (`NODE_OPTIONS=--max-old-space-size=8192`): `Done. 107566 cards
  upserted, 10398 skipped`, no OOM. Every commander-legal land has a layout.
- **Corpus after layout:** 1,162 lands (was 1,194). The 32 dropped are all
  `transform` cards whose land is the back face — Growing Rites of Itlimoc, the
  Ixalan flip lands, the LCI Ojer gods, Treasure Map, Legion's Landing…
  `mdfc` 90 → 50, every one a real spell // land modal DFC (Land // Land pathways
  stay out). The other rows lost only those same transform cards: sac-outlet
  34 → 30, draw 69 → 60, any-colour 144 → 132, fetch 55 → 54, creature-land
  50 → 49, activated 505 → 481. Layouts among lands: normal 1,090, modal_dfc 60,
  adventure 5, transform 4 (land fronts, e.g. Westvale Abbey), meld 2, saga 1.

### Step 3 notes

- `src/lib/land-base.ts` — `analyzeLandBase(entries: DeckEntry[])`, pure, shapes as
  designed below with one change: **`LandBaseRow.total` is a `LandBaseCell`**
  (count + cardIds), not a number, so step 4 can make a row total clickable like a
  cell.
- Identity = union of every `isCommander` entry's identity (partners and
  backgrounds), in WUBRG order; with no commander, the counted lands' identities.
  Counts `slot === "main"`, not the commander, `isLand` only, weighted by quantity.
  Not-applicable cells live in one `NOT_APPLICABLE` map (only `basic × any`).
- `producesNothingIds` judges colours against all five, not the identity, so an
  off-colour land isn't reported as producing nothing. `isFetch` is now exported
  from `land-capabilities.ts` for it (the `fetch` row uses it too).
- Plumbing: `CardData` gains optional `producedMana` / `layout`, so `LandCard` is now
  just an alias of `CardData`. `DeckCardRow.card` gains them optionally and
  `toDeckEntry` passes them through when present — every loader built on
  `include` gets them; a `select` that omits them still typechecks.
  `loadDeckCards` needed no change.
- `GET /api/decks/[id]/analysis` returns `landBase` alongside `analysis` and
  `cards`, from the entries it already loads — no extra query, same
  `requireDeckAccess` → `resolveVersionId` path. Independent of `templateId` and
  `includeCommander`.
- Tests: `test/land-base.test.ts`, 12 cases over the fixture lands (dual counted in
  both columns but once in its total, quantity weighting, maybe/wishlist/commander/
  non-land excluded, transform land-back excluded, off-identity dropped, `basic ×
  any` absent, colourless commander, no-commander identity, oracle fallback,
  produces-nothing, row order at zero).
- **Real decks** (script over every local deck's current version, not committed):
  every loaded entry carried both fields. Initial Dina (BG, 36 lands): sources B 26,
  G 25, C 5, any 17. Rick Roll (UBR, 35): U 15, B 20, R 15. Limitless Ashling
  (WUBRG, 40): W 14, U 16, B 14, R 16, G 26; produces nothing: Ancient Ziggurat
  (restricted mana only) — as expected.
- **For step 4:** in a two-colour deck the `multi` and `any-colour` rows are
  always identical (17 / 17 in Initial Dina) — "covers the identity" and "makes 2+
  of its colours" coincide. Consider hiding `any-colour` when `identity.length <= 2`.
- **Dev server port:** port 3000 is occupied by a different app (`next-server
  v14.2.35`, cdr-fyi). This deck builder's dev server was already running on
  **:3002** (a second `next dev` refuses to start while it runs). Checked there in
  step 4: the route answers 401 `{"error":"Not signed in"}` unauthenticated. The
  signed-in response is step 5.
- Verified: `pnpm test` 76/76, `tsc` 0, ESLint clean on touched files.

### Step 4 notes

- `src/components/decks/land-base-matrix.tsx` — `LandBaseMatrix({ analysis,
  cardsById, onInspect, hasDetail })`. Wired into `deck-analysis-view.tsx` as the
  first thing in the left scroll column, above the requirements list:
  `useMemo(() => analyzeLandBase(entries), [entries])`, so promoting or cutting a
  land recounts instantly; `onInspect` reuses the page's `CardDetailModal`.
- **Header** copies `CardGroup` in `deck-panel.tsx` (commit `7ad38cd`): the whole
  `SectionHeader` band is the toggle, `▸` chevron, `aria-expanded`. Title reads
  `Land base (N)`, matching the builder's group headers rather than the
  `Land base · N lands` sketched above.
- **Collapsed state** in `localStorage` (`land-base-matrix:collapsed`), read via
  `useSyncExternalStore` with a server snapshot of "expanded", so SSR and hydration
  agree; a module-level fallback keeps the toggle working when storage throws.
- **Table:** a real `<table>` in an `overflow-x-auto` wrapper. Columns: label, Total,
  then `analysis.columns` as `MANA_CHIP` circles (`C` included) and a muted `any`
  pill, each with an `sr-only` name. Group sub-headings (`LAND_GROUP_LABEL`, added
  to `mtg-styles.ts` with a type-only import of `CapabilityGroup`). Counts are
  buttons: `·` and disabled at zero, `–` (not a button) when not applicable,
  `aria-pressed` + info ring when selected. Row totals and footer sources are
  clickable too; the footer's Total shows the land count.
- **Drill-down:** one selection at a time, toggled by clicking again or `×`. It is
  re-resolved against the current analysis each render, so a slot move that empties
  the cell just closes it. Names in the same 2/3-column grid as the requirements
  list, `×N` for multiple copies, type line as the tooltip, disabled without card
  details.
- **Hidden rows** (decided here, from the step 3 finding): `multi` when the
  identity has fewer than 2 colors (it can't be non-zero), `any-colour` when it has
  exactly 2 (it repeats `multi`). Data is unchanged — `analyzeLandBase` still
  returns every row; only the component filters.
- `producesNothingIds` renders as one `text-warning` line naming the lands, with a
  tooltip pointing at re-syncing card data.
- **Spelling:** the app's UI says "color" ("Color identity:", "Colorless"), so the
  two visible capability labels/descriptions became "Taps 2+ colors" / "Any color".
  Ids (`any-colour`) are unchanged.
- Verified: `tsc` 0, ESLint clean on touched files, `pnpm test` 76/76. On the
  running :3002 dev server, the analysis page for Initial Dina answers 307 → `/login`
  and the route 401 unauthenticated — both modules compile with no errors logged.
  **Not yet seen rendered signed in** — that is step 5.

### Step 5 notes

- **The environment moved mid-step.** The app now runs against the **hosted** Supabase
  project for both auth and data: `.env` was repointed, the 19 migrations were applied
  there, the card corpus was restored with `COPY` (31,913 cards / 31,913 printings /
  1,652 faces, 14s — a `sync:cards` over the pooler measured 4.4 cards/sec ≈ 6.7h),
  and the personal tables were copied with ownership remapped to the cloud account.
  The six migration-seeded tables (CardRole, CardTheme, RoleMatcher, DeckTheme,
  AnalysisTemplate, TemplateRequirement) were excluded from the copy — their
  fingerprints are byte-identical on both sides, so every id the deck data references
  already existed. Local stack and dumps kept as a fallback in `/Users/dalec/mtg-backups/`.
- **Verified signed in, Initial Dina (BG, cloud data):**
  - Header `LAND BASE (36)`; columns B, G, C, any; the `any-colour` **row** correctly
    hidden at 2 colours while the `any` column stays.
  - Basic 16 (B 8, G 8, C `·`, any `–`) — `basic × any` renders "–" as designed.
  - Sources 36 | B 26 | G 25 | C 5 | any 17, matching an independent SQL count
    (B 24 + 2 fetches, G 23 + 2 fetches, C 5).
  - Enters tapped 6 + Conditionally tapped 4 = 10, matching SQL's "enters tapped" 10.
    Fetch 2, Sac outlet 2 (colourless only), Draws 1, Cycling 1, MDFC/creature-land `·`.
  - **Cell drill-down:** clicking `Sac outlet × Colorless` (2) selected the cell and
    listed Grim Backwoods and High Market — exactly the deck's two sacrifice-outlet
    lands per SQL, both `producedMana {C}`.
  - **Card modal** opened from the drill-down (High Market) with image, oracle text and
    the role toggles.
  - **Collapse persisted across a reload** (localStorage); page rendered 200 server-side
    with no errors in the dev log.
- **Verified signed in, Limitless Ashling (WUBRG, cloud data):**
  - Columns W U B R G C any, and the `any-colour` **row** now present (9) — the
    identity-based hiding works in both directions.
  - Sources 40 | W 14 | U 16 | B 14 | R 16 | G 26 | C 5 | any 9, matching the SQL
    cross-check exactly. Basic 16 (2/2/2/2/8). Enters tapped 14 + Conditionally
    tapped 3 = 17, matching SQL's 17. Fetch 0, Sac outlet 0, MDFC 0, Creature land 1,
    Cycling 1, Activated ability 3.
  - Warning line: "1 land makes no mana that counts toward a color: Ancient Ziggurat"
    — the restricted-mana rule reaching the UI.
  - **A crude SQL check disagreed and the app was right:** the query counted Draws
    cards 1, the UI 0. The only candidate is the cycling land's reminder text
    ("Discard this card: Draw a card"), which `classifierText` strips by design.
- **Promote test passed.** Promoting Flooded Strand from Potential moved every number at
  once: header 40 → 41, Fetch 0 → 1 (W 1 / U 1 — it fetches Plains or Island), sources
  W 14 → 15 and U 16 → 17 with B/R/G unchanged, Non-basic 24 → 25, Taps 2+ 18 → 19,
  Activated ability 3 → 4, Potential 16 → 15, deck 97 → 98, and the template's Land row
  40/38 → 41/38. Confirmed in the database too (`slot main`, 41 main lands), so the
  recount follows a real persisted change, not just local state. **Reverted afterwards**
  (`DeckCard.slot` back to `maybe`) to leave the deck as found.
- Tooling note: the Chrome extension intermittently answered "Couldn't determine which
  page this action targets" / "Chrome blocked the extension" on this tab — recovered by
  re-reading tab context and re-navigating. The `find` tool was rate-limited for part of
  the session, so element clicks were done by coordinate from fresh screenshots (the
  viewport size changed between shots, so cached coordinates are not reusable).
- Unrelated observation: `GET /api/cards/<id>/price` answers 404 after ~15s (the Ítaca
  lookup). Pre-existing, nothing to do with this feature.

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

Written up with sketches and effort in **`docs/ideas/land-base-follow-ups.md`** — keep
the detail there, not here.

- Colour-source guidance, e.g. Karsten targets weighted by pip counts in the spells.
- Exposing capabilities as `CLASSIFIER` predicates so templates can set targets.
- Per-deck manual overrides for capabilities, like `DeckCardRole`.
- Previewing the Potential pile as a delta on each count (the cheapest of these).
- Non-land mana sources (rocks, dorks), as a separate row group rather than merged totals.
- Operational: the `sync:cards` OOM, and `migrate dev` needing a shadow DB with `auth`.
