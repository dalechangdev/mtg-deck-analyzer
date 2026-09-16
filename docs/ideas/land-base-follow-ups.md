# Ideas: where the land base matrix could go next

Follow-ups deliberately left out of `docs/plans/land-base-matrix.md`, which shipped the
matrix itself (steps 1–5, commits `e21db2a`…`1175a9a`). Nothing here is committed to —
these are sketches to argue with later, not a queue. Each one says what it adds, how it
would be built against the code as it stands, and where the awkwardness is.

Shared context: `src/lib/land-capabilities.ts` holds the detectors (pure, fed by
`Card.producedMana` and `Card.layout`), `src/lib/land-base.ts` does the counting, and
`src/components/decks/land-base-matrix.tsx` renders it above the requirements list on
the analysis page.

---

## 1. Colour-source guidance (Karsten targets)

**What it adds.** A target beside each colour count, so the table judges the mana base
instead of only describing it: "B 26 sources, 18 needed" rather than "B 26".

**Sketch.** Count coloured pips across the deck's non-land main cards — `manaCost` is
already on every `DeckEntry`, so no schema change — and note the cheapest card demanding
each colour. Look the pair up in a table derived from Frank Karsten's work: roughly, a
`{G}` you want on turn 2 needs ~18 sources in a 99-card deck, `{G}{G}` needs ~23. Render
as a row under `Sources`, or a second line in each column header, tinted with
`REQUIREMENT_STATUS_STYLE` so a short colour reads the same amber as an unmet template
requirement.

**Awkwardness.** Hybrid, Phyrexian and X costs all need deliberate handling, and double
pips (`{G}{G}`) are a different target from two separate `{G}` cards. The numbers are
probabilistic guidance, so this must advise and never block. Note it would also make the
`any-colour` row meaningful again in two-colour decks, where the component currently
hides it as a duplicate of `multi`.

**Effort.** Medium. A pip parser and a lookup table, both pure and unit-testable the way
`land-base.ts` is; the UI is one row.

---

## 2. Capabilities as template classifiers

**What it adds.** Templates could set targets on land capabilities the way they already
do on roles: "at least 2 sac outlets", "no more than 6 enters-tapped lands".

**Sketch.** Register functions in the `CLASSIFIERS` map in `src/lib/deck-template.ts`
(today: `isManaRamp`, `isBoardClear`, `isCardAdvantage`, `isTargetedDisruption`), then
seed `CardRole` rows with `RoleMatcher` rows of kind `CLASSIFIER` naming them. Data-only
migration — no schema change.

**Awkwardness.** A classifier is `(card) => boolean`; a capability test is
`(land, colours) => boolean`. The deck-independent rows port cleanly — fetch, sac outlet,
enters tapped, creature land, cycling, MDFC — but `multi` and `any-colour` depend on the
commander's identity and can't be expressed without a deck context. Either those two stay
matrix-only, or the classifier signature grows that context.

**Effort.** Small to medium, and it folds the land base into the scorecard rather than
leaving it a separate widget.

---

## 3. Per-deck manual overrides

**What it adds.** An escape hatch when detection is wrong, or when you simply disagree:
mark a land as a sac outlet for this deck, or exclude one that technically matches.

**Sketch.** Mirror `DeckCardRole`: a `DeckCardCapability` table (`deckId`, `cardId`,
`capabilityId`, `assignment INCLUDED|EXCLUDED`, unique on the triple), a `PUT`/`DELETE`
route shaped like `/api/decks/[id]/roles/[cardId]/[roleId]`, and application of the
overrides inside `analyzeLandBase` before each `capability.test`. The UI idiom already
exists — the card modal's role toggles.

**Why it earns its place.** The corpus scan over all 1,194 commander-legal lands turned
up genuine edge cases: choose-a-basic-type lands with no `produced_mana` (Thran Portal,
Multiversal Passage), restricted "spend this mana only" abilities, Mount Doom naming
itself inside its own cost. Those are handled, but the next oddity ships without a fix,
and this is the way around it that doesn't need a release.

**Effort.** Medium — migration, an RLS grant (see the grants note in
`docs/plans/land-base-matrix.md`), a route, and the toggles.

---

## 4. Preview the Potential pile

**What it adds.** See what promoting would do before doing it: "26 → 28" beside each
count.

**Sketch.** Run `analyzeLandBase` twice — once over the main deck, once over main plus
`slot === "maybe"` — and render the delta. A second `useMemo` in
`deck-analysis-view.tsx` plus delta formatting in the component. No schema, no new data,
no API change.

**Effort.** Small. The cheapest useful thing on this list, which is why it's the one I'd
do first.

---

## 5. Non-land mana sources

**What it adds.** Rocks, dorks and rituals plainly affect colour availability, and
`producedMana` is stored for *every* card, not only lands — the data is already there.

**Awkwardness, and why it wasn't in scope.** They aren't lands: a dork dies to a board
wipe, a ritual is one-shot, and folding them into "Sources of G" would overstate the mana
base in a way the matrix currently can't misreport. It also overlaps the Ramp role, and
`isManaRamp` deliberately excludes lands so the two counts don't collide. The shape I'd
try is a separate row group — "Other sources" — that never adds into the land totals, so
the reader does the combining rather than the code pretending to.

**Effort.** Medium, and mostly a design decision rather than a coding one.

---

## Operational follow-ups

Not features — things this work ran into that are still true.

- **`sync:cards` runs out of memory** without `NODE_OPTIONS=--max-old-space-size=8192`;
  it died at 97,600 of ~107k cards. Something in the stream-and-batch loop retains.
  Worth a look before the next corpus refresh.
- **`prisma migrate dev` is unusable in `apps/mtg`** — its shadow database has no
  Supabase `auth` schema, so `20260910120000_add_ownership_and_rls` fails to replay, and
  `migrate diff` refuses the cross-schema FKs to `auth.users`. Every migration here is
  hand-written and applied with `migrate deploy`. Configuring a shadow database that has
  the `auth` schema would restore the normal workflow.
- **`GET /api/cards/<id>/price` answers 404 after ~15s** through the Ítaca lookup, which
  makes the card modal feel slow. Predates this work.
- **Local and cloud have diverged.** The hosted Supabase project is now what `.env`
  points at, for both auth and data; the local stack still holds the old rows including
  the Alice/Bob seed accounts. Worth deciding which is authoritative before they drift
  further. Backups from the move are in `/Users/dalec/mtg-backups/`.

---

## If picking one

**Potential preview** (small, immediately useful), then **overrides** (unblocks every
future disagreement with the detectors), then **Karsten guidance** (the biggest
analytical payoff and the most design work), with **classifiers** and **non-land
sources** after. The `sync:cards` memory fix pairs naturally with whenever the corpus
next needs refreshing.
