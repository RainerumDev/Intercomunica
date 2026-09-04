// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SharedResource } from "../types";
import ResourceCard from "./ResourceCard";
import { emptyResourceDraft } from "./resourceForm";

const persistedResource: SharedResource = {
  id: "resource-1",
  url: "https://www.example.org/guide",
  title: "Guida",
  description: "Una risorsa utile",
  previewEnabled: true,
  previewImageUrl: null,
  hasPreviewImage: true,
  previewSiteName: null,
  previewFetchedAt: "2026-09-04T08:00:00.000Z",
  isGlobal: true,
  sortOrder: 0,
  createdAt: "2026-09-04T08:00:00.000Z",
  updatedAt: "2026-09-04T08:00:00.000Z",
  subgroupIds: [],
};

afterEach(cleanup);

describe("ResourceCard", () => {
  it("renders a persisted preview through the local authenticated endpoint", () => {
    render(<ResourceCard resource={{
      ...persistedResource,
      id: "resource/1",
      previewImageUrl: "https://images.example.org/external.png",
    }} />);

    const image = document.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/api/resources/resource%2F1/preview-image");
    expect(image?.getAttribute("onerror")).toBeNull();
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("decoding")).toBe("async");
    expect(screen.queryByText("example.org")).toBeNull();
  });

  it("keeps the hostname fallback when a persisted resource has no image", () => {
    render(<ResourceCard resource={{ ...persistedResource, hasPreviewImage: false }} />);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("example.org")).toBeTruthy();
  });

  it("keeps ID-less admin previews unlinked and on the text fallback", () => {
    render(
      <ResourceCard
        resource={{
          ...emptyResourceDraft,
          url: "https://www.example.org/guide",
          title: "Bozza",
          previewEnabled: true,
          previewImageUrl: "https://images.example.org/external.png",
        }}
        linked={false}
      />
    );

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("example.org")).toBeTruthy();
    expect(document.querySelector("a")).toBeNull();
  });

  it("preserves safe external link attributes", () => {
    render(<ResourceCard resource={persistedResource} />);

    const link = screen.getByRole("link", { name: /Guida/ });
    expect(link.getAttribute("href")).toBe("https://www.example.org/guide");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
