-- Catalog: what the tracked stores sell, as observed by the crawler.
--
--   store -> catalog_group -> product -> article
--
-- An "article" is one purchasable line item: a specific language + condition +
-- finish with its own price and stock. That is the row a shop decrements on a
-- sale, so it is the row a restock alert must watch. Watching at product level
-- would fire on "a Spanish played copy appeared" when the user wanted English
-- near-mint.
--
-- Multi-store from the start, because the stores differ in ways that would be
-- painful to retrofit:
--
--   Ítaca       publishes exact per-SKU unit counts
--   Metrópolis  publishes only in/out-of-stock on its category pages
--
-- Hence `articles.quantity` is NULLABLE and `articles.in_stock` is not. "Is it
-- back?" can be answered for every store; "how many are left?" cannot, and
-- coercing an unknown count to 0 or 1 would silently corrupt both.
--
-- These tables are written only by the crawler (service_role, which bypasses
-- RLS). Signed-in users get read-only access.

create extension if not exists pg_trgm;

-- --------------------------------------------------------------------- stores

create table public.stores (
  id          bigint generated always as identity primary key,
  slug        text not null unique,          -- matches StoreAdapter.slug
  name        text not null,
  base_url    text not null,
  -- Minimum spacing between requests, chosen per store. Ítaca publishes a
  -- Crawl-delay; Metrópolis does not, so its value is derived from page weight.
  min_interval_ms integer not null default 5000 check (min_interval_ms >= 1000),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.stores (slug, name, base_url, min_interval_ms) values
  ('itaca',      'Ítaca',             'https://itaca.gg',              5000),
  ('metropolis', 'Metrópolis Center', 'https://metropolis-center.com', 60000)
on conflict (slug) do nothing;

-- ------------------------------------------------------------- catalog groups
--
-- However a store partitions its catalog: an expansion on Ítaca, a category on
-- Metrópolis. One table because the scheduler only needs "a bag of pages".

create table public.catalog_groups (
  id        bigint generated always as identity primary key,
  store_id  bigint not null references public.stores (id) on delete cascade,
  -- The store's own identifier for the group (URL slug, category id).
  external_id text not null,
  name      text not null,
  kind      text not null default 'expansion'
              check (kind in ('expansion', 'category')),

  -- How many pages the last full walk needed; used to plan crawl cost.
  page_count integer,
  crawl_tier text not null default 'cold'
               check (crawl_tier in ('hot', 'warm', 'cold', 'frozen')),
  is_active  boolean not null default true,
  first_seen_at   timestamptz not null default now(),
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (store_id, external_id)
);

create index catalog_groups_tier_idx
  on public.catalog_groups (crawl_tier) where is_active;

-- ------------------------------------------------------------------- products

create table public.products (
  id          bigint generated always as identity primary key,
  store_id    bigint not null references public.stores (id) on delete cascade,
  -- The store's own product id. Text because it is an opaque external key.
  external_id text not null,
  group_id    bigint references public.catalog_groups (id) on delete set null,

  name           text not null,
  alternate_name text,
  slug           text,
  url            text,
  image_url      text,

  delisted_at   timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Product ids are only unique within a store.
  unique (store_id, external_id)
);

create index products_group_id_idx on public.products (group_id);
create index products_store_id_idx on public.products (store_id);

-- Name search for the "add a watch" autocomplete. trigram beats LIKE 'x%'
-- because users type fragments ("bolt", "jace bel").
create index products_name_trgm_idx on public.products using gin (name gin_trgm_ops);

-- ------------------------------------------------------------------- articles

create table public.articles (
  id          bigint generated always as identity primary key,
  store_id    bigint not null references public.stores (id) on delete cascade,
  external_id text not null,
  product_id  bigint not null references public.products (id) on delete cascade,

  language  text,
  condition text not null default 'UNKNOWN'
              check (condition in ('NM', 'SP', 'MP', 'HP', 'PO', 'UNKNOWN')),
  is_foil     boolean not null default false,
  is_signed   boolean not null default false,
  is_altered  boolean not null default false,
  is_offer    boolean not null default false,
  is_preorder boolean not null default false,

  -- Availability is always known; the unit count is not.
  in_stock  boolean not null default false,
  quantity  integer check (quantity is null or quantity >= 0),

  price_cents integer not null check (price_cents >= 0),
  currency    text not null default 'EUR',

  -- An article that vanishes from the listing is gone from sale; keep the row
  -- so its history survives and a later reappearance reads as a restock.
  is_active     boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (store_id, external_id)
);

comment on column public.articles.quantity is
  'Units on hand, or NULL when the store does not publish counts (Metrópolis). '
  'Never coerce NULL to 0 — use in_stock for availability.';

create index articles_product_id_idx on public.articles (product_id);

-- The matching query behind every alert: "which live articles for this product
-- are purchasable right now?" Partial index keeps it small — most articles are
-- either inactive or out of stock at any moment.
create index articles_in_stock_idx
  on public.articles (product_id, price_cents)
  where is_active and in_stock;

-- -------------------------------------------------------------------- history
--
-- Append-only, and written ONLY when something actually changed. A row per
-- article per poll would be tens of thousands of identical rows an hour and
-- would tell you nothing a change log does not.

create table public.article_stock_events (
  id          bigint generated always as identity,
  article_id  bigint not null references public.articles (id) on delete cascade,
  observed_at timestamptz not null default now(),

  kind text not null check (kind in (
    'appeared',      -- first seen, or seen again after delisting
    'back_in_stock', -- availability flipped false -> true (works without counts)
    'restock',       -- quantity increased (count-bearing stores only)
    'decrease',      -- quantity dropped but not to zero
    'sold_out',      -- availability flipped true -> false
    'delisted',      -- row disappeared from the listing entirely
    'price_change'
  )),

  in_stock             boolean not null,
  previous_in_stock    boolean,
  quantity             integer check (quantity is null or quantity >= 0),
  previous_quantity    integer check (previous_quantity is null or previous_quantity >= 0),
  price_cents          integer not null check (price_cents >= 0),
  previous_price_cents integer check (previous_price_cents is null or previous_price_cents >= 0),

  primary key (id, observed_at)
) partition by range (observed_at);

comment on table public.article_stock_events is
  'Append-only stock/price change log. Partitioned monthly so old data can be '
  'dropped with DROP TABLE instead of a long DELETE.';

-- Partitions are created ahead of time by a scheduled job; these two cover the
-- current period so the table is usable immediately.
create table public.article_stock_events_2026_08 partition of public.article_stock_events
  for values from ('2026-08-01') to ('2026-09-01');
create table public.article_stock_events_2026_09 partition of public.article_stock_events
  for values from ('2026-09-01') to ('2026-10-01');

create index article_stock_events_article_idx
  on public.article_stock_events (article_id, observed_at desc);

-- Feed for "what came back in stock recently" across the whole site.
create index article_stock_events_restock_idx
  on public.article_stock_events (observed_at desc)
  where kind in ('back_in_stock', 'restock', 'appeared');

-- ----------------------------------------------------------------------- RLS
--
-- Catalog data is not user-specific, but it is still not public: only signed-in
-- users can read it. The crawler writes with service_role, which bypasses RLS,
-- so no write policies are defined here on purpose.

alter table public.stores               enable row level security;
alter table public.catalog_groups       enable row level security;
alter table public.products             enable row level security;
alter table public.articles             enable row level security;
alter table public.article_stock_events enable row level security;

create policy stores_read on public.stores
  for select to authenticated using (true);

create policy catalog_groups_read on public.catalog_groups
  for select to authenticated using (true);

create policy products_read on public.products
  for select to authenticated using (true);

create policy articles_read on public.articles
  for select to authenticated using (true);

create policy article_stock_events_read on public.article_stock_events
  for select to authenticated using (true);
