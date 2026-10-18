# Plan: Saved commanders

**Goal.** Keep a per-account list of commanders I want to build around later,
each with an optional note ("voltron with equipment", "try Aristocrats"). From
the list, one click starts a deck with that commander already picked.

**Status.**

| Step | Scope | State |
|---|---|---|
| 1 | `SavedCommander` table + RLS + grant (`20261018120000_add_saved_commander`) | done (uncommitted) — applied local + hosted |
| 2 | `/api/commanders` (GET, POST) and `/api/commanders/[id]` (PATCH note, DELETE) | done (uncommitted) — `src/lib/saved-commanders.ts`, `src/lib/saved-commander-input.ts`, `test/saved-commander-input.test.ts` |
| 3 | "Save commander" toggle in `card-detail-modal.tsx` (only when `canBeCommander`) | done (uncommitted) — `src/components/commanders/save-commander-button.tsx`; signed out it falls back to the old badge |
| 4 | `/commanders` page: art, name, colour identity, editable note, Build, Remove; nav link | done (uncommitted) — `src/components/commanders/saved-commander-list.tsx`; note saves on blur |
| 5 | `/decks/start?commander=<cardId>` pre-fills `StartDeckForm` | done (uncommitted) — an id that isn't a legal commander is ignored |
| 6 | `CommanderPicker` shows saved commanders as quick picks before typing | done (uncommitted) — covers `/decks/new` and `/decks/start` |
| 7 | "Built as" deck links on `/commanders`, worked out when the page loads | done (uncommitted) — `loadSavedCommanders(…, { withDecks: true })` |
| 8 | Browser check | done 2026-10-18 — modal save toggle (survives reopening), /commanders art + pips + "Built as" link, note saved on blur and reloaded, Build pre-fills /decks/start, quick pick on /decks/new, Remove; API returns 400 for a non-commander or bad note and 404 for an unknown card or someone else's id. Test row removed from hosted |

## Design

**A table of its own, not the cart or a draft deck.** `ShoppingCartCard`
means "cards I want to buy", and putting commander ideas in it would muddy both
lists. An empty `Deck` would need a `DeckVersion`, show up in `/decks`, and
need special cases in analysis. `SavedCommander` has the same shape as the cart:
`(userId, cardId)` unique, plus a nullable `note`.

**`userId` is NOT NULL.** This is a new table, so there are no pre-auth rows
to keep, the same as `PriceSearch`. The FK into `auth.users` is written by hand
with `ON DELETE CASCADE`.

**Authorization.** The `"Own saved commanders"` policy has the same shape as
`"Own cart"`, and it protects the Data API only. The REST routes filter by
`requireUserIdOr401`, and someone else's row returns 404. POST rejects any card
that isn't `canBeCommander` and `isCommanderLegal`.

**"Built as" is computed, not stored.** On `/commanders`, decks are matched
when their current version has a `DeckCard` with `isCommander` and the same
`cardId`. The same commander can be built more than once, and deleting a deck
leaves nothing stale behind.

## Not now

- Partner / background pairs (a nullable `partnerCardId` later).
- Tags or status (idea / brewing / built). The note field is enough until the list gets long.
- A GraphQL field. The RLS policy already supports one.
