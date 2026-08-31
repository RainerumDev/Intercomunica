import { describe, expect, it } from "vitest";
import { asAllDayRange, commitPendingTag, toEventIso } from "./eventForm";

describe("event form helpers", () => {
  it("commits a normalized pending tag without duplicates", () => {
    expect(commitPendingTag(["RIUNIONI"], " corsi ")).toEqual(["RIUNIONI", "CORSI"]);
    expect(commitPendingTag(["RIUNIONI"], "riunioni")).toEqual(["RIUNIONI"]);
  });

  it("converts all-day values to UTC dates preserving exclusive end", () => {
    expect(toEventIso("2026-09-03", true)).toBe("2026-09-03T00:00:00.000Z");
    expect(toEventIso("2026-09-04", true)).toBe("2026-09-04T00:00:00.000Z");
  });

  it("makes a same-day all-day range end on the next exclusive date", () => {
    expect(asAllDayRange("2026-09-03T08:00", "2026-09-03T09:00")).toEqual({
      startsAt: "2026-09-03",
      endsAt: "2026-09-04",
    });
  });
});
