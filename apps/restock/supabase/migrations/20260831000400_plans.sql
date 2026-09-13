-- Plans and subscriptions.
--
-- Plan limits are not cosmetic here: the crawl budget is a hard external
-- constraint (roughly 17k requests/day at the 5s crawl-delay), so what a plan
-- sells is literally a share of that budget. `min_poll_interval_minutes` is the
-- knob that connects pricing to politeness — it is read by the scheduler when
-- assigning tiers, not just displayed on a pricing page.

create table public.plans (
  code        text primary key,
  name        text not null,
  price_cents integer not null default 0,
  currency    text not null default 'EUR',

  max_watches integer not null,
  -- Floor on how often a watched page may be polled for this plan's users.
  min_poll_interval_minutes integer not null,
  -- Which delivery channels the plan unlocks.
  allowed_channels text[] not null default array['email'],

  is_public   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.plans
  (code, name, price_cents, max_watches, min_poll_interval_minutes, allowed_channels)
values
  ('free', 'Free',    0,   5,  360, array['email']),
  ('plus', 'Plus',  499,  50,   60, array['email', 'push']),
  ('pro',  'Pro',  1499, 500,   15, array['email', 'push', 'webhook', 'telegram'])
on conflict (code) do nothing;

create table public.subscriptions (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  plan_code  text not null references public.plans (code),
  status     text not null default 'active'
               check (status in ('active', 'past_due', 'canceled', 'trialing')),

  -- Billing provider identifiers, left generic so the provider can change.
  provider              text,
  provider_customer_id  text,
  provider_subscription_id text,

  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_plan_idx on public.subscriptions (plan_code);

-- Everyone without a row is on free; this keeps the check in one place.
create function public.current_plan(p_user uuid)
returns public.plans
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
    from public.plans p
    left join public.subscriptions s
      on s.plan_code = p.code
     and s.user_id = p_user
     and s.status in ('active', 'trialing')
   where p.code = coalesce(
     (select plan_code from public.subscriptions
       where user_id = p_user and status in ('active', 'trialing')),
     'free'
   )
   limit 1;
$$;

-- Takes a user id as an argument, so leaving it callable would let any signed-in
-- user read another user's plan. It is only needed by the trigger below.
revoke execute on function public.current_plan(uuid) from public, anon, authenticated;

-- Enforce the watch cap in the database so a bug in the UI cannot oversell the
-- crawl budget.
create function public.enforce_watch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select max_watches into v_limit from public.current_plan(new.user_id);
  select count(*) into v_count from public.watches
   where user_id = new.user_id and is_active;

  if v_count >= v_limit then
    raise exception 'watch limit reached for plan (% active watches allowed)', v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_watch_limit() from public, anon, authenticated;

create trigger watches_enforce_limit
  before insert on public.watches
  for each row execute function public.enforce_watch_limit();

alter table public.plans         enable row level security;
alter table public.subscriptions enable row level security;

create policy plans_read on public.plans
  for select to authenticated using (is_public);

create policy subscriptions_self on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
