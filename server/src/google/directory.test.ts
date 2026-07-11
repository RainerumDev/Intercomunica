import { describe, it, expect } from "vitest";
import { extractMemberEmails } from "./directory.js";

describe("extractMemberEmails (Cloud Identity memberships → docenti)", () => {
  it("keeps USER members and those without explicit type", () => {
    const out = extractMemberEmails([
      { type: "USER", preferredMemberKey: { id: "Mario.Rossi@rainerum.it" } },
      { preferredMemberKey: { id: "anna.bianchi@rainerum.it" } },
    ]);
    expect(out).toEqual([
      { email: "mario.rossi@rainerum.it" },
      { email: "anna.bianchi@rainerum.it" },
    ]);
  });

  it("skips nested groups, service accounts and malformed keys", () => {
    const out = extractMemberEmails([
      { type: "GROUP", preferredMemberKey: { id: "staff@rainerum.it" } },
      { type: "SERVICE_ACCOUNT", preferredMemberKey: { id: "bot@project.iam.gserviceaccount.com" } },
      { type: "USER", preferredMemberKey: { id: "" } },
      { type: "USER" },
      { type: "USER", preferredMemberKey: { id: "no-at-sign" } },
    ]);
    expect(out).toEqual([]);
  });

  it("dedupes case-insensitively", () => {
    const out = extractMemberEmails([
      { type: "USER", preferredMemberKey: { id: "x@rainerum.it" } },
      { type: "USER", preferredMemberKey: { id: "X@Rainerum.it" } },
    ]);
    expect(out).toHaveLength(1);
  });
});
