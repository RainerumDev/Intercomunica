// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const logout = vi.fn();
let role: "ADMIN" | "TEACHER" = "ADMIN";
let signedIn = true;
let loading = false;

vi.mock("./auth", () => ({
  useAuth: () => ({
    me: signedIn
      ? {
          id: "user-1",
          email: "anna.rossi@rainerum.it",
          name: "Anna Rossi",
          picture: null,
          role,
          subgroups: [],
        }
      : null,
    loading,
    logout,
  }),
}));

vi.mock("./pages/Bacheca", () => ({ default: () => <h1>Bacheca test</h1> }));
vi.mock("./pages/Risorse", () => ({ default: () => <h1>Risorse test</h1> }));
vi.mock("./pages/Directory", () => ({ default: () => <h1>Directory test</h1> }));
vi.mock("./pages/Calendario", () => ({ default: () => <h1>Calendario test</h1> }));
vi.mock("./pages/AdminSettings", () => ({ default: () => <h1>Impostazioni test</h1> }));

afterEach(() => {
  cleanup();
  logout.mockReset();
  role = "ADMIN";
  signedIn = true;
  loading = false;
});

describe("authenticated portal shell", () => {
  it("exposes the five admin destinations and marks Risorse as the current route", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={["/risorse"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("banner")).toBeTruthy();
    const logos = screen.getAllByRole("img", { name: "Rainerum" });
    expect(logos).toHaveLength(2);
    expect(container.querySelector(".portal-brand__logo--desktop")?.getAttribute("src")).toBe(
      "/rainerum-logo-full.png",
    );
    expect(container.querySelector(".portal-brand__logo--mobile")?.getAttribute("src")).toBe(
      "/rainerum-logo-mark.png",
    );
    expect(screen.getByText("Intercomunica")).toBeTruthy();

    const skipLink = screen.getByRole("link", { name: "Vai al contenuto principale" });
    expect(skipLink.getAttribute("href")).toBe("#main-content");
    expect(container.querySelector("main#main-content")).toBeTruthy();

    const navigation = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(navigation).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Bacheca|Risorse|Calendario|Gruppi e docenti|Impostazioni/ }))
      .toHaveLength(5);
    expect(screen.getByRole("link", { name: "Risorse" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Impostazioni" })).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Termini di servizio" }).getAttribute("href")).toBe(
      "/terms",
    );

    await user.click(screen.getByRole("button", { name: "Esci" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("exposes exactly four destinations and hides settings from teachers", () => {
    role = "TEACHER";
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "Impostazioni" })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Bacheca|Risorse|Calendario|Gruppi e docenti/ })).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Bacheca" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("public portal routes", () => {
  it("renders privacy without waiting for or requiring an authenticated session", () => {
    signedIn = false;
    loading = true;

    render(
      <MemoryRouter initialEntries={["/privacy"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Informativa privacy di Intercomunica" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Intercomunica" })).toBeNull();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Termini di servizio" }).getAttribute("href")).toBe(
      "/terms",
    );
  });

  it("renders terms without redirecting an anonymous visitor to login", () => {
    signedIn = false;

    render(
      <MemoryRouter initialEntries={["/terms"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Termini di servizio di Intercomunica" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Accedi con Google" })).toBeNull();
  });

  it.each([
    ["/privacy/", "Informativa privacy di Intercomunica"],
    ["/terms/", "Termini di servizio di Intercomunica"],
  ])("normalizes the anonymous legal route %s", (path, heading) => {
    signedIn = false;
    loading = true;

    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows legal footer links on the anonymous login route", () => {
    signedIn = false;

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Intercomunica" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(screen.getByRole("link", { name: "Termini di servizio" }).getAttribute("href")).toBe(
      "/terms",
    );
  });

  it("uses the official Rainerum mark as the PNG favicon", () => {
    const document = new DOMParser().parseFromString(
      readFileSync(resolve(process.cwd(), "index.html"), "utf8"),
      "text/html",
    );

    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(favicon?.type).toBe("image/png");
    expect(favicon?.getAttribute("href")).toBe("/rainerum-logo-mark.png");
  });
});
