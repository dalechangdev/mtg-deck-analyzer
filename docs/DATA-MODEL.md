# Data model

Migrations live in `apps/restock/supabase/migrations/`. They apply cleanly and
have been smoke-tested against Postgres 16: per-store id uniqueness, nullable
quantities, countless restock events, independent per-host slot spacing, opaque
cursors from two stores in one queue, alert idempotency, partition routing, and
plan-limit enforcement.

## The spine

```
store → catalog_group → product → article    what a shop sells   (crawler writes)
                                     ↓
                                   watch      what a user wants   (user writes)
                                     ↓
                                   alert      a match that fired  (matcher writes)
                                     ↓
                              notification    a delivery attempt  (sender writes)
```

Separate tables because each has a different writer, a different lifetime, and a
different failure mode. A failed email must be retryable without re-firing the
alert; one alert must be able to fan out to two channels.

## Decisions worth knowing about

**Multi-store from the start.** `products` and `articles` carry a `store_id`,
and their external ids are unique **per store**, not globally — the same id
string can legitimately mean different things at two shops. Retrofitting this
later would have meant touching every table, index, and unique constraint.

**`catalog_groups` is deliberately vague.** An expansion on Ítaca, a category on
Metrópolis. The scheduler only needs "a bag of pages", so one table with a `kind`
column covers both without teaching the crawler what a set is.

**`articles.quantity` is nullable; `articles.in_stock` is not.** Ítaca publishes
exact per-SKU counts. Metrópolis publishes only availability. Coercing an unknown
count to 0 or 1 would silently corrupt both the alerting logic and any chart
built on it, so the unknown stays explicit. Everything that needs a count checks
for null and falls back to the availability transition.

**Two restock event kinds, on purpose.** `back_in_stock` is the availability
transition every store can report; `restock` is a count increase and only fires
for count-bearing stores. Alerting keys on the first so it works everywhere.

**Alerts key on articles, not products.** An article is one language + condition
+ finish — the row a shop decrements on a sale. Watching at product level would
fire "back in stock!" when a Spanish played copy appeared and the user wanted
English NM. The watch is expressed against a *product* (how users think) and
filtered to *articles* at match time (how stock works).

**History is a change log.** `article_stock_events` gets a row only when
something changed, partitioned monthly so old data drops with `DROP TABLE`.

**Money is integer cents**, never float. Parsed from each store's local format
at the edge.

**Alerts carry a `dedupe_key`.** Re-running a crawl after a crash must not mail
everyone twice — verified by test.

**Plan limits are enforced by a trigger.** What a plan sells is a share of a
scarce crawl budget, so `max_watches` is checked where a UI bug cannot oversell it.

**`SECURITY DEFINER` functions have `EXECUTE` revoked.** Postgres grants EXECUTE
to `PUBLIC` by default, which would have made `current_plan(uuid)` callable by
any signed-in user with someone else's id.

**Operational tables have RLS enabled and no policies.** `crawl_targets`,
`crawl_runs` and `rate_limit_buckets` are reachable only by `service_role`.

## The big open question: cross-store card identity

With two stores, the obvious user request is *"tell me when **anyone** has
Lightning Bolt"* — but a `watch` currently points at one store's `product` row.
Watching the same card at two shops means two watches, and the UI has no way to
know they are the same card.

Fixing it needs a shared card identity, almost certainly Scryfall's `oracle_id`,
plus a `product_cards` mapping table. That is not free: matching a shop's product
name to a Scryfall card is fuzzy across languages, set names, and promo/variant
suffixes, and getting it wrong means either missed alerts or wrong ones.

It is also the bridge to the deck builder — which already has the full Scryfall
catalog in Postgres — and the prerequisite for "import a decklist, watch
everything missing from it".

**This is the next decision to make, before the watch UI is built**, because it
changes what a watch points at.

## Tables deliberately not built yet

| Table | What it buys | Add it when |
| --- | --- | --- |
| `product_cards` | Maps a store's product → Scryfall `oracle_id`; unlocks cross-store and cross-printing watches, art, oracle text | You answer the question above |
| `deck_watches` | Import a decklist, watch everything missing in one action | You want the killer feature |
| `alert_batches` | Groups alerts into one digest email | You implement `notification_preferences.mode = 'digest'` |
| `email_events` | Bounces and complaints from the ESP webhook | You send real volume; without it sending reputation degrades silently |
| `price_history_daily` | Cheap rollup for charts, derived from the event log | Charts get slow reading raw events |
| `api_keys` | Third-party access, webhook signing secrets | You sell the webhook channel |
| `push_devices` | Per-device push tokens with expiry | You ship mobile/web push |
| `notification_dead_letter` | Deliveries that exhausted retries | You need to answer "why didn't I get my alert?" |
| `audit_log` | Who changed what | Compliance, or your first billing dispute |

## Other open questions

1. **Price-drop watches.** The schema already records `price_change` events and
   `max_price_cents`, so "tell me when it drops below €X" is nearly free. In
   scope for v1?
2. **What counts as a restock?** Currently an availability flip to true. Should
   0 → 1 → 0 → 1 flapping inside the cooldown window count once or twice? The
   `cooldown_minutes` default of 6 hours says once.
3. **Retention.** How long do `article_stock_events` partitions live? Charts want
   a year; the alerting path only needs the newest row.
