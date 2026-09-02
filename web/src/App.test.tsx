// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const logout = vi.fn();
let role: "ADMIN" | "TEACHER" = "ADMIN";

vi.mock("./auth", () => ({
  useAuth: () => ({
    me: {
      id: "user-1",
      email: "anna.rossi@rainerum.it",
      name: "Anna Rossi",
      picture: null,
      role,
      subgroups: [],
    },
    loading: false,
    logout,
  }),
}));

vi.mock("./pages/Bacheca", () => ({ default: () => <h1>Bacheca test</h1> }));
vi.mock("./pages/Directory", () => ({ default: () => <h1>Directory test</h1> }));
vi.mock("./pages/Calendario", () => ({ default: () => <h1>Calendario test</h1> }));
vi.mock("./pages/AdminSettings", () => ({ default: () => <h1>Impostazioni test</h1> }));

afterEach(() => {
  cleanup();
  logout.mockReset();
  role = "ADMIN";
});

describe("authenticated portal shell", () => {
  it("exposes responsive Rainerum branding, a skip target, and the current admin route", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={["/directory"]}>
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
    expect(screen.getByRole("link", { name: "Gruppi & Docenti" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Impostazioni" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Esci" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("keeps the settings destination hidden from teachers", () => {
    role = "TEACHER";
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "Impostazioni" })).toBeNull();
    expect(screen.getByRole("link", { name: "Bacheca" }).getAttribute("aria-current")).toBe("page");
  });
});
