import { describe, expect, it } from "vitest";
import { requireIntegrationDatabaseUrl } from "./integrationDatabaseUrl.js";

describe("integration database configuration", () => {
  it("fails clearly instead of falling back when the integration URL is missing", () => {
    expect(() => requireIntegrationDatabaseUrl({})).toThrow(
      /INTERCOMUNICA_INTEGRATION_DATABASE_URL is required.*disposable PostgreSQL database/i
    );
    expect(() => requireIntegrationDatabaseUrl({
      INTERCOMUNICA_INTEGRATION_DATABASE_URL: "   ",
    })).toThrow(/INTERCOMUNICA_INTEGRATION_DATABASE_URL is required/i);
  });

  it("returns the explicitly configured integration URL", () => {
    const url = "postgresql://integration:secret@localhost:55432/intercomunica_test";

    expect(requireIntegrationDatabaseUrl({
      INTERCOMUNICA_INTEGRATION_DATABASE_URL: url,
    })).toBe(url);
  });
});
