# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Run from the repo root; `pnpm` is the package manager (workspaces + Turborepo).

```bash
pnpm install
pnpm turbo run typecheck            # or build / lint / dev — turbo.json tasks
pnpm --filter @mtg/itaca test       # node:test via tsx; the only test suite
pnpm --filter @mtg/itaca exec tsx --test test/parse-listing.test.ts   # single file
pnpm --filter @mtg/deck-builder dev # :3000
pnpm --filter @mtg/restock dev      # :3001
```

There is **no `test` task in `turbo.json`** — `pnpm turbo run test` runs nothing. Tests
live only in `packages/itaca/test` and parse gzipped HTML fixtures offline.

Deck builder database (Prisma owns it, see below):

```bash
cd apps/mtg && supabase start                 # local Postgres + Auth on :54321
pnpm --filter @mtg/deck-builder db:migrate    # prisma migrate dev
pnpm --filter @mtg/deck-builder sync:cards    # stream Scryfall bulk data into Card/CardPrinting
```

Restock SaaS + crawler (Supabase CLI owns the schema):

```bash
cd apps/restock && supabase start && supabase db reset
pnpm --filter @mtg/restock db:types           # regenerate database.types.ts after a migration
pnpm --filter @mtg/crawler seed && pnpm --filter @mtg/crawler start
```

## Layout

Two apps that share one scraping core. There is no deployment config in the repo.

- `apps/mtg` — `@mtg/deck-builder`, Next 16 Commander deck builder. Prisma + Supabase Auth.
- `apps/restock` — `@mtg/restock`, Next 16 restock-alert SaaS. Supabase client only; barely built out.
- `apps/crawler` — `@mtg/crawler`, tsx worker loop. Claims work, fetches through an adapter, persists.
- `packages/store-core` — `StoreAdapter` contract, rate limiting, HTTP, normalisation.
- `packages/itaca` — Ítaca adapter, complete and tested. `packages/metropolis` — scaffolded, parser pending.
- `docs/DATA-MODEL.md`, `docs/RATE_LIMITING.md` — the reasoning behind the restock schema and crawl budgets.
- `docs/plans/` — one Markdown file per multi-step feature: the design decision, the steps, and a
  status table. Write the plan there before starting, keep the status table current as steps land,
  and read the relevant plan before resuming work on a feature. Active: `deck-versions.md`.

## Architecture invariants

**The two apps have separate databases and opposite migration authority.** In
`apps/mtg`, Prisma is the source of truth — 14 migrations predate the move to
Supabase, including hand-written RLS SQL, and `[db.migrations] enabled = false`
in `supabase/config.toml` keeps the CLI out. Never run `supabase db reset` there;
use `pnpm prisma migrate reset`. In `apps/restock`, the Supabase CLI owns
`supabase/migrations/*.sql` and Prisma is absent.

**Authorization in `apps/mtg` is two disjoint layers, not defence in depth.**
Prisma connects as a privileged role that RLS does not constrain, so RLS protects
only the Data API (anon key, browser) and application code protects only Prisma.
Every Prisma query over user-owned data must filter by the id from
`src/lib/auth.ts` (`requireUserId` / `requireUserIdOr401`), and every deck- or
template-scoped Route Handler goes through `src/lib/ownership.ts` first. A missing
filter silently reads every account's rows. Someone else's row answers 404, not 403.

**Only `store-core` calls `fetch`.** Parsers get strings, never network access, so
robots policy, per-host crawl delay and backoff cannot be bypassed by a caller.

**Pacing is per host, never global.** Ítaca publishes `Crawl-delay: 5`; Metrópolis
publishes none and serves ~3.3MB pages, so its 60s floor is derived from byte
equivalence. Each adapter gets its own limiter in `apps/crawler/src/adapters.ts`;
in the deck builder, `src/lib/itaca-client.ts` is a process singleton for the same
reason. The crawler additionally enforces a shared budget in the database
(`SupabaseRateLimiter`, `claim_crawl_target` with `FOR UPDATE SKIP LOCKED`), so
multiple workers are safe.

**`cursor` is opaque to everything but the adapter that minted it.** The scheduler
stores a string; Ítaca encodes `{setSlug}:{offset}`. This is what lets one
`crawl_targets` table drive stores whose pagination has nothing in common — adding
a store is a new package plus a `stores` row, with no schema or scheduler change.

**`quantity` is nullable and must stay that way.** Some stores publish exact counts,
some only availability. Null means "in stock, count unknown" — never coerce to 0 or 1.
Money is integer cents everywhere, parsed at the edge.

**Card search bypasses the Prisma query builder.** `src/lib/card-search-sql.ts`
builds the WHERE/ORDER BY of a raw id query (array containment for colours, numeric
casts of text `power`/`toughness`, rarity rank from a relation), then hydrates that
page of ids through `prisma.card.findMany`. User values are bound parameters; only
the fixed maps in that file reach `Prisma.raw`.

## Conventions

- **Internal imports are extensionless.** Turbopack will not resolve `./x.js` to `./x.ts`,
  even though `tsc` with `moduleResolution: bundler` accepts it.
- Workspace packages ship raw TypeScript with no build step; each Next app that consumes
  one lists it in `transpilePackages`.
- **Next 16**: Turbopack by default, `middleware` is now `proxy` (`apps/restock/src/proxy.ts`),
  `revalidateTag` takes a `cacheLife`. Read `node_modules/next/dist/docs/` before writing app code.
- The Prisma client is generated into `apps/mtg/src/generated/prisma` — import from
  `@/generated/prisma/client`, not `@prisma/client`.
- UI values live in the token layer in `apps/mtg/src/app/globals.css` (type scale, `--mana-*`,
  `--rarity-*`) and the domain maps in `src/lib/mtg-styles.ts`. Don't reintroduce bare
  `text-[10px]` or per-component colour literals — those maps exist because five components
  had already drifted apart.
- The deck builder never holds the Supabase service-role key; the crawler is the only
  component with a reason to.

## Before deploying the restock SaaS

`robots.txt` is not the binding constraint. Ítaca's Terms forbid commercial use and
republishing their catalog without express authorisation, and Metrópolis's Terms have
not been reviewed. Everything here is safe to build and run against a local database —
the open question is operating it commercially. See the README's Terms of Service section.
