import { sleep, type RateLimiter } from "@mtg/store-core";
import { supabase } from "./supabase";

export class DailyCapReached extends Error {
  constructor(host: string) {
    super(`Daily request cap for ${host} is spent; stopping until tomorrow.`);
    this.name = "DailyCapReached";
  }
}

/**
 * Crawl-delay enforced in the database rather than in the process.
 *
 * The in-process limiter that ships with @mtg/store-core is correct for exactly
 * one worker. The moment there are two — a second container, a retry job, someone
 * running the crawler locally against production — each keeps its own 5s clock
 * and the store sees double the agreed rate. `acquire_crawl_slot` serialises on
 * a single row, so every worker in the fleet draws from one spacing sequence.
 *
 * The cost is one round-trip per request, which is irrelevant next to a 5s wait.
 */
export class SupabaseRateLimiter implements RateLimiter {
  constructor(
    private readonly host: string,
    private readonly minIntervalSeconds: number,
    private readonly dailyCap = 15_000
  ) {}

  async acquire(): Promise<void> {
    const { data, error } = await supabase.rpc("acquire_crawl_slot", {
      p_host: this.host,
      p_min_interval: `${this.minIntervalSeconds} seconds`,
      p_daily_cap: this.dailyCap,
    });

    if (error) throw new Error(`Could not acquire a crawl slot: ${error.message}`);
    // A null slot means the daily cap is spent. Stopping is the correct
    // response — spinning would just burn CPU while still being blocked.
    if (data === null) throw new DailyCapReached(this.host);

    const waitMs = new Date(data as string).getTime() - Date.now();
    if (waitMs > 0) await sleep(waitMs);
  }

  async penalize(untilEpochMs: number): Promise<void> {
    // Pausing the shared bucket stops every worker, not just this one — which is
    // the point of a 429: the store is telling the whole client to back off.
    await supabase
      .from("rate_limit_buckets")
      .update({ paused_until: new Date(untilEpochMs).toISOString() })
      .eq("host", this.host);
  }
}
