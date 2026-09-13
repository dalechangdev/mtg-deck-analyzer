-- Users, what they watch, and what we told them about it.
--
-- The chain is deliberately three tables rather than one:
--
--   watch  ->  alert  ->  notification
--
--   watch        standing intent ("tell me when this is back")
--   alert        a matched event ("it came back at 11,95 on 31 Aug")
--   notification a delivery attempt ("emailed at 09:02, bounced")
--
-- Collapsing them loses the ability to retry a failed email without re-firing
-- the alert, or to send one alert to two channels.

-- ------------------------------------------------------------------ profiles

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- Quiet hours are evaluated in the user's own timezone, so it is not optional.
  timezone     text not null default 'Europe/Madrid',
  locale       text not null default 'en',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Keep profiles in step with auth.users without an application round-trip.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, so a SECURITY
-- DEFINER function in a schema the Data API exposes is a callable endpoint for
-- anon/authenticated unless that grant is removed. This one is only ever
-- invoked by the trigger below.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------- watches
--
-- A watch targets a product, not an article: users think "I want Lightning
-- Bolt from this set", not "I want article 2076006057". The article-level
-- preferences are filters applied at match time.

create table public.watches (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,

  -- Filters. NULL means "no preference" throughout, so a bare watch matches
  -- anything back in stock.
  languages      text[],
  conditions     text[],
  allow_foil     boolean,
  max_price_cents integer check (max_price_cents is null or max_price_cents > 0),
  min_quantity   integer not null default 1 check (min_quantity > 0),

  is_active   boolean not null default true,
  -- Stops a flapping listing (stock bouncing 0/1/0) from mailing repeatedly.
  cooldown_minutes integer not null default 360 check (cooldown_minutes >= 0),
  last_alerted_at  timestamptz,

  -- Optional user-facing label, e.g. "for the Krenko deck".
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One watch per user per card; filter changes edit the existing row.
  unique (user_id, product_id)
);

create index watches_user_id_idx on public.watches (user_id);

-- The crawler's reverse lookup after a restock: "who wants this product?"
create index watches_product_active_idx
  on public.watches (product_id) where is_active;

-- -------------------------------------------------------------------- alerts

create table public.alerts (
  id         bigint generated always as identity primary key,
  watch_id   bigint not null references public.watches (id) on delete cascade,
  -- Which specific SKU satisfied the watch.
  article_id bigint not null references public.articles (id) on delete cascade,

  -- Snapshot at trigger time. Denormalised on purpose: the article's current
  -- values will have moved on by the time the user opens the email, and the
  -- alert should say what was true when it fired.
  -- `quantity` is nullable because not every store publishes unit counts; the
  -- email must then say "in stock" rather than inventing a number.
  in_stock    boolean not null default true,
  quantity    integer check (quantity is null or quantity >= 0),
  price_cents integer not null,
  currency    text not null default 'EUR',

  triggered_at timestamptz not null default now(),

  -- Idempotency key for the matcher. Recomputing the same (watch, article,
  -- restock event) must not create a second alert if a crawl is retried.
  dedupe_key  text not null unique
);

create index alerts_watch_idx on public.alerts (watch_id, triggered_at desc);

-- ------------------------------------------------------- notification routing

create table public.notification_channels (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('email', 'webhook', 'telegram', 'push')),
  -- Address for the channel: an email, a URL, a chat id.
  destination text not null,
  -- Unverified channels are never delivered to; stops the service being used
  -- to mail arbitrary third parties.
  verified_at timestamptz,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  unique (user_id, kind, destination)
);

create index notification_channels_user_idx on public.notification_channels (user_id);

create table public.notification_preferences (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  -- 'instant' mails on every alert; 'digest' batches to one message per window.
  mode        text not null default 'instant' check (mode in ('instant', 'digest')),
  digest_hour smallint check (digest_hour between 0 and 23),
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end   smallint check (quiet_end between 0 and 23),
  updated_at  timestamptz not null default now()
);

create table public.notifications (
  id         bigint generated always as identity primary key,
  alert_id   bigint not null references public.alerts (id) on delete cascade,
  channel_id bigint not null references public.notification_channels (id) on delete cascade,

  status     text not null default 'pending'
               check (status in ('pending', 'sent', 'failed', 'suppressed')),
  attempts   integer not null default 0,
  -- Populated when status = 'suppressed', e.g. 'quiet_hours', 'cooldown'.
  suppressed_reason text,
  last_error text,
  provider_message_id text,

  scheduled_for timestamptz not null default now(),
  sent_at    timestamptz,
  created_at timestamptz not null default now(),

  -- One delivery per alert per channel.
  unique (alert_id, channel_id)
);

-- The sender's claim query; partial so it stays small as sent rows accumulate.
create index notifications_pending_idx
  on public.notifications (scheduled_for)
  where status = 'pending';

-- --------------------------------------------------------------------- RLS
--
-- Every policy wraps auth.uid() in a SELECT so it is evaluated once per query
-- rather than once per row.

alter table public.profiles                 enable row level security;
alter table public.watches                  enable row level security;
alter table public.alerts                   enable row level security;
alter table public.notification_channels    enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications            enable row level security;

create policy profiles_self on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy watches_self on public.watches
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Alerts and notifications are written by the matcher (service_role) and only
-- read by their owner, so these are select-only policies that join back to the
-- owning watch.
create policy alerts_self on public.alerts
  for select to authenticated
  using (exists (
    select 1 from public.watches w
    where w.id = alerts.watch_id and w.user_id = (select auth.uid())
  ));

create policy notification_channels_self on public.notification_channels
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notification_preferences_self on public.notification_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notifications_self on public.notifications
  for select to authenticated
  using (exists (
    select 1
    from public.alerts a
    join public.watches w on w.id = a.watch_id
    where a.id = notifications.alert_id and w.user_id = (select auth.uid())
  ));
