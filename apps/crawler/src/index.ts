import { sleep } from "@mtg/store-core";
import { getAdapter } from "./adapters";
import { persistCatalogPage } from "./persist";
import { DailyCapReached } from "./rate-limiter";
import { supabase } from "./supabase";

/**
 * The crawl worker.
 *
 * One loop: claim the most overdue due page, fetch it through that store's
 * adapter, persist the diff, reschedule it. Pacing is not this loop's job —
 * the store's rate limiter blocks inside `adapter.fetchPage`, so the loop can
 * be written as if requests were free.
 *
 * Store-agnostic by construction: it never learns what a "set" or a "category"
 * is, only that a target has an opaque cursor its adapter understands.
 *
 * Safe to run more than one instance: claiming uses FOR UPDATE SKIP LOCKED and
 * spacing is enforced per host on a shared database row, not per process.
 */

const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`;

/** How long until a page of each tier is due again. */
const TIER_INTERVAL_MINUTES: Record<string, number> = {
  hot: 15,
  warm: 60,
  cold: 720,
  frozen: 10_080,
};

type CrawlTarget = {
  id: number;
  store_id: number;
  group_id: number | null;
  cursor: string;
  tier: string;
  consecutive_failures: number;
};

const storeSlugCache = new Map<number, string>();

async function getStoreSlug(storeId: number): Promise<string | null> {
  const cached = storeSlugCache.get(storeId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("stores")
    .select("slug")
    .eq("id", storeId)
    .single();
  if (error || !data) return null;

  storeSlugCache.set(storeId, data.slug as string);
  return data.slug as string;
}

async function claimTarget(): Promise<CrawlTarget | null> {
  const { data, error } = await supabase.rpc("claim_crawl_target", { p_worker: WORKER_ID });
  if (error) throw new Error(`claim failed: ${error.message}`);
  // The function returns a NULL composite when nothing is due.
  if (!data || (data as CrawlTarget).id === null) return null;
  return data as CrawlTarget;
}

async function releaseTarget(target: CrawlTarget, outcome: "ok" | "error"): Promise<void> {
  const failures = outcome === "ok" ? 0 : target.consecutive_failures + 1;
  const baseMinutes = TIER_INTERVAL_MINUTES[target.tier] ?? 720;
  // Back a failing page off exponentially so a permanently broken cursor cannot
  // consume the shared request budget forever.
  const minutes = outcome === "ok" ? baseMinutes : Math.min(baseMinutes * 2 ** failures, 1440);

  const { error } = await supabase
    .from("crawl_targets")
    .update({
      locked_at: null,
      locked_by: null,
      consecutive_failures: failures,
      last_success_at: outcome === "ok" ? new Date().toISOString() : undefined,
      next_run_at: new Date(Date.now() + minutes * 60_000).toISOString(),
      // Stop retrying a page that has failed ten times running; a human should
      // look at it rather than the crawler burning budget on it.
      is_active: failures < 10,
    })
    .eq("id", target.id);

  if (error) throw new Error(`release failed: ${error.message}`);
}

async function processOne(target: CrawlTarget): Promise<void> {
  const startedAt = new Date().toISOString();
  const started = Date.now();

  const slug = await getStoreSlug(target.store_id);
  if (!slug) {
    await releaseTarget(target, "error");
    return;
  }

  try {
    const adapter = getAdapter(slug);
    const page = await adapter.fetchPage(target.cursor);
    const stats = await persistCatalogPage(page, target.store_id, target.group_id);

    await supabase.from("crawl_runs").insert({
      target_id: target.id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      http_status: 200,
      status: "ok",
      products_seen: stats.productsSeen,
      articles_seen: stats.articlesSeen,
      articles_changed: stats.articlesChanged,
    });

    console.log(
      `[${WORKER_ID}] ${slug} ${target.cursor} (${target.tier}) — ` +
        `${stats.productsSeen} products, ${stats.articlesChanged} changes`
    );

    // Discovering the next page keeps the target list in step with catalog growth.
    if (page.nextCursor) {
      await supabase.from("crawl_targets").upsert(
        {
          store_id: target.store_id,
          group_id: target.group_id,
          cursor: page.nextCursor,
          tier: "cold",
        },
        { onConflict: "store_id,cursor", ignoreDuplicates: true }
      );
    }

    await releaseTarget(target, "ok");
  } catch (err) {
    if (err instanceof DailyCapReached) throw err;

    console.error(`[${WORKER_ID}] ${slug} ${target.cursor} failed:`, err);
    await supabase.from("crawl_runs").insert({
      target_id: target.id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      status: "error",
      error: String(err),
    });
    await releaseTarget(target, "error");
  }
}

async function main() {
  console.log(`[${WORKER_ID}] crawler starting`);

  let idleRounds = 0;
  for (;;) {
    let target: CrawlTarget | null;
    try {
      target = await claimTarget();
    } catch (err) {
      console.error(`[${WORKER_ID}] could not claim work:`, err);
      await sleep(30_000);
      continue;
    }

    if (!target) {
      // Nothing due. Sleeping here costs nothing: the schedule, not the loop,
      // decides when the next fetch happens.
      idleRounds++;
      if (idleRounds === 1) console.log(`[${WORKER_ID}] nothing due; idling`);
      await sleep(30_000);
      continue;
    }

    idleRounds = 0;

    try {
      await processOne(target);
    } catch (err) {
      if (err instanceof DailyCapReached) {
        console.warn(`[${WORKER_ID}] ${err.message}`);
        await sleep(15 * 60_000);
        continue;
      }
      throw err;
    }
  }
}

main().catch((err) => {
  console.error("crawler exited:", err);
  process.exit(1);
});
