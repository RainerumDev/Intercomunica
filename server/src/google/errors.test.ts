import { describe, it, expect } from "vitest";
import { mapGoogleError } from "./errors.js";

function gaxios(status: number, url: string, message = "err"): unknown {
  return { status, message, config: { url } };
}

describe("mapGoogleError", () => {
  it("maps Directory 403 to actionable admin-privilege message", () => {
    const m = mapGoogleError(
      gaxios(403, "https://admin.googleapis.com/admin/directory/v1/groups?customer=my_customer")
    );
    expect(m?.httpStatus).toBe(403);
    expect(m?.body.code).toBe("DIRECTORY_FORBIDDEN");
    expect(m?.body.error).toContain("Admin API → Gruppi → Lettura");
  });

  it("maps Gmail 403 to scope message", () => {
    const m = mapGoogleError(gaxios(403, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"));
    expect(m?.body.code).toBe("GMAIL_FORBIDDEN");
  });

  it("maps generic googleapis 403", () => {
    const m = mapGoogleError(gaxios(403, "https://www.googleapis.com/calendar/v3/calendars"));
    expect(m?.body.code).toBe("GOOGLE_FORBIDDEN");
  });

  it("maps invalid_grant to MASTER_TOKEN_REVOKED regardless of url", () => {
    const m = mapGoogleError({ message: "invalid_grant", status: 400 });
    expect(m?.httpStatus).toBe(409);
    expect(m?.body.code).toBe("MASTER_TOKEN_REVOKED");
  });

  it("maps 401 to reconnect and 429 to rate limit", () => {
    expect(mapGoogleError(gaxios(401, "https://admin.googleapis.com/x"))?.body.code).toBe(
      "MASTER_TOKEN_REVOKED"
    );
    const rate = mapGoogleError(gaxios(429, "https://www.googleapis.com/calendar/v3/x"));
    expect(rate?.httpStatus).toBe(503);
    expect(rate?.body.code).toBe("GOOGLE_RATE_LIMITED");
  });

  it("ignores non-Google errors", () => {
    expect(mapGoogleError(new Error("boom"))).toBeNull();
    expect(mapGoogleError({ status: 403, config: { url: "https://example.com" } })).toBeNull();
    expect(mapGoogleError(null)).toBeNull();
    expect(mapGoogleError("string")).toBeNull();
  });
});
