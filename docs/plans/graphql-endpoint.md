# Plan: a GraphQL endpoint for the deck builder

**Goal.** One GraphQL endpoint at `/api/graphql`, serving the Next client, with a
schema designed around cards, decks and versions. Typed end-to-end (schema types
generated into the client, no hand-written response shapes). N+1 solved
explicitly. Row Level Security stays the authorisation boundary. REST is not
replaced — the two run side by side. No subscriptions.

**Status.**

| Step | Scope | State |
|---|---|---|
| 0 | Survey: what RLS actually constrains here, and whether pg_graphql is on | done (findings below) |
| 1 | Dependencies: `graphql` 16, `graphql-yoga` 5, `@pothos/core` 4, `dataloader` 2 | done |
| 2 | `src/lib/graphql/rls.ts` — the RLS-scoped, fail-closed request transaction | done |
| 3 | `src/lib/graphql/loaders.ts` — per-request DataLoaders | done |
| 4 | `builder.ts` + `card.ts` + `deck.ts` — the Pothos schema | done |
| 5 | `src/app/api/graphql/route.ts` — the Yoga handler | done |
| 6 | SDL emit + `@graphql-codegen` client preset → typed documents | done |
| 7 | Tests (`apps/mtg/test/graphql-*.test.ts`) | done — 16 tests |
| 8 | Live verification against the local database | done — results below |
| 9 | pg_graphql baseline comparison, written up | done — below |
| 10 | Migrate a client component off REST onto `graphqlRequest` | **not started, deliberate** |

Step 10 is where this stops short of "finished". `src/lib/graphql/client.ts` and the
documents in `documents.ts` are typed and exercised by codegen, but no component
sends one yet — every page still fetches REST exactly as before. That is the safe
half of "do not replace REST": the endpoint is additive and nothing depends on it,
so migrating a view is a separate change that can be judged on its own.

---

## Step 0 — what the survey found

Three findings changed the design. All were checked against the local database
(`supabase start`, port 54322), not assumed.

### 0.1 "RLS is already the auth boundary" is not true of this app *yet*

The brief assumed authorisation already lives in the database and a GraphQL
layer only has to avoid bypassing it. In `apps/mtg` that is half true, and the
half that is false is the important one.

`prisma/migrations/20260910120000_add_ownership_and_rls` spells it out: Prisma
connects as a privileged role that RLS does not constrain, so the policies guard
only the Data API (anon key, browser). **Every read the app itself performs goes
through Prisma and is authorised by application code** — `requireUserId` in
`src/lib/auth.ts` and the gates in `src/lib/ownership.ts`. RLS today protects a
surface the app does not use.

So "keep RLS as the boundary" is not a matter of *not breaking* something that
already holds. For the app's own read path it has to be *made* to hold. That is
what step 2 builds, and it makes GraphQL the first part of this app where RLS is
load-bearing.

The alternative — resolvers over the privileged Prisma singleton, gated by
`ownership.ts` like the REST handlers — was rejected because it is exactly the
duplication the brief rules out. It is recorded here because it is the cheaper
option and a future maintainer will wonder why it wasn't taken.

### 0.2 The mechanism works: `SET LOCAL ROLE` + `request.jwt.claims`

`auth.uid()` on this database reads a GUC, not a connection property:

```sql
select coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid
```

and `postgres` is a member of `authenticated` and `anon` (`pg_auth_members`), so
a privileged connection can downgrade itself for the length of a transaction.
Verified directly:

```
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"70c7bdb1-…","role":"authenticated"}', true);
SELECT auth.uid(), count(*) FROM "Deck";   -- 70c7bdb1-…  |  4
SELECT count(*) FROM "DeckCard";           -- 423
ROLLBACK;
SELECT count(*) FROM "Deck";               -- 7   (privileged, unfiltered)
```

7 → 4 is RLS biting on a connection that could otherwise see everything. That is
the whole design in three statements.

`SET LOCAL` unwinds at COMMIT or ROLLBACK, so the connection returns to the pool
privileged and unpolluted; and because both settings are transaction-local, this
is safe through Supavisor's transaction pooler, where a session-level `SET` would
not be.

**The failure direction is the design's one real hazard.** If the role change
were ever skipped, queries would run privileged and RLS would be silently absent
— a fail-*open* leak with no error. Step 2 therefore asserts `auth.uid()` inside
the transaction and aborts if it does not match the identity the request
authenticated as.

