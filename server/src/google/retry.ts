export interface RetryOptions {
  /** additional attempts after the first failure (default 4) */
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRIABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

interface GoogleApiError {
  status?: number;
  code?: number | string;
  errors?: { reason?: string }[];
  response?: {
    status?: number;
    data?: { error?: { errors?: { reason?: string }[] } };
  };
}

function googleErrorDetails(err: unknown): { status?: number; reason?: string } {
  if (typeof err !== "object" || err === null) return {};
  const error = err as GoogleApiError;
  const status = typeof error.status === "number"
    ? error.status
    : typeof error.code === "number"
      ? error.code
      : error.response?.status;
  const reason =
    error.response?.data?.error?.errors?.[0]?.reason ?? error.errors?.[0]?.reason;
  return { status, reason };
}

export function googleErrorStatus(err: unknown): number | undefined {
  return googleErrorDetails(err).status;
}

export function isCalendarUsageLimitError(err: unknown): boolean {
  const { status, reason } = googleErrorDetails(err);
  if (status === 429) return true;
  if (status !== 403) return false;
  return reason === "quotaExceeded" || RATE_REASONS.has(reason ?? "");
}

/** Transient Google API failures worth retrying (rate limits, server errors). */
export function isRetriableGoogleError(err: unknown): boolean {
  const { status, reason } = googleErrorDetails(err);
  if (status === undefined) return false;
  if (RETRIABLE_STATUSES.has(status)) return true;
  // Google signals per-user rate limits as 403 with a rate reason
  if (status === 403) return RATE_REASONS.has(reason ?? "");
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
