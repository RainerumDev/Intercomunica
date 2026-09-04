import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLinkPreview,
  fetchUsingValidatedAddresses,
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
  it("connects to the validated address while preserving the original host", async () => {
    let connectedAddress: string | undefined;
    let receivedHost: string | undefined;
    const server = createServer((request, response) => {
      connectedAddress = request.socket.localAddress;
      receivedHost = request.headers.host;
      response.end("pinned transport");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;

    try {
      const response = await fetchUsingValidatedAddresses(
        `http://rebind.invalid:${port}/preview`,
        { headers: { Accept: "text/html" } },
        [{ address: "127.0.0.1", family: 4 }]
      );

      expect(await response.text()).toBe("pinned transport");
      expect(connectedAddress).toBe("127.0.0.1");
      expect(receivedHost).toBe(`rebind.invalid:${port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/file",
    "https://user:secret@example.com/private",
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

  it("cancels redirect response bodies before following the next destination", async () => {
    let cancelled = false;
    const redirectBody = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const dependencies = previewDependencies([
      new Response(redirectBody, { status: 302, headers: { location: "/final" } }),
      new Response("<title>Final</title>", { headers: { "content-type": "text/html" } }),
    ]);

    await fetchLinkPreview("https://example.org", dependencies);

    expect(cancelled).toBe(true);
  });

  it("treats deprecated 192.88.99.0/24 relay addresses as non-public", async () => {
    const dependencies = previewDependencies([], async () => [
      { address: "192.88.99.1", family: 4 },
    ]);

    await expect(fetchLinkPreview("https://example.org", dependencies)).rejects.toBeInstanceOf(
      UnsafePreviewUrlError
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

  it("uses one signal for DNS, redirects, transport, and body reads", async () => {
    const signals: AbortSignal[] = [];
    const dependencies: LinkPreviewDependencies = {
      lookup: async () => PUBLIC_DNS_RESULT,
      fetch: async (_url, init) => {
        expect(init.redirect).toBe("manual");
        signals.push(init.signal as AbortSignal);
        expect(new Headers(init.headers).get("accept")).toBe("text/html");
        return signals.length === 1
          ? new Response(null, { status: 302, headers: { location: "/final" } })
          : new Response("<html></html>", { headers: { "content-type": "text/html" } });
      },
    };

    await fetchLinkPreview("https://example.org", dependencies);

    expect(signals).toHaveLength(2);
    expect(signals[0]).toBe(signals[1]);
  });

  it("bounds delayed DNS resolution with the overall deadline", async () => {
    vi.useFakeTimers();
    try {
      const dependencies: LinkPreviewDependencies = {
        lookup: () => new Promise(() => undefined),
        fetch: async () => {
          throw new Error("fetch must not start");
        },
      };
      const pending = fetchLinkPreview("https://example.org", dependencies);
      const rejection = expect(pending).rejects.toThrow(/timed out/i);

      await vi.advanceTimersByTimeAsync(5001);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts a real delayed local transport within the configured overall deadline", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      setTimeout(() => response.end("<title>Too late</title>"), 200);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;

    try {
      const dependencies: LinkPreviewDependencies = {
        deadlineMs: 50,
        lookup: async () => PUBLIC_DNS_RESULT,
        fetch: (url, init) => fetchUsingValidatedAddresses(
          url,
          init,
          [{ address: "127.0.0.1", family: 4 }]
        ),
      };

      const startedAt = Date.now();
      await expect(
        fetchLinkPreview(`http://transport.example:${port}/preview`, dependencies)
      ).rejects.toThrow(/timed out|abort/i);
      expect(Date.now() - startedAt).toBeLessThan(180);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
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

  it("resolves relative Open Graph images against the validated final page URL", async () => {
    const dependencies = previewDependencies([
      new Response(null, { status: 302, headers: { location: "/news/open-day" } }),
      new Response('<meta property="og:image" content="../images/open-day.jpg">', {
        headers: { "content-type": "text/html" },
      }),
    ]);

    expect(await fetchLinkPreview("https://example.org/articles/draft", dependencies)).toMatchObject({
      finalUrl: "https://example.org/news/open-day",
      imageUrl: "https://example.org/images/open-day.jpg",
    });
  });

  it.each([
    "   ",
    "data:image/png;base64,AAAA",
    "file:///etc/passwd",
    "ftp://images.example.org/open-day.jpg",
    "https://user:secret@images.example.org/open-day.jpg",
  ])("discards unsafe Open Graph image metadata %s", async (imageUrl) => {
    const dependencies = previewDependencies([
      new Response(`<meta property="og:image" content="${imageUrl}">`, {
        headers: { "content-type": "text/html" },
      }),
    ]);

    await expect(fetchLinkPreview("https://example.org/article", dependencies)).resolves.toMatchObject({
      imageUrl: null,
    });
  });

  it("keeps an HTTP Open Graph image as internal discovery data without resolving it", async () => {
    const lookup = vi.fn(async (hostname: string) => hostname === "images.example.org"
      ? [{ address: "10.0.0.8", family: 4 }]
      : PUBLIC_DNS_RESULT
    );
    const dependencies = previewDependencies([
      new Response('<meta property="og:image" content="https://images.example.org/private.png">', {
        headers: { "content-type": "text/html" },
      }),
    ], lookup);

    await expect(fetchLinkPreview("https://example.org/article", dependencies)).resolves.toMatchObject({
      imageUrl: "https://images.example.org/private.png",
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith("example.org");
  });

  it("allows exactly three redirects and validates every destination", async () => {
    const lookup = vi.fn(async () => PUBLIC_DNS_RESULT);
    const dependencies = previewDependencies([
      new Response(null, { status: 302, headers: { location: "https://one.example/step" } }),
      new Response(null, { status: 302, headers: { location: "https://two.example/step" } }),
      new Response(null, { status: 302, headers: { location: "https://three.example/final" } }),
      new Response("<title>Final</title>", { headers: { "content-type": "text/html" } }),
    ], lookup);

    await expect(fetchLinkPreview("https://start.example", dependencies)).resolves.toMatchObject({
      finalUrl: "https://three.example/final",
      title: "Final",
    });
    expect(lookup.mock.calls.map(([hostname]) => hostname)).toEqual([
      "start.example",
      "one.example",
      "two.example",
      "three.example",
    ]);
  });

  it("caps text metadata and discards oversized image metadata", async () => {
    const dependencies = previewDependencies([
      new Response(`
        <meta property="og:title" content="${"t".repeat(200)}">
        <meta property="og:description" content="${"d".repeat(600)}">
        <meta property="og:site_name" content="${"s".repeat(200)}">
        <meta property="og:image" content="https://images.example.org/${"i".repeat(2100)}.png">
      `, { headers: { "content-type": "text/html" } }),
    ]);

    const preview = await fetchLinkPreview("https://example.org/article", dependencies);

    expect(preview.title).toHaveLength(160);
    expect(preview.description).toHaveLength(500);
    expect(preview.siteName).toHaveLength(160);
    expect(preview.imageUrl).toBeNull();
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
