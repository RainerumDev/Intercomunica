import { describe, it, expect } from "vitest";
import { renderCalendarName, DEFAULT_CALENDAR_TEMPLATE } from "./calendarName.js";

describe("renderCalendarName", () => {
  const teacher = { name: "Mario Rossi", email: "mario.rossi@rainerum.it" };

  it("replaces {nome} with the teacher display name", () => {
    expect(renderCalendarName("Calendario Rainerum 26/27 - {nome}", teacher)).toBe(
      "Calendario Rainerum 26/27 - Mario Rossi"
    );
  });

  it("falls back to email when name is missing", () => {
    expect(renderCalendarName("{nome}", { name: null, email: "x@rainerum.it" })).toBe("x@rainerum.it");
    expect(renderCalendarName("{nome}", { name: "  ", email: "x@rainerum.it" })).toBe("x@rainerum.it");
  });

  it("uses the default template when none configured", () => {
    expect(renderCalendarName(null, teacher)).toBe(
      DEFAULT_CALENDAR_TEMPLATE.replaceAll("{nome}", "Mario Rossi")
    );
    expect(renderCalendarName("   ", teacher)).toBe(
      DEFAULT_CALENDAR_TEMPLATE.replaceAll("{nome}", "Mario Rossi")
    );
  });

  it("replaces every occurrence and supports {email}", () => {
    expect(renderCalendarName("{nome} ({email}) - {nome}", teacher)).toBe(
      "Mario Rossi (mario.rossi@rainerum.it) - Mario Rossi"
    );
  });

  it("keeps templates without placeholders as-is", () => {
    expect(renderCalendarName("Calendario unico", teacher)).toBe("Calendario unico");
  });
});
