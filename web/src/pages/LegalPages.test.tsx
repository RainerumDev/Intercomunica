// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import LegalFooter from "../components/LegalFooter";
import Privacy from "./Privacy";
import Terms from "./Terms";

afterEach(cleanup);

function renderInRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("Intercomunica legal pages", () => {
  it("identifies Rainerum as controller and Kevin Delugan Dev only as technical provider", () => {
    renderInRouter(<Privacy />);

    expect(screen.getByRole("heading", { name: "Titolare del trattamento" })).toBeTruthy();
    expect(screen.getByText(/Rainerum è il titolare del trattamento/i)).toBeTruthy();
    expect(screen.getByText(/Kevin Delugan Dev è il fornitore tecnico/i)).toBeTruthy();
    expect(screen.getByText(/soltanto se formalizzato per iscritto/i)).toBeTruthy();

    const technicalContacts = screen.getAllByRole("link", {
      name: "intercomunica.rainerum@delugan.net",
    });
    expect(technicalContacts.length).toBeGreaterThan(0);
    expect(
      technicalContacts.every(
        (link) => link.getAttribute("href") === "mailto:intercomunica.rainerum@delugan.net",
      ),
    ).toBe(true);
  });

  it("describes only the data and integrations implemented by Intercomunica", () => {
    renderInRouter(<Privacy />);

    expect(screen.getByText(/profilo Google/i)).toBeTruthy();
    expect(screen.getByText(/eventi e calendari/i)).toBeTruthy();
    expect(screen.getByText(/risorse condivise/i)).toBeTruthy();
    expect(screen.getByText(/Google Calendar/i)).toBeTruthy();
    expect(screen.getByText(/Gmail/i)).toBeTruthy();
    expect(screen.getByText(/devono essere confermati dal Rainerum/i)).toBeTruthy();
  });

  it.each([
    {
      access: /soltanto agli amministratori/i,
      data: /nomi e cognomi degli studenti.*email.*classe.*tutori.*nome.*email/i,
      heading: "Anagrafica studenti e tutori",
      purpose: /gestire l’anagrafica scolastica/i,
      route: "/api/wip/students",
    },
    {
      access: /utenti autenticati/i,
      data: /data di nascita.*onomastico/i,
      heading: "Compleanni e onomastici",
      purpose: /compleanni del giorno/i,
      route: "/api/wip/birthdays/today",
    },
    {
      access: /feed RSS.*token statico/i,
      data: /nome.*docente o studente.*classe/i,
      heading: "Bacheca e digital signage",
      purpose: /distribuire i compleanni del giorno/i,
      route: "/api/wip/birthdays/rss",
    },
    {
      access: /soltanto agli amministratori/i,
      data: /sistema sorgente.*payload JSON/i,
      heading: "Importazione dell’orario",
      purpose: /registrare l’importazione.*conversione/i,
      route: "/api/wip/timetable/import",
    },
  ])("documents the active treatment exposed by $route", ({ access, data, heading, purpose }) => {
    renderInRouter(<Privacy />);

    const treatmentHeading = screen.getByRole("heading", { name: heading });
    const treatment = treatmentHeading.closest("section");

    expect(treatment?.textContent).toMatch(data);
    expect(treatment?.textContent).toMatch(purpose);
    expect(treatment?.textContent).toMatch(access);
  });

  it("states the client-provider allocation in the terms without inventing a court", () => {
    const { container } = renderInRouter(<Terms />);

    expect(screen.getByText(/Rainerum è il cliente/i)).toBeTruthy();
    expect(screen.getByText(/Kevin Delugan Dev ne cura la fornitura tecnica/i)).toBeTruthy();
    expect(screen.getByText(/restano sotto la responsabilità del Rainerum/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "intercomunica.rainerum@delugan.net" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/foro competente/i);
  });

  it("links both public legal pages from the shared footer", () => {
    renderInRouter(<LegalFooter />);

    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Informazioni legali" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Termini di servizio" }).getAttribute("href")).toBe(
      "/terms",
    );
  });
});
