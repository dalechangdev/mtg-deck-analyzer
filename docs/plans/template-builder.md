# Plan: template-driven builder

**Goal.** A second way to build a deck, alongside the existing builder. The user
picks a commander and an analysis template up front; the builder then walks the
template's requirements (Ramp 10, Card Advantage 12, …) and, for whichever one is
selected, shows cards from the pool that fill that role and fit the commander's
colour identity. One click adds a card to the main deck, and the requirement
counts update as the deck fills.

The existing `/decks/new` form and `/decks/[id]` builder are untouched — the new
flow is `/decks/start` → `/decks/[id]/build`, and a deck made either way opens in
both.

**Status.**

| Step | Scope | State |
|---|---|---|
| 1 | `fillsRole` over any card, not just deck entries (`ClassifiableCard`) | done (uncommitted) |
| 2 | `src/lib/template-candidates.ts` — pure filter + rank, with tests | done (uncommitted) |
| 3 | `src/lib/card-pool.ts` — cached commander-legal corpus, per-role match sets | done (uncommitted) |
| 4 | Candidates route; `POST /api/decks` takes `templateId` | done (uncommitted) |
| 5 | `/decks/start` — commander, then template | done (uncommitted) |
| 6 | `/decks/[id]/build` — requirements, candidates, deck list | done (uncommitted) |
| 7 | Signed-in browser check | done — create, add, move counts, identity pin, remove |

## Design decisions

**Candidates are classified in JS, not SQL.** Role matchers are mostly
`CLASSIFIER` predicates (`isManaRamp`, `isBoardClear`, …) — regexes over
`classifierText`, which strips reminder text and folds in face text. Translating
them to Postgres regex would fork the rules the analysis page scores by, so the
candidate list and the scorecard would disagree about what counts as ramp. Instead
the server keeps the commander-legal corpus (~32k cards, classification fields
only, no images) in a process cache and runs the same `fillsRole` over it.

- Loaded once per process, shared promise so concurrent first requests don't each
  load it, refreshed after an hour (a card sync is the only thing that changes it).
- Per-role match sets are memoised by the role's matcher list, not its id, so an
  edited custom role doesn't serve a stale set.
- Deck-level role overrides (`DeckCardRole`) are applied per request on top of the
  memoised set — they're per deck and must never leak into the shared cache.
- Only the page of results being returned is hydrated with images, the same split
  `/api/cards` uses.

**Ranking.** No popularity data exists locally, so order is: cards that also fill
*other* roles the deck is still short on (double duty), then owned, then mana
value, then name, with two corrections found against real data:

- Lands sort after spells for a non-land role (and real lands before spell // land
  flip cards for a land role). Otherwise 0-cost utility lands top every list.
- An open *land* gap doesn't count as double duty for a spell role. The `land`
  role's `TYPE_LINE: Land` matcher also hits flip cards' back faces, so while the
  mana base is empty every MDFC led the Ramp list.

Tried and rejected: owned → mana value first. It floods lists with 0-cost X spells
and Moxen. The ranking is still the weakest part — it favours oddities that trip
two classifiers (Insidious Fungus, Karn) over staples like Sol Ring. A real fix
needs a popularity signal (e.g. EDHREC rank) synced into `Card`.

**What's excluded.** Cards off the commander's colour identity, the commander
itself, and non-basic cards already in the main deck. Basics stay listed, since
adding one increments its quantity. Cards in Potential/Wishlist are shown and
flagged "In Potential", and their button moves the existing row to main (PATCH)
rather than POSTing, which would 409.

**Manual-only roles** (the built-in "Identity / Plan") can't be auto-matched. For
those the candidates list is a text search over the in-identity pool, and adding a
card also pins it into that role (`PUT /api/decks/[id]/roles/[cardId]/[roleId]`),
so the count moves.

**Authorization.** The candidates route is version-scoped and goes through
`requireVersionAccess`; the template comes from the deck's attachment via
`loadTemplate(…, userId)`, which already refuses another account's private
template. `POST /api/decks` checks template visibility the same way the attach
route does.

## Notes

- Measured against the local DB: pool load ~1.1s for 31,830 cards, all six
  baseline roles classified in ~250ms total, then ~16ms per request. Cold first
  request in dev was 6.1s including compilation.
- Classifier false positive seen in passing: "An Offer You Can't Refuse" reads as
  ramp (the Treasure goes to the opponent). Pre-existing, in `isManaRamp`.
- `CommanderPicker` was extracted from `new-deck-form.tsx`; both forms use it.