The second hazard is a resolver importing the module-level `prisma` singleton
instead of taking the transaction from context. That query would be privileged
and unfiltered. Convention alone will not hold this; step 7 adds a test that
fails if a resolver reaches the database any way but through context.

### 0.3 pg_graphql is already enabled, and it already does the hard part

No enabling work is needed — `pg_graphql 1.5.11` is installed and
`graphql_public` is already in `config.toml`'s exposed schemas. It answers at
`http://127.0.0.1:54321/graphql/v1` today.

Two things worth having measured before writing a line of Pothos:

- **It enforces RLS correctly.** As anon, `deckCollection` returns `[]` while
  `cardCollection` returns cards. With a signed `authenticated` JWT it returns
  exactly the 4 decks that user owns.
- **It has no N+1 to solve.** A three-level nested query (decks → versions →
  cards → card) compiled to **one** top-level SQL statement returning one row
  (`pg_stat_statements`, after a reset). It reflects the schema per role, too:
  `deckVersionCollection` and `gameLogCollection` are absent from the anon schema
  and present in the authenticated one, because `DeckVersion`/`GameLog` carry
  grants only for `authenticated`.

What it cannot do is the reason a hand-written schema is still worth building:
its types are the *tables*. The deck builder's useful shapes are not tables —
`DeckEntry` folds the newest printing and first face into one `imageUrl`,
`CardDetail` flattens printings and faces, `VersionSummary` carries a computed
`mainCount` and win/loss record, and the analysis is computed per request and
never stored. Expressing those through `pg_graphql` means the client reassembling
them, which is the hand-written response shape the brief wants gone.

So the two coexist with different jobs, and step 9 writes that up rather than
picking a winner.

## Design

### One endpoint, two roles per request

`POST /api/graphql` runs GraphQL Yoga with a Pothos code-first schema inside a
Route Handler. Per request:

1. `getUserId()` (`src/lib/auth.ts`) verifies the Supabase JWT signature via
   `getClaims()`. Unchanged, and reused rather than re-implemented.
2. A transaction opens and downgrades itself to `authenticated` with those
   verified claims — or to `anon` when signed out, which still reads the public
   card catalogue, so the card browser keeps working signed out exactly as it
   does now.
3. Resolvers and DataLoaders share that one transaction through context.
4. The transaction closes with the response; role and claims unwind with it.

Identity comes from the *verified* claims, never from the raw cookie.

### N+1, explicitly

Per-request DataLoaders, constructed in the Yoga context factory — per request,
not per process, as serverless requires, and as a module-level cache would get
wrong by serving one user's rows to the next.

The batches the deck schema actually needs: card by id, printings by card id,
faces by card id, versions by deck id, cards by version id, library quantity by
(card id, viewer). Each is one `IN (…)` query per tick.

`@pothos/plugin-prisma` was the alternative — it merges relation selections into
the parent query automatically. Rejected for two reasons: the brief asks for N+1
solved *explicitly*, and its automatic merging is harder to reason about inside a
hand-managed RLS transaction. DataLoader batching is visible in the code and
testable without a database.

### Typed end-to-end

Pothos infers the SDL from the resolvers, a script prints it to
`apps/mtg/graphql/schema.graphql`, and `@graphql-codegen` with the client preset
generates typed documents into `src/generated/graphql/`. The client writes
`graphql(...)` documents and gets result types inferred; nothing hand-written,
and the SDL file makes schema changes show up in review as a diff.

### What GraphQL does not get

Mutations for the destructive paths stay in REST for now. The versioning writes
in particular (branch, promote, delete) are transactional and already gated; a
second entry point to them is risk without a reader asking for it. GraphQL ships
read-first plus the smallest useful write surface, and the plan says so out loud
rather than leaving it looking unfinished.

## Verification

- `pnpm turbo run typecheck`; ESLint on touched files;
  `pnpm --filter @mtg/deck-builder test`.
- Step 8, against the local database with a minted `authenticated` JWT:
  - the same query as two different users returns each one's decks and no others;
  - a deck id belonging to another account resolves null, not an error that
    confirms the id exists (the 404-not-403 rule the REST gates follow);
  - signed out: cards resolve, decks are empty;
  - `pg_stat_statements` shows the loader count flat as the result set grows —
    the N+1 claim measured, not asserted.
- Step 9: the same logical query through Pothos and through pg_graphql, with the
  statement counts and the response shapes side by side.

