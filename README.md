# mtg — Turborepo monorepo

A Commander deck builder and a multi-store restock-alert SaaS, sharing one
scraping core.

```
apps/
  mtg/        @mtg/deck-builder  Next.js Commander deck builder (Supabase; Prisma owns the schema)
  restock/    @mtg/restock       Next.js SaaS: restock alerts (Supabase)
  crawler/    @mtg/crawler       Node worker; store-agnostic, driven by adapters
packages/
  store-core/ @mtg/store-core    StoreAdapter interface, rate limiting, robots policy, HTML helpers
  itaca/      @mtg/itaca         Ítaca adapter — complete and tested
  metropolis/ @mtg/metropolis    Metrópolis Center adapter — scaffolded, parser pending
docs/
  RATE_LIMITING.md               per-store crawl budgets, verified against the live sites
  DATA-MODEL.md                  schema rationale and the tables left unbuilt
```

## Adding a store

Every shop is a `StoreAdapter` (`packages/store-core/src/types.ts`): it lists
catalog roots and fetches a page for an opaque cursor it defines itself. The
crawler never learns what a "set" or a "category" is, so a new store is a new
package plus a row in `stores` — no scheduler or schema changes.

Pacing is **per host**. Ítaca publishes `Crawl-delay: 5`; Metrópolis publishes
none and serves ~3.3MB pages, so its floor is derived from byte-equivalence
instead. One store's delay is never applied to another.

## Getting started

```bash
pnpm install
pnpm turbo run typecheck
pnpm --filter @mtg/itaca test
```

Deck builder (its own Supabase project):

```bash
cd apps/mtg && supabase start            # local Postgres + Auth on :54321
pnpm --filter @mtg/deck-builder db:migrate
pnpm --filter @mtg/deck-builder dev      # http://localhost:3000
```

Note the asymmetry with the SaaS below: **Prisma owns the deck builder's
schema, not the Supabase CLI.** Its 14 migrations predate the move to Supabase
and remain the source of truth, including the RLS policies, which are
hand-written SQL inside a Prisma migration. `supabase db reset` will not apply
them -- use `pnpm prisma migrate reset`. `[db.migrations] enabled` is set to
false in apps/mtg/supabase/config.toml to keep the two tools from fighting.

SaaS + crawler (Supabase; copy `apps/*/.env.example` first):

```bash
cd apps/restock && supabase start && supabase db reset
pnpm --filter @mtg/restock dev           # http://localhost:3001
pnpm --filter @mtg/crawler seed
pnpm --filter @mtg/crawler start
```

## Conventions

- **pnpm workspaces + Turborepo.** Packages ship raw TypeScript with no build
  step; each Next app lists them in `transpilePackages`.
- **Internal imports are extensionless.** Turbopack does not resolve `./x.js` to
  `./x.ts`, even though `tsc` with `moduleResolution: bundler` accepts it.
- **Next 16.** Turbopack by default, `middleware` is now `proxy`, `revalidateTag`
  takes a `cacheLife` argument. Read `node_modules/next/dist/docs/` before
  writing app code — see `AGENTS.md`.
- **Only `store-core` calls `fetch`.** Parsers have no network access, so the
  robots policy, crawl delay and backoff cannot be bypassed by a careless caller.

## Terms of Service — settle this before deploying the SaaS

Both stores permit the relevant crawling in `robots.txt`. **`robots.txt` is not
the binding constraint.**

### Ítaca — verified, and it conflicts

itaca.gg's [Terms and Conditions](https://itaca.gg/webInfo/termsAndConditions)
say (translated from Spanish):

- "Accessing the Site in any way, automatically or otherwise, constitutes use of
  the Site and your consent to be bound by these Terms of Service."
- "The Site is provided solely for your personal use and **not commercial use**."
- Prohibited to "copy, reproduce, republish elsewhere, transmit, sell, create
  derivative works, exploit or distribute" material from the Site, or to
  "incorporate any part of our content, material or intellectual property into
  another website or another service, **except with express authorisation**."

The deck builder's personal price lookups sit comfortably inside that. **A paid
SaaS republishing their catalog, prices and stock does not.**

### Metrópolis — not yet checked

Their `robots.txt` (stock PrestaShop, no `Crawl-delay`) permits the catalog and
disallows search. **Their Terms have not been reviewed** — do that before
building on them. Note also that the site answers non-browser clients with a JS
cookie challenge (`dhd2`, HTTP 202), which is an explicit signal about automated
access and worth weighing on its own.

For Metrópolis singles there may be no need to scrape at all: they sell as a
[Cardmarket seller](https://www.cardmarket.com/en/Magic/Users/Metropolis-Center),
and Cardmarket has an official API with per-article stock and price. See
`packages/metropolis/README.md`.

### The way through

Ítaca's terms name it themselves: *salvo autorización expresa* — except with
express authorisation. Ask both shops before launch. A store generally benefits
from a service that sends buyers to it, so a data feed, an affiliate arrangement,
or plain written permission are all plausible, and any of them is a far stronger
foundation than a crawler they never agreed to.

This summarises what the terms say; it is not legal advice. Everything in this
repo is safe to build and run against a local database — the constraint is on
operating it commercially against these shops without permission.
