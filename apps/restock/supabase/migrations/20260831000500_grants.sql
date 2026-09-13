-- Data API exposure.
--
-- RLS decides which ROWS a role can see; table privileges decide whether the
-- role can reach the table at all. Depending on a project's Data API settings
-- these grants are not applied automatically, so they are spelled out here.
-- Every table granted below has RLS enabled in an earlier migration.
--
-- `anon` is granted nothing: this product has no signed-out surface.

grant usage on schema public to authenticated;

-- Catalog: read-only. Written by the crawler with service_role.
grant select on table public.stores               to authenticated;
grant select on table public.catalog_groups       to authenticated;
grant select on table public.products             to authenticated;
grant select on table public.articles             to authenticated;
grant select on table public.article_stock_events to authenticated;
grant select on table public.plans                to authenticated;

-- Owned by the user, gated row-wise by RLS.
grant select, insert, update, delete on table public.profiles                 to authenticated;
grant select, insert, update, delete on table public.watches                  to authenticated;
grant select, insert, update, delete on table public.notification_channels    to authenticated;
grant select, insert, update, delete on table public.notification_preferences to authenticated;

-- Produced by the matcher; users may read their own but never write.
grant select on table public.alerts        to authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.subscriptions to authenticated;

-- Operational tables (crawl_targets, crawl_runs, rate_limit_buckets) are
-- deliberately absent: only service_role touches them.
