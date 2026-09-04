import { describe, expect, it } from "vitest";
import {
  emptyResourceDraft,
  moveResourceId,
  normalizeResourceDraft,
  resourceCardFallback,
} from "./resourceForm";

describe("resource form helpers", () => {
  it("provides an empty draft with the server input shape", () => {
    expect(emptyResourceDraft).toEqual({
      url: "",
      title: "",
      description: null,
      previewEnabled: false,
      previewImageUrl: null,
      previewSiteName: null,
      isGlobal: true,
      subgroupIds: [],
    });
  });

  it("trims text, drops external preview images, deduplicates subgroups, and clears global recipients", () => {
    expect(normalizeResourceDraft({
      ...emptyResourceDraft,
      url: " https://www.example.org/guide ",
      title: " A guide ",
      description: " description ",
      previewEnabled: true,
      previewImageUrl: " https://example.org/image.png ",
      previewSiteName: " Example ",
      isGlobal: false,
      subgroupIds: [" g1 ", "g1", "g2 "],
    })).toEqual({
      url: "https://www.example.org/guide",
      title: "A guide",
      description: "description",
      previewEnabled: true,
      previewImageUrl: null,
      previewSiteName: "Example",
      isGlobal: false,
      subgroupIds: ["g1", "g2"],
    });

    expect(normalizeResourceDraft({
      ...emptyResourceDraft,
      isGlobal: true,
      subgroupIds: [" g1 "],
    }).subgroupIds).toEqual([]);
  });

  it("clears preview metadata when preview is disabled", () => {
    expect(normalizeResourceDraft({
      ...emptyResourceDraft,
      previewImageUrl: " https://example.org/image.png ",
      previewSiteName: " Example ",
      previewEnabled: false,
    })).toMatchObject({ previewImageUrl: null, previewSiteName: null });
  });

  it("moves IDs within first and last boundaries without mutating input", () => {
    const ids = ["a", "b", "c"];
    expect(moveResourceId(ids, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveResourceId(ids, "a", "up")).toEqual(ids);
    expect(moveResourceId(ids, "c", "down")).toEqual(ids);
    expect(moveResourceId(ids, "b", "down")).toEqual(["a", "c", "b"]);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("uses preview site name or a www-free URL hostname for cards", () => {
    const resourceWithExternalMetadata = {
      previewSiteName: null,
      previewImageUrl: "https://images.example.org/external.png",
      url: "https://www.example.org/a",
    };
    expect(resourceCardFallback({ previewSiteName: "Example", url: "https://www.example.org/a" })).toBe("Example");
    expect(resourceCardFallback({ previewSiteName: null, url: "https://www.example.org/a" })).toBe("example.org");
    expect(resourceCardFallback(resourceWithExternalMetadata)).toBe("example.org");
  });

  it("returns a safe textual fallback for malformed URLs", () => {
    expect(resourceCardFallback({ previewSiteName: null, url: "not a URL" })).toBe("not a URL");
  });

  it("preserves the input object and subgroup array during normalization", () => {
    const subgroupIds = [" g1 ", "g1"];
    const draft = { ...emptyResourceDraft, subgroupIds, isGlobal: false };
    const before = { ...draft, subgroupIds: [...subgroupIds] };

    normalizeResourceDraft(draft);

    expect(draft).toEqual(before);
    expect(draft.subgroupIds).toBe(subgroupIds);
  });
});
