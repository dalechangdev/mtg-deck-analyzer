# @mtg/metropolis

Store adapter for **Metrópolis Center** (metropolis-center.com), a Madrid game
store selling MTG singles, boosters, decks and accessories.

The adapter shape, robots policy and pacing are settled. **The parser is not
written**, because which source to read is still an open decision.

## What was verified (2026-08-31)

| | Ítaca | Metrópolis |
| --- | --- | --- |
| Platform | custom (Spring Boot) | PrestaShop |
| `robots.txt` | explicit, `Crawl-delay: 5`, singles paths allowed | stock PrestaShop file, **no Crawl-delay**, catalog allowed, search disallowed |
| Bot protection | Cloudflare, passive | **JS cookie challenge** (`dhd2`), returns HTTP 202 + meta-refresh to non-browser clients — it gates `robots.txt` itself |
| Page weight | ~200KB per 20 cards | **~3.3MB** per category page |
| Quantity exposed | yes, exact per-SKU counts | **not on category pages** — only `Agotado` / add-to-cart state |
| Product id | `article-amount-{id}` | `data-id-product="351552"` |
| Sitemap | none | `/sitemap.xml` exists but is a stale third-party export (xml-sitemaps.com free tier, 500-URL cap, `lastmod` 2025-06-09) — not usable as a product index |

## The open decision

**Where should singles data come from?**

1. **Their PrestaShop storefront.** Requires completing the JS cookie handshake
   on every session, and category pages are ~3.3MB. Worse, the pages checked so
   far expose only in/out-of-stock, not unit counts — so "back in stock" alerts
   would work but "only 2 left" would not. Needs one more probe of an actual
   singles (*cartas sueltas*) listing to confirm.

2. **Cardmarket.** Metrópolis sells its singles as a Cardmarket seller
   (`cardmarket.com/en/Magic/Users/Metropolis-Center`). Cardmarket publishes an
   official API with per-article stock and price. This is almost certainly the
   better source: sanctioned, structured, quantity-bearing, and it sidesteps
   both the bot challenge and the 3.3MB pages.

Recommendation: **option 2 for singles**, keeping the storefront adapter for
sealed product (boosters, decks, merch) that Cardmarket does not carry.

## Note on the bot challenge

The site answers non-browser clients with a JS interstitial that sets a `dhd2`
cookie. That is an explicit signal about automated access, and it is worth
weighing before building on it — the same "ask first" reasoning in the root
`README.md` applies here at least as strongly as it does to Ítaca.

## Pacing

`METROPOLIS_MIN_INTERVAL_MS` is 60s, derived from byte-equivalence with Ítaca's
published crawl delay rather than from a number the store published. See the
comment in `src/adapter.ts` for the arithmetic.
