import { describe, it, expect, vi } from "vitest";
import { withRetry, isCalendarUsageLimitError, isRetriableGoogleError } from "./retry.js";

const noSleep = () => Promise.resolve();

describe("isRetriableGoogleError", () => {
  it("retries 429 and 5xx", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isRetriableGoogleError({ status })).toBe(true);
    }
  });

  it("retries 403 only with rate-limit reason", () => {
    expect(isRetriableGoogleError({ status: 403, errors: [{ reason: "rateLimitExceeded" }] })).toBe(true);
    expect(isRetriableGoogleError({ status: 403, errors: [{ reason: "userRateLimitExceeded" }] })).toBe(true);
    expect(isRetriableGoogleError({ status: 403, errors: [{ reason: "quotaExceeded" }] })).toBe(false);
    expect(isRetriableGoogleError({ status: 403, errors: [{ reason: "forbidden" }] })).toBe(false);
    expect(isRetriableGoogleError({ status: 403 })).toBe(false);
  });

  it("recognizes long-lived Calendar usage limits", () => {
    for (const error of [
      { status: 429 },
      { status: 403, errors: [{ reason: "quotaExceeded" }] },
      { status: 403, errors: [{ reason: "rateLimitExceeded" }] },
      { status: 403, errors: [{ reason: "userRateLimitExceeded" }] },
    ]) {
      expect(isCalendarUsageLimitError(error)).toBe(true);
    }
    expect(
      isCalendarUsageLimitError({ status: 403, errors: [{ reason: "forbidden" }] })
    ).toBe(false);
  });

  it("does not retry 4xx client errors or non-Google errors", () => {
    expect(isRetriableGoogleError({ status: 400 })).toBe(false);
    expect(isRetriableGoogleError({ status: 404 })).toBe(false);
    expect(isRetriableGoogleError(new Error("boom"))).toBe(false);
    expect(isRetriableGoogleError(null)).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns on first success without sleeping", async () => {
    const sleep = vi.fn(noSleep);
    const result = await withRetry(async () => 42, { sleep });
    expect(result).toBe(42);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries transient failures then succeeds", async () => {
    const sleep = vi.fn(noSleep);
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 429 };
        return "ok";
      },
      { sleep }
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("applies exponential backoff", async () => {
    const delays: number[] = [];
    const sleep = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };
    await withRetry(
      async () => {
        if (delays.length < 3) throw { status: 503 };
        return "ok";
      },
      { sleep, baseDelayMs: 100 }
    );
    // jittered within [backoff/2, backoff]
    expect(delays[0]).toBeGreaterThanOrEqual(50);
    expect(delays[0]).toBeLessThanOrEqual(100);
    expect(delays[1]).toBeGreaterThanOrEqual(100);
    expect(delays[1]).toBeLessThanOrEqual(200);
    expect(delays[2]).toBeGreaterThanOrEqual(200);
    expect(delays[2]).toBeLessThanOrEqual(400);
  });

  it("rethrows non-retriable errors immediately", async () => {
    const sleep = vi.fn(noSleep);
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 403, errors: [{ reason: "forbidden" }] };
        },
        { sleep }
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after exhausting retries", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 429 };
        },
        { sleep: noSleep, retries: 2 }
      )
    ).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(3); // 1 initial + 2 retries
  });
});
