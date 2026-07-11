export interface RetryOptions {
  /** additional attempts after the first failure (default 4) */
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRIABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"]);

/** Transient Google API failures worth retrying (rate limits, server errors). */
export function isRetriableGoogleError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { status?: number; code?: number | string; errors?: { reason?: string }[] };
  const status = typeof e.status === "number" ? e.status : typeof e.code === "number" ? e.code : undefined;
  if (status === undefined) return false;
  if (RETRIABLE_STATUSES.has(status)) return true;
  // Google signals per-user rate limits as 403 with a rate reason
  if (status === 403) return RATE_REASONS.has(e.errors?.[0]?.reason ?? "");
  return false;
}

/**
 * Run a Google API call with exponential backoff + jitter.
 * Non-retriable errors (403 privilege, 404, invalid_grant, …) rethrow immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = base * 2 ** (attempt - 1);
      await sleep(backoff / 2 + Math.random() * (backoff / 2));
    }
    try {
      return await fn();
    } catch (err) {
      if (!isRetriableGoogleError(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
