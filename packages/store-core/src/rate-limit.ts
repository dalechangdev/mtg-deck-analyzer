/**
 * Request pacing, shared by every store adapter.
 *
 * Each store gets its own limiter instance keyed by host — Ítaca's 5s
 * Crawl-delay says nothing about how fast Metropolis may be polled, and one
 * global limiter would either be needlessly slow for one or rude to the other.
 */

export interface RateLimiter {
  acquire(): Promise<void>;
  /** Called after a 429/503 so the limiter can pause every caller, not just this one. */
  penalize(untilEpochMs: number): Promise<void>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class InProcessRateLimiter implements RateLimiter {
  private next = 0;
  private chain: Promise<void> = Promise.resolve();
  private pausedUntil = 0;

  constructor(private readonly minIntervalMs: number) {}

  acquire(): Promise<void> {
    // Serialising on a promise chain keeps concurrent callers from all reading
    // the same `next` value and firing at once.
    const wait = this.chain.then(async () => {
      const target = Math.max(this.next, this.pausedUntil, Date.now());
      const delay = target - Date.now();
      if (delay > 0) await sleep(delay);
      this.next = Date.now() + this.minIntervalMs;
    });
    this.chain = wait.catch(() => undefined);
    return wait;
  }

  async penalize(untilEpochMs: number): Promise<void> {
    this.pausedUntil = Math.max(this.pausedUntil, untilEpochMs);
  }
}

export function backoffMs(attempt: number, baseMs: number): number {
  return baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
}
