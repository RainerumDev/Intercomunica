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

function ruleDeclarations(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = mobileCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "u"));
  if (!match?.[1]) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

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
