import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import * as apiModule from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API authentication", () => {
  it("notifies the application immediately when a request is unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Autenticazione richiesta" }),
      })
    );
    const listener = vi.fn();
    const subscribe = (
      apiModule as typeof apiModule & {
        onUnauthorized: (callback: () => void) => () => void;
      }
    ).onUnauthorized;
    const unsubscribe = subscribe(listener);

    await expect(api.get("/api/protected")).rejects.toMatchObject({ status: 401 });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
