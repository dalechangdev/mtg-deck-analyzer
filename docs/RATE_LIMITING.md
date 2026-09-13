# Crawl budget and rate limiting

Budgets are **per store**. One shop's published crawl delay says nothing about
another's, and the two tracked stores differ enough that a shared number would
be either needlessly slow for one or rude to the other.

## What was verified (2026-08-31, against the live sites)

| | Ítaca | Metrópolis Center |
| --- | --- | --- |
| Platform | custom (Spring Boot) | PrestaShop |
| `robots.txt` | explicit; `Crawl-delay: 5`; singles paths allowed | stock PrestaShop file; **no Crawl-delay**; catalog allowed, search disallowed |
| Bot protection | Cloudflare, passive | **JS cookie challenge** (`dhd2`, HTTP 202) — gates `robots.txt` itself |
| Conditional requests | none — no `ETag`, no `Last-Modified`, `cf-cache-status: DYNAMIC` | not established |
| Page weight | ~200KB per 20 cards | **~3.3MB** per category page |
| Quantity published | yes, exact per-SKU counts | **no** — availability only, on the pages checked |
| Chosen floor | **5s** (their number) | **60s** (derived — see below) |

The absent `ETag` is the expensive fact. On a site with conditional requests,
re-polling an unchanged page costs a 304 and a few hundred bytes. Here it costs
a fully rendered page, every single time. The budget is genuinely scarce, so it
is enforced in the database rather than left to each worker's good intentions.

## Pace by bytes, not just by requests

Metrópolis publishes no `Crawl-delay`. That is permission to choose, not
permission to hammer.

Ítaca's published 5s delay against ~200KB pages works out to **~40KB/s** of
origin load. Matching that byte rate against Metrópolis's ~3.3MB pages means
roughly **80s** between requests. The configured floor of 60s is therefore
already on the fast side of byte-equivalent, and is set as a floor rather than a
target. Revisit it per page type — a product page is far smaller than a category
listing and can safely be polled more often.

## The one decision that makes this feasible

**Poll catalog pages, not product pages.**

On Ítaca a listing page returns 20 cards *and*, for each, the full SKU table:
language, condition, finish, unit price and **on-hand quantity**. The per-card
product page carries price and availability in JSON-LD but **not quantity** — so
monitoring stock through product pages would cost 20x the requests and still not
report the number the product depends on.

This is why `crawl_targets` holds one row per page cursor, not one per card.
Demand is expressed per card; work is coalesced per page. Ten users watching ten
different cards that happen to share a page cost one request between them.

## Capacity (Ítaca)

Capacity is bounded by **distinct pages watched**, not by user count and not by
watch count. That is the number to put in a pricing model.

`Crawl-delay: 5` gives a hard ceiling of **720 requests/hour**. Target ~60%
utilisation, leaving headroom for retries, page discovery and re-indexing:

| Tier | Interval | Polls/page/hr | Pages supported | Requests/hr |
| --- | --- | --- | --- | --- |
| `hot` | 15 min | 4 | 60 | 240 |
| `warm` | 60 min | 1 | 120 | 120 |
| `cold` | 12 h | 0.083 | 700 | 58 |
| `frozen` | 7 d | 0.006 | 5,000 | 30 |
| | | | **~5,880 pages** | **~448/hr (62%)** |

At 20 cards per page the `hot` tier alone covers ~1,200 cards at 15-minute
freshness. Because watch demand concentrates hard on staples and chase cards,
that supports far more than 60 users — but it degrades the moment demand
*spreads* rather than *deepens*. Watch the distinct-page count, not signups.

A full Ítaca sweep is roughly 6,000–9,000 pages across its 692 expansions
(exact figure unknown until `catalog_groups.page_count` fills in). At 5s spacing
that is **8–12 hours and 1.2–1.8 GB of someone else's bandwidth**. Never run one
on a schedule. Seed the root cursor and let the worker discover deeper pages
only for groups somebody actually watches.

At 60s, Metrópolis's ceiling is 60 requests/hour — a twelfth of Ítaca's. Its
tiering has to be far more selective, which is another argument for taking its
singles from Cardmarket's API instead (see `packages/metropolis/README.md`).

## How the limit is enforced

The in-process limiter in `@mtg/store-core` is correct for exactly one worker.
Two workers each keep their own clock and the store sees double the agreed rate
— a silent failure that scales with every instance.

So the clock lives in Postgres, **one bucket per host**.
`acquire_crawl_slot(host, interval)` does an `UPDATE` on a single row in
`rate_limit_buckets`, serialising every worker in the fleet onto one spacing
sequence per store, and returns the instant that worker may fire:

```sql
next_allowed_at = greatest(next_allowed_at, now(), paused_until) + p_min_interval
```

Verified: consecutive Ítaca slots come back exactly 5s apart and Metrópolis
slots exactly 60s apart, from independent sequences; the function returns `NULL`
once that host's daily cap is spent.

## Backing off

| Signal | Response |
| --- | --- |
| `429` / `503` | Read `Retry-After`, write it to that host's `paused_until` — pausing **every** worker, which is what the store is asking for |
| `5xx` | Exponential backoff with jitter, up to 3 retries |
| Bot challenge | Record `crawl_runs.was_challenged`; a run of these should trip a circuit breaker and page a human. **Never try to solve or evade a challenge** — that turns a rate-limit problem into a hostile one |
| 10 consecutive failures on one page | `is_active = false`. A permanently broken cursor must not consume shared budget forever |
| Daily cap reached | Stop until tomorrow. Do not spin |

## Being a good citizen

- **Identify honestly.** `CRAWLER_USER_AGENT` carries a real contact URL. An
  anonymous scraper is the first thing an operator blocks, and rightly.
- **Never touch disallowed paths.** `assertPathAllowed()` is an allow-list, so a
  new code path that reaches for an unlisted URL fails loudly rather than
  quietly crawling somewhere the store never agreed to.
- **Crawl off-peak.** Both origins are in Madrid. Schedule `cold` and `frozen`
  sweeps for 03:00–07:00 Europe/Madrid, when a request costs the store least.
- **Cap the daily total** below the theoretical ceiling, so a scheduling bug
  cannot run flat out for 24 hours.
- **Keep a kill switch.** Setting `paused_until` far in the future stops the
  entire fleet for a host with one `UPDATE`.

## Before any of this runs against production

See the "Terms of Service" section in the root `README.md`. Ítaca's Terms
restrict use to personal, non-commercial purposes and prohibit incorporating its
content into another service without prior written permission; Metrópolis's
Terms have not been reviewed yet. That is a business decision to settle first,
not a technical one — and it is much easier to ask for a data feed than to argue
about a crawler afterwards.
