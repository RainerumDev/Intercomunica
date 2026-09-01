// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import Login from "./Login";

afterEach(cleanup);

describe("Login", () => {
  it("uses the official responsive Rainerum brand without changing the Google login destination", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("img", { name: "Rainerum" })).toHaveLength(2);
    expect(container.querySelector(".login-brand__logo--desktop")?.getAttribute("src")).toBe(
      "/rainerum-logo-full.png",
    );
    expect(container.querySelector(".login-brand__logo--mobile")?.getAttribute("src")).toBe(
      "/rainerum-logo-mark.png",
    );
    expect(screen.getByRole("heading", { name: "Intercomunica" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Accedi con Google" }).getAttribute("href")).toBe(
      "/api/auth/google",
    );
  });
});
