import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarResources, confirmRotation } from "./CalendarResources";
import type { CalendarLinks } from "../types";

const links: CalendarLinks = {
  generalGoogleUrl: "https://calendar.google.com/calendar/embed?src=shared%40example.com",
  personalIcsUrl: "https://intercomunica.example/calendar/feed/mario-secret.ics",
  personalWebcalUrl: "webcal://intercomunica.example/calendar/feed/mario-secret.ics",
  personalFeedEligible: true,
  lastFetchedAt: null,
};

describe("CalendarResources", () => {
  it("keeps both calendar choices visible and sends the general choice to Google", () => {
    const html = renderToStaticMarkup(
      <CalendarResources links={links} onRotate={async () => links} />
    );

    expect(html).toContain("Collega calendario generale");
    expect(html).toContain("Collega il mio calendario");
    expect(html).toContain("calendar.google.com");
  });

  it("explains unavailable links instead of removing their choices", () => {
    const html = renderToStaticMarkup(
      <CalendarResources
        links={{
          generalGoogleUrl: null,
          personalIcsUrl: null,
          personalWebcalUrl: null,
          personalFeedEligible: false,
          lastFetchedAt: null,
        }}
        onRotate={async () => links}
      />
    );

    expect(html).toContain("Collega calendario generale");
    expect(html).toContain("Calendario generale non configurato");
    expect(html).toContain("Collega il mio calendario");
    expect(html).toContain("Il tuo calendario personale non è disponibile");
  });
});

describe("confirmRotation", () => {
  it("does not rotate a link when confirmation is rejected", async () => {
    let rotated = false;

    await confirmRotation(
      () => false,
      async () => {
        rotated = true;
      }
    );

    expect(rotated).toBe(false);
  });
});
