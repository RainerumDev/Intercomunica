import { describe, expect, it } from "vitest";

describe("general calendar synchronization rules", () => {
  it("starts an initial synchronization exactly 30 days in the past", async () => {
    const { initialSyncTimeMin } = await import("./generalCalendarSync.js");
    const now = new Date("2026-08-31T12:00:00.000Z");
    expect(initialSyncTimeMin(now).toISOString()).toBe("2026-08-01T12:00:00.000Z");
  });

  it("maps external events to global teacher distribution", async () => {
    const { importedEventDefaults } = await import("./generalCalendarSync.js");
    expect(importedEventDefaults()).toEqual({
      isGlobal: true,
      bachecaOnly: false,
      subgroupIds: [],
    });
  });

  it("preserves app distribution when Google echoes an app-managed event", async () => {
    const { distributionForGoogleEvent } = await import("./generalCalendarSync.js");
    expect(
      distributionForGoogleEvent("app-event", {
        isGlobal: false,
        bachecaOnly: false,
        subgroupIds: ["classe-1a"],
      })
    ).toEqual({ isGlobal: false, bachecaOnly: false, subgroupIds: ["classe-1a"] });
  });
});