## Results

All of this ran against the **local** database (`supabase start`, port 54322),
which is not what `apps/mtg/.env` points at — that file names a hosted Supabase
project. Nothing here touched it, and `verify:graphql` refuses to run against a
DATABASE_URL that is not local, so it cannot be pointed there by accident.

### The boundary holds (`pnpm --filter @mtg/deck-builder verify:graphql`)

The script runs the real schema against real rows as three callers. Every check
passed:

| Check | Result |
|---|---|
| signed out sees no decks | 0 |
| signed out still reads the public catalogue | 2 cards |
| dale sees only his own decks | 4 |
| bob sees only his own deck | `["Bob Landfall"]` |
| their decks do not overlap | true |
| dale asking for bob's deck by id | `null` |
| …with no error that would confirm the id exists | no `errors` key |
| dale renaming bob's deck | `null`, and the row is unchanged |
| bob renaming his own deck | succeeds |

Not one of those outcomes is produced by a line of resolver code. `renameDeck`
runs the same `updateMany` in both directions; it matches one row for the owner
and zero for anyone else because the "Own decks" policy has a USING clause.

### N+1

Measured with `pg_stat_statements`, counting only statements that touch the
app's tables:

| Query | Deck cards returned | Statements |
|---|---|---|
| `{ decks { id name } }` | — | 1 |
| `{ decks { versions { cards { card { name imageUrl } } } } }` | 423 | 8 |

Eight is the depth of the query, not a function of the 423 rows: decks,
versions, deck cards, cards, printings, faces, and the two grouped aggregates
behind `mainCount` and `record`. Without the loaders the same query is in the
high hundreds. The unit test (`test/graphql-loaders.test.ts`) pins the property
without a database by counting calls against a stub.

### pg_graphql, side by side

Already enabled — `pg_graphql 1.5.11`, answering at `/graphql/v1`. Nothing was
installed or configured for this comparison.

| | pg_graphql | this endpoint |
|---|---|---|
| Nested query cost | 1 statement (compiles the whole tree to one SQL query) | 8 |
| Auth | RLS | RLS |
| Types | mirror the tables | the shapes the app actually uses |
| Schema per role | yes — `deckVersionCollection` is absent for `anon` | no |
| Cost to build | zero | this plan |

pg_graphql wins on raw efficiency and loses on shape, and the shape is the
reason to have written this. Its `Deck` is the `Deck` table, so `imageUrl`
(newest printing's art, else the first face), `mainCount` (a grouped sum over
main-slot quantities) and `record` (game results folded four ways) are not
fields it can offer — the client would fetch printings and faces and re-derive
them, which is the hand-written response shape the brief set out to remove.

Worth knowing for later: pg_graphql reflects per role, so its schema is not a
fixed artefact. `deckVersionCollection` and `gameLogCollection` are missing from
the anon schema and present in the authenticated one, because `DeckVersion` and
`GameLog` carry grants only for `authenticated`. A client generating types off
an anon introspection would silently get a smaller API than it has.

### Generated artefacts

Both are committed, deliberately:

- `apps/mtg/graphql/schema.graphql` — what codegen reads, and what makes a schema
  change reviewable as a diff. `test/graphql-schema.test.ts` fails if it drifts
  from the builder.
- `apps/mtg/src/generated/graphql/` — the client types. Note this is *not* covered
  by the `.gitignore` entry for `src/generated/prisma`, and that asymmetry is the
  point: the Prisma client is regenerated by `prisma generate` on install, while
  nothing regenerates these, so a fresh clone would not typecheck without them.

One trap, recorded because it cost a cycle: `documentMode` belongs in the `config`
block, not `presetConfig`. The preset reads `options.config.documentMode` and
ignores a misplaced one silently rather than erroring, so the only symptom is
documents emitted as parsed `DocumentNode`s — which work, but pull graphql-js into
the browser bundle for no reason.

## Out of scope / follow-ups

- Subscriptions. Polling is adequate and Route Handlers are the wrong host.
- Persisted queries / APQ, and disabling introspection in production.
- Depth and complexity limits. A public GraphQL endpoint wants both before it is
  exposed beyond this app; noted here so it is a decision rather than an omission.
- Migrating REST clients. The REST handlers keep their contract.
- Whether the dedicated `prisma` role on the hosted project is a member of
  `authenticated`. It is on the local database; `.env.example` describes a
  dedicated role upstream whose grants have not been checked from here.
