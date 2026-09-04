import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

function blockContents(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing CSS block for ${marker}`);
  const openingBrace = source.indexOf("{", markerIndex);
  let depth = 1;
  for (let index = openingBrace + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  throw new Error(`Unclosed CSS block for ${marker}`);
}

const mobileCss = blockContents(css, "@media (max-width: 767px)");
const desktopDirectoryCss = blockContents(css, "@media (min-width: 1024px)");

function ruleDeclarationsFrom(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matches = [...source.matchAll(new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, "gu"))];
  const declarations = matches.at(-1)?.[1];
  if (!declarations) throw new Error(`Missing CSS rule for ${selector}`);
  return declarations;
}

function ruleDeclarations(selector: string): string {
  return ruleDeclarationsFrom(mobileCss, selector);
}

function propertyValue(declarations: string, property: string): string {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const value = declarations.match(
    new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+)`, "u")
  )?.[1]?.trim();
  if (!value) throw new Error(`Missing CSS property ${property}`);
  return value;
}

function cascadedProperty(selector: string, property: string): string {
  const sources = [css.slice(0, css.indexOf("@media (min-width: 1024px)")), mobileCss];
  let value: string | null = null;
  for (const source of sources) {
    try {
      value = propertyValue(ruleDeclarationsFrom(source, selector), property);
    } catch {
      // The selector or property can be inherited from the earlier cascade layer.
    }
  }
  if (!value) throw new Error(`Missing cascaded CSS property ${property} for ${selector}`);
  return value;
}

function evaluateViewportHeight(value: string, viewportHeight: number, safeAreaInset: number): number {
  expect(value).toContain("100dvh");
  expect(value).toContain("env(safe-area-inset-bottom)");

  const fixedSubtractions = [...value.matchAll(/-\s*([\d.]+)(rem|px)/gu)]
    .reduce((total, [, amount, unit]) => total + Number(amount) * (unit === "rem" ? 16 : 1), 0);
  return viewportHeight - fixedSubtractions - safeAreaInset;
}

describe("responsive CSS test helpers", () => {
  it("matches complete declaration names rather than property suffixes", () => {
    expect(propertyValue("border-top: 1px solid; top: 5rem;", "top")).toBe("5rem");
    expect(propertyValue("max-height: 99px; min-height: 44px;", "min-height")).toBe("44px");
    expect(() => propertyValue("max-height: 99px;", "height")).toThrow("Missing CSS property height");
  });
});

describe("mobile responsive controls", () => {
  it("gives Bacheca and Risorse search controls and event expansion 44px targets", () => {
    expect(ruleDeclarations(".search-control .form-control")).toContain("min-block-size: 44px");

    const shortActions = ruleDeclarations(".search-control .text-action,\n  .event-stream__more");
    expect(shortActions).toContain("min-block-size: 44px");
    expect(shortActions).toContain("min-inline-size: 44px");
  });
});

describe("authenticated mobile shell", () => {
  it("reserves fixed-navigation clearance after the footer without doubling main padding", () => {
    const shell = ruleDeclarations(".portal-shell--authenticated");
    expect(shell).toContain("padding-bottom: calc(2.75rem + 2px + env(safe-area-inset-bottom))");

    const main = ruleDeclarations(".portal-main");
    expect(main).toContain("padding-bottom: 4rem");
    expect(main).not.toContain("5.5rem");
  });
});

describe("responsive teacher directory", () => {
  it("keeps a 14-letter alphabet rail above the fixed navigation at common mobile heights", () => {
    const commonMobileGeometries = [
      { height: 568, safeAreaInset: 0 },
      { height: 667, safeAreaInset: 34 },
    ];
    const stickyOffset = Number.parseFloat(cascadedProperty(".teacher-alphabet", "top")) * 16;
    const navTargetHeight = Number.parseFloat(propertyValue(ruleDeclarations(".portal-nav__link"), "min-height"));
    const navBorderHeight = Number.parseFloat(propertyValue(ruleDeclarations(".portal-nav"), "border-top"));
    const maxHeight = cascadedProperty(".teacher-alphabet", "max-height");
    const overflow = cascadedProperty(".teacher-alphabet", "overflow-y");
    const targetStackHeight = 14 * 44;

    commonMobileGeometries.forEach(({ height, safeAreaInset }) => {
      const railHeight = evaluateViewportHeight(maxHeight, height, safeAreaInset);
      const fixedNavTop = height - navTargetHeight - navBorderHeight - safeAreaInset;
      expect(stickyOffset + railHeight).toBeLessThanOrEqual(fixedNavTop);
      expect(railHeight).toBeGreaterThanOrEqual(44);
      expect(targetStackHeight).toBeGreaterThan(railHeight);
    });
    expect(overflow).toBe("auto");

    const targets = ruleDeclarationsFrom(css, ".teacher-alphabet a");
    expect(targets).toContain("min-width: 44px");
    expect(targets).toContain("min-height: 44px");

    const body = ruleDeclarationsFrom(css, ".teacher-directory__body");
    expect(body).toContain("grid-template-columns: minmax(0, 1fr) 44px");
  });

  it("returns the rail to normal flow immediately below its safe sticky-height boundary", () => {
    const shortHeightMedia = css.match(
      /@media \(max-width: 767px\) and \(max-height: ([\d.]+)px\)/u
    );
    expect(shortHeightMedia).not.toBeNull();
    const boundary = Number(shortHeightMedia?.[1]);
    const safeAreaInset = 34;
    const stickyOffset = Number.parseFloat(cascadedProperty(".teacher-alphabet", "top")) * 16;
    const navTargetHeight = Number.parseFloat(propertyValue(ruleDeclarations(".portal-nav__link"), "min-height"));
    const navBorderHeight = Number.parseFloat(propertyValue(ruleDeclarations(".portal-nav"), "border-top"));
    const maxHeight = cascadedProperty(".teacher-alphabet", "max-height");
    const minimumStickyHeight = stickyOffset + navTargetHeight + navBorderHeight + safeAreaInset + 44;

    expect(boundary).toBeGreaterThanOrEqual(minimumStickyHeight);
    expect(evaluateViewportHeight(maxHeight, boundary + 1, safeAreaInset)).toBeGreaterThanOrEqual(44);
    expect(evaluateViewportHeight(maxHeight, boundary - 1, safeAreaInset)).toBeLessThan(44);

    const fallbackCss = blockContents(css, shortHeightMedia?.[0] ?? "");
    const fallback = ruleDeclarationsFrom(fallbackCss, ".teacher-alphabet");
    expect(propertyValue(fallback, "position")).toBe("static");
    expect(propertyValue(fallback, "max-height")).toBe("none");
    expect(propertyValue(fallback, "overflow-y")).toBe("visible");
  });

  it("lets a tall desktop teacher detail continue in normal document flow", () => {
    const detail = ruleDeclarationsFrom(desktopDirectoryCss, ".directory-detail-pane");
    expect(detail).not.toContain("position: sticky");
    expect(detail).not.toContain("max-height:");
    expect(detail).not.toContain("overflow-y: auto");
  });
});
