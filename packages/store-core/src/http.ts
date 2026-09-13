/**
 * The only place any adapter is allowed to call `fetch`.
 *
 * Centralising it means the robots policy, the crawl delay, backoff and the
 * circuit breaker cannot be bypassed by a careless caller — a parser has no
 * network access of its own.
 */

import { backoffMs, InProcessRateLimiter, sleep, type RateLimiter } from "./rate-limit";

export class RobotsViolationError extends Error {
  constructor(path: string, host: string) {
    super(`Refusing to fetch ${path}: not permitted by ${host}'s robots.txt`);
    this.name = "RobotsViolationError";
  }
}

/**
 * A transcription of the parts of a store's robots.txt we rely on.
 *
 * `allow` is an allow-list rather than a deny-list on purpose: a new code path
 * that reaches for an unlisted URL fails loudly instead of quietly crawling
 * somewhere the store never agreed to.
 */
export interface RobotsPolicy {
  host: string;
  allow: string[];
  disallow: string[];
  /** Published Crawl-delay in ms, or a conservative choice where none is given. */
  minIntervalMs: number;
}

export function assertPathAllowed(path: string, policy: RobotsPolicy): void {
  const clean = path.split("?")[0];
  if (policy.disallow.some((p) => clean.startsWith(p))) {
    throw new RobotsViolationError(path, policy.host);
  }
  if (!policy.allow.some((p) => clean.startsWith(p))) {
    throw new RobotsViolationError(path, policy.host);
  }
}

export interface StoreHttpOptions {
  baseUrl: string;
  policy: RobotsPolicy;
  userAgent?: string;
  rateLimiter?: RateLimiter;
  timeoutMs?: number;
  maxRetries?: number;
  /** Extra headers, e.g. a cookie a store's interstitial requires. */
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export interface StoreResponse {
  path: string;
  status: number;
  html: string;
  redirected: boolean;
  finalUrl: string;
}

export class StoreHttp {
  private readonly userAgent: string;
  private readonly limiter: RateLimiter;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;
  private consecutiveFailures = 0;

  constructor(private readonly opts: StoreHttpOptions) {
    // Identify honestly and leave a contact route; anonymous scrapers are the
    // first thing an operator blocks.
    this.userAgent = opts.userAgent ?? "mtg-restock-bot/0.1 (+https://example.com/bot)";
    this.limiter = opts.rateLimiter ?? new InProcessRateLimiter(opts.policy.minIntervalMs);
    this.timeoutMs = opts.timeoutMs ?? 25_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.headers = opts.headers ?? {};
  }

  async get(path: string): Promise<StoreResponse> {
    assertPathAllowed(path, this.opts.policy);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.limiter.acquire();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
          headers: {
            "User-Agent": this.userAgent,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            ...this.headers,
          },
          redirect: "follow",
          signal: controller.signal,
        });

        if (res.status === 429 || res.status === 503) {
          // Respect Retry-After, and pause every other caller too.
          const retryAfter = Number(res.headers.get("retry-after")) || 60;
          await this.limiter.penalize(Date.now() + retryAfter * 1000);
          lastError = new Error(`${this.opts.policy.host} returned ${res.status}`);
          continue;
        }

        if (res.status >= 500) {
          lastError = new Error(`${this.opts.policy.host} returned ${res.status}`);
          await sleep(backoffMs(attempt, this.opts.policy.minIntervalMs));
          continue;
        }

        const html = await res.text();
        this.consecutiveFailures = 0;
        return {
          path,
          status: res.status,
          html,
          redirected: res.redirected,
          finalUrl: res.url,
        };
      } catch (err) {
        lastError = err;
        await sleep(backoffMs(attempt, this.opts.policy.minIntervalMs));
      } finally {
        clearTimeout(timer);
      }
    }

    this.consecutiveFailures++;
    throw new Error(
      `GET ${path} failed after ${this.maxRetries + 1} attempts ` +
        `(${this.consecutiveFailures} consecutive): ${String(lastError)}`
    );
  }

  /** Lets a supervisor trip a circuit breaker rather than hammering a struggling origin. */
  get failureStreak(): number {
    return this.consecutiveFailures;
  }
}
