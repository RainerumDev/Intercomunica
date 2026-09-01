import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLinkPreview,
  UnsafePreviewUrlError,
  type LinkPreviewDependencies,
} from "./linkPreview.js";

const PUBLIC_DNS_RESULT = [{ address: "93.184.216.34", family: 4 as const }];

function previewDependencies(
  responses: Response[],
  lookup: LinkPreviewDependencies["lookup"] = async () => PUBLIC_DNS_RESULT
): LinkPreviewDependencies {
  return {
    lookup,
    fetch: async () => {
      const response = responses.shift();
      if (!response) throw new Error("Unexpected fetch");
      return response;
    },
  };
}

const fakePublicDependencies = previewDependencies([]);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchLinkPreview security boundary", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/file",
    "http://127.0.0.1",
    "http://[::1]",
    "http://[::127.0.0.1]",
  ])(
    "rejects unsafe preview destination %s",
    async (url) =>
      expect(fetchLinkPreview(url, fakePublicDependencies)).rejects.toBeInstanceOf(
        UnsafePreviewUrlError
      )
  );

  it.each([
    { addresses: [{ address: "10.0.0.8", family: 4 as const }] },
    { addresses: [{ address: "fd00::8", family: 6 as const }] },
    {
      addresses: [
        { address: "93.184.216.34", family: 4 as const },
        { address: "fe80::8", family: 6 as const },
      ],
    },
  ])("rejects DNS results containing a non-public address", async ({ addresses }) => {
    const dependencies = previewDependencies([], async () => addresses);

    await expect(fetchLinkPreview("https://example.org", dependencies)).rejects.toBeInstanceOf(
      UnsafePreviewUrlError
    );
  });

  it("revalidates a redirect destination", async () => {
    const dependencies = previewDependencies([
      new Response(null, { status: 302, headers: { location: "http://10.0.0.8/private" } }),
    ]);
    await expect(fetchLinkPreview("https://example.org", dependencies)).rejects.toBeInstanceOf(
      UnsafePreviewUrlError
    );
  });

  it("rejects more than three redirects", async () => {
    const dependencies = previewDependencies([
      new Response(null, { status: 302, headers: { location: "/one" } }),
      new Response(null, { status: 302, headers: { location: "/two" } }),
      new Response(null, { status: 302, headers: { location: "/three" } }),
      new Response(null, { status: 302, headers: { location: "/four" } }),
    ]);

    await expect(fetchLinkPreview("https://example.org", dependencies)).rejects.toThrow(
      /redirect/i
    );
  });

  it("rejects non-HTML responses", async () => {
    const dependencies = previewDependencies([
      new Response('{"title":"not html"}', {
        headers: { "content-type": "application/json" },
      }),
    ]);

    await expect(fetchLinkPreview("https://example.org", dependencies)).rejects.toThrow(/HTML/i);
  });

  it("rejects response bodies over 1 MiB", async () => {
    const dependencies = previewDependencies([
      new Response(new Uint8Array(1_048_577), {
        headers: { "content-type": "text/html" },
      }),
    ]);

    await expect(fetchLinkPreview("https://example.org", dependencies)).rejects.toThrow(/1 MiB/i);
  });

  it("uses a manual HTML request with a five-second timeout", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    const dependencies: LinkPreviewDependencies = {
      lookup: async () => PUBLIC_DNS_RESULT,
      fetch: async (_url, init) => {
        expect(init.redirect).toBe("manual");
        expect(init.signal).toBe(timeoutSignal);
        expect(new Headers(init.headers).get("accept")).toBe("text/html");
        return new Response("<html></html>", { headers: { "content-type": "text/html" } });
      },
    };

    await fetchLinkPreview("https://example.org", dependencies);

    expect(timeout).toHaveBeenCalledWith(5000);
  });
});

describe("fetchLinkPreview metadata extraction", () => {
  it("extracts Open Graph metadata with mixed attribute order and quote styles", async () => {
    const html = `
      <html>
        <head>
          <meta content='Open&nbsp;day 2026' property="og:title">
          <meta property='og:description' content="Programma e prenotazioni">
          <meta content="https://cdn.example.org/open-day.jpg" property='og:image'>
          <meta property="og:site_name" content='Rainerum'>
        </head>
      </html>
    `;
    const dependencies = previewDependencies([
      new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    ]);

    expect(await fetchLinkPreview("https://example.org/article", dependencies)).toEqual({
      finalUrl: "https://example.org/article",
      title: "Open day 2026",
      description: "Programma e prenotazioni",
      imageUrl: "https://cdn.example.org/open-day.jpg",
      siteName: "Rainerum",
    });
  });

  it("falls back to a normalized title element", async () => {
    const dependencies = previewDependencies([
      new Response("<html><head><title>  Porte &amp; finestre\n 2026  </title></head></html>", {
        headers: { "content-type": "text/html" },
      }),
    ]);

    expect(await fetchLinkPreview("https://example.org/article", dependencies)).toMatchObject({
      title: "Porte & finestre 2026",
    });
  });

  it("resolves relative Open Graph images against the final URL", async () => {
    const dependencies = previewDependencies([
      new Response('<meta property="og:image" content="../images/open-day.jpg">', {
        headers: { "content-type": "text/html" },
      }),
    ]);

    expect(await fetchLinkPreview("https://example.org/articles/open-day", dependencies)).toMatchObject({
      imageUrl: "https://example.org/images/open-day.jpg",
    });
  });

  it("returns nulls when metadata is missing", async () => {
    const dependencies = previewDependencies([
      new Response("<html><body>Open day</body></html>", {
        headers: { "content-type": "text/html" },
      }),
    ]);

    expect(await fetchLinkPreview("https://example.org/article", dependencies)).toEqual({
      finalUrl: "https://example.org/article",
      title: null,
      description: null,
      imageUrl: null,
      siteName: null,
    });
  });
});
