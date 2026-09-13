-- Crawler control plane: what to fetch, when, and how fast.
--
-- The unit of work is ONE CATALOG PAGE, not one card. On Ítaca a listing page
-- returns 20 cards together with every SKU's language, condition, price and
-- quantity, so polling 20 product pages to learn the same thing would cost 20x
-- the requests and still not report quantity. Every scheduling decision below
-- follows from that: demand is expressed per card, but work is coalesced per
-- page.
--
-- Neither store supports conditional requests (Ítaca sends no ETag, no
-- Last-Modified and cf-cache-status: DYNAMIC), so every poll is a full origin
-- hit — ~200KB on Ítaca, ~3.3MB on Metrópolis. The budget is genuinely scarce
-- and is enforced here in the database, not in each worker.
--
-- Pacing is per host, not global: each store gets its own bucket, because one
-- store's published crawl delay says nothing about another's.

-- ------------------------------------------------------------- crawl targets

create table public.crawl_targets (
  id       bigint generated always as identity primary key,
  store_id bigint not null references public.stores (id) on delete cascade,
  group_id bigint references public.catalog_groups (id) on delete cascade,

  -- Opaque cursor defined by the store's adapter: "{setSlug}:{offset}" for
  -- Ítaca, something else entirely for another shop. Keeping it opaque is what
  -- lets one queue schedule stores whose pagination has nothing in common.
  cursor   text not null,

  -- Derived from how many active watches point at products on this page.
  tier         text not null default 'cold'
                 check (tier in ('hot', 'warm', 'cold', 'frozen')),
  watch_demand integer not null default 0,

  next_run_at     timestamptz not null default now(),
  last_run_at     timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,

  -- Set when a worker claims the row, cleared on completion. A stale lease is
  -- reclaimed by the claim function below.
  locked_at timestamptz,
  locked_by text,

  is_active  boolean not null default true,
  created_at timestamptz not null default now(),

  unique (store_id, cursor)
);

-- The scheduler's hot path: next due, unlocked, active.
create index crawl_targets_due_idx
  on public.crawl_targets (next_run_at)
  where is_active and locked_at is null;

create index crawl_targets_store_idx on public.crawl_targets (store_id);
create index crawl_targets_group_idx on public.crawl_targets (group_id);

-- ---------------------------------------------------------------- crawl runs
--
-- One row per HTTP request. This is the evidence base for "are we being a good
-- citizen" — request counts per hour, error rates, and whether Cloudflare has
-- started challenging us.

create table public.crawl_runs (
  id          bigint generated always as identity,
  target_id   bigint references public.crawl_targets (id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,

  http_status integer,
  bytes       integer,
  -- Set when Cloudflare interposes (403/503 with a challenge body) rather than
  -- the origin answering. A run of these should trip the circuit breaker.
  was_challenged boolean not null default false,

  products_seen    integer,
  articles_seen    integer,
  articles_changed integer,

  status      text not null default 'running'
                check (status in ('running', 'ok', 'error', 'skipped')),
  error       text,

  primary key (id, started_at)
) partition by range (started_at);

create table public.crawl_runs_2026_08 partition of public.crawl_runs
  for values from ('2026-08-01') to ('2026-09-01');
create table public.crawl_runs_2026_09 partition of public.crawl_runs
  for values from ('2026-09-01') to ('2026-10-01');

create index crawl_runs_started_idx on public.crawl_runs (started_at desc);

-- ------------------------------------------------------- distributed limiter
--
-- An in-process limiter is only correct for a single worker. With two workers
-- each keeps its own 5s interval and the store sees 2 req/5s. This table is the
-- shared clock: a worker must win a slot here before it is allowed to fetch.

create table public.rate_limit_buckets (
  host            text primary key,
  -- Nobody may fire before this instant. Advanced by exactly one interval per
  -- granted slot, which is what enforces the spacing.
  next_allowed_at timestamptz not null default now(),
  -- Set from Retry-After on 429/503, or by hand to stop all crawling.
  paused_until    timestamptz,
  -- Rolling counters for observability and daily caps.
  requests_today  integer not null default 0,
  day             date not null default current_date,
  updated_at      timestamptz not null default now()
);

-- One bucket per host: Ítaca's 5s delay says nothing about how fast
-- Metrópolis may be polled, so they must not share a spacing sequence.
insert into public.rate_limit_buckets (host) values
  ('itaca.gg'), ('metropolis-center.com')
on conflict (host) do nothing;

-- Grants one request slot and returns the instant the caller may fire.
-- The UPDATE takes a row lock, so concurrent workers serialise here and each
-- gets a distinct, correctly spaced slot.
create function public.acquire_crawl_slot(
  p_host text,
  p_min_interval interval default interval '5 seconds',
  p_daily_cap integer default 15000
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot timestamptz;
begin
  update public.rate_limit_buckets
     set day            = case when day < current_date then current_date else day end,
         requests_today = case when day < current_date then 0 else requests_today end
   where host = p_host;

  update public.rate_limit_buckets
     set next_allowed_at = greatest(next_allowed_at, now(), coalesce(paused_until, now()))
                           + p_min_interval,
         requests_today  = requests_today + 1,
         updated_at      = now()
   where host = p_host
     and requests_today < p_daily_cap
  returning next_allowed_at - p_min_interval into v_slot;

  -- NULL means the daily cap is spent; the caller must stop, not spin.
  return v_slot;
end;
$$;

revoke execute on function public.acquire_crawl_slot(text, interval, integer)
  from public, anon, authenticated;

-- Claims the most overdue due target for one worker. SKIP LOCKED lets several
-- workers claim different pages instead of queueing behind each other.
create function public.claim_crawl_target(
  p_worker text,
  p_lease interval default interval '5 minutes'
)
returns public.crawl_targets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.crawl_targets;
begin
  update public.crawl_targets t
     set locked_at = now(),
         locked_by = p_worker,
         last_run_at = now()
   where t.id = (
     select id
       from public.crawl_targets
      where is_active
        and next_run_at <= now()
        -- Reclaim leases abandoned by a worker that died mid-fetch.
        and (locked_at is null or locked_at < now() - p_lease)
      order by
        -- Hottest first, then most overdue, so a backlog degrades gracefully:
        -- the pages people actually watch keep their cadence.
        case tier when 'hot' then 0 when 'warm' then 1 when 'cold' then 2 else 3 end,
        next_run_at
      limit 1
      for update skip locked
   )
  returning t.* into v_row;

  return v_row;
end;
$$;

revoke execute on function public.claim_crawl_target(text, interval)
  from public, anon, authenticated;

-- --------------------------------------------------------------------- RLS
--
-- Operational tables are service_role-only. RLS is enabled with no policies,
-- which denies every regular role outright; service_role bypasses RLS.

alter table public.crawl_targets      enable row level security;
alter table public.crawl_runs         enable row level security;
alter table public.rate_limit_buckets enable row level security;
