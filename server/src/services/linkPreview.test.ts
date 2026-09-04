import { once } from "node:events";
import { lookup as osLookup } from "node:dns/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAbortableDnsLookup,
  fetchLinkPreview,
  fetchUsingValidatedAddresses,
  UnsafePreviewUrlError,
  type LinkPreviewDependencies,
  type LinkPreviewLookupTask,
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
      response.setHeader("Content-Type", "text/plain");
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

  it("rejects duplicate Content-Type headers in the pinned production transport", async () => {
    let socketClosed = false;
    const server = createServer((_request, response) => {
      response.writeHead(200, [
        "Content-Type", "image/png",
        "Content-Type", "text/html",
      ]);
      response.end("ambiguous");
    });
    server.on("connection", (socket) => {
      socket.once("close", () => {
        socketClosed = true;
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;

    try {
      await expect(fetchUsingValidatedAddresses(
        `http://duplicate.invalid:${port}/preview`,
        {},
        [{ address: "127.0.0.1", family: 4 }]
      )).rejects.toThrow(/content-type/i);
      await vi.waitFor(() => expect(socketClosed).toBe(true));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("rejects duplicate Content-Length headers and closes the pinned transport", async () => {
    let socketClosed = false;
    const server = createServer((_request, response) => {
      response.writeHead(200, [
        "Content-Type", "image/png",
        "Content-Length", "9",
        "Content-Length", "9",
      ]);
      response.end("ambiguous");
    });
    server.on("connection", (socket) => {
      socket.once("close", () => {
        socketClosed = true;
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;

    try {
      await expect(fetchUsingValidatedAddresses(
        `http://duplicate.invalid:${port}/preview`,
        {},
        [{ address: "127.0.0.1", family: 4 }]
      )).rejects.toThrow(/content-length|parse error/i);
      await vi.waitFor(() => expect(socketClosed).toBe(true));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("follows a real pinned redirect without Content-Type to a typed final page", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, { Location: "/final" });
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<title>Final page</title>");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;

    try {
      const dependencies: LinkPreviewDependencies = {
        lookup: async () => PUBLIC_DNS_RESULT,
        fetch: (url, init) => fetchUsingValidatedAddresses(
          url,
          init,
          [{ address: "127.0.0.1", family: 4 }]
        ),
      };

      await expect(fetchLinkPreview(
        `http://redirect.example:${port}/start`,
        dependencies
      )).resolves.toMatchObject({
        finalUrl: `http://redirect.example:${port}/final`,
        title: "Final page",
      });
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

  it("does not start or leak a lookup after the deadline expires during redirect cancellation", async () => {
    vi.useFakeTimers();
    const unhandledRejections: unknown[] = [];
    const captureUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.prependListener("unhandledRejection", captureUnhandledRejection);

    try {
      let lookups = 0;
      let cancellationStarted = false;
      const lateLookupFailure = new Error("late lookup failure");
      const redirectBody = new ReadableStream({
        cancel() {
          cancellationStarted = true;
          return new Promise<void>((resolve) => setTimeout(resolve, 100));
        },
      });
      const dependencies: LinkPreviewDependencies = {
        deadlineMs: 50,
        lookup: async () => {
          lookups++;
          if (lookups > 1) throw lateLookupFailure;
          return PUBLIC_DNS_RESULT;
        },
        fetch: async () => new Response(redirectBody, {
          status: 302,
          headers: { location: "/after-cancel" },
        }),
      };
      const pending = fetchLinkPreview("https://example.org", dependencies);
      const rejection = expect(pending).rejects.toThrow(/timed out/i);

      await vi.advanceTimersByTimeAsync(1);
      expect(cancellationStarted).toBe(true);
      await vi.advanceTimersByTimeAsync(100);
      await rejection;
      await vi.runAllTicks();

      expect(lookups).toBe(1);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.removeListener("unhandledRejection", captureUnhandledRejection);
      vi.useRealTimers();
    }
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

  it("passes the deadline signal to DNS so timed-out lookup capacity is released", async () => {
    vi.useFakeTimers();
    try {
      let activeLookups = 0;
      let cancelledLookups = 0;
      const dependencies: LinkPreviewDependencies = {
        deadlineMs: 50,
        lookup: (_hostname, signal) => {
          activeLookups++;
          return new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              cancelledLookups++;
              activeLookups--;
              reject(signal.reason);
            }, { once: true });
          });
        },
        fetch: async () => {
          throw new Error("fetch must not start");
        },
      };
      const pending = fetchLinkPreview("https://example.org", dependencies);
      const rejection = expect(pending).rejects.toThrow(/timed out/i);

      expect(activeLookups).toBe(1);
      await vi.advanceTimersByTimeAsync(51);

      await rejection;
      expect(cancelledLookups).toBe(1);
      expect(activeLookups).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("actively terminates the OS lookup task and waits for capacity release on abort", async () => {
    let activeTasks = 1;
    const task: LinkPreviewLookupTask = {
      result: new Promise(() => undefined),
      cancel: vi.fn(async () => {
        activeTasks--;
      }),
    };
    const lookup = createAbortableDnsLookup(() => task);
    const deadline = new AbortController();
    const pending = lookup("example.org", deadline.signal);

    deadline.abort(new Error("Preview timed out"));

    await expect(pending).rejects.toThrow(/timed out/i);
    expect(task.cancel).toHaveBeenCalledOnce();
    expect(activeTasks).toBe(0);
  });

  it("cannot return a late lookup result while abort cancellation is still releasing capacity", async () => {
    let resolveResult: (addresses: typeof PUBLIC_DNS_RESULT) => void = () => undefined;
    let releaseCapacity: () => void = () => undefined;
    const task: LinkPreviewLookupTask = {
      result: new Promise((resolve) => {
        resolveResult = resolve;
      }),
      cancel: vi.fn(() => new Promise<void>((resolve) => {
        releaseCapacity = resolve;
      })),
    };
    const lookup = createAbortableDnsLookup(() => task);
    const deadline = new AbortController();
    const pending = lookup("example.org", deadline.signal);
    let settled = false;
    void pending.then(
      () => { settled = true; },
      () => { settled = true; }
    );

    deadline.abort(new Error("Preview timed out"));
    resolveResult(PUBLIC_DNS_RESULT);
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);
    releaseCapacity();
    await expect(pending).rejects.toThrow(/timed out/i);
    expect(task.cancel).toHaveBeenCalledOnce();
  });

  it("matches node:dns.lookup system resolver results and ordering", async () => {
    const expected = await osLookup("localhost", { all: true });

    await expect(createAbortableDnsLookup()("localhost")).resolves.toEqual(expected);
  });

  it.each([
    {
      name: "A-only",
      addresses: [{ address: "93.184.216.34", family: 4 }],
    },
    {
      name: "AAAA-only",
      addresses: [{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }],
    },
    {
      name: "dual-stack in OS order",
      addresses: [
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
        { address: "93.184.216.34", family: 4 },
      ],
    },
  ])("preserves $name lookup results", async ({ addresses }) => {
    const task: LinkPreviewLookupTask = {
      result: Promise.resolve(addresses),
      cancel: vi.fn(),
    };

    await expect(createAbortableDnsLookup(() => task)("example.org")).resolves.toEqual(addresses);
    expect(task.cancel).not.toHaveBeenCalled();
  });

  it("propagates an OS lookup failure without trying transport", async () => {
    const failure = Object.assign(new Error("host not found"), { code: "ENOTFOUND" });
    const task: LinkPreviewLookupTask = {
      result: Promise.reject(failure),
      cancel: vi.fn(),
    };

    await expect(createAbortableDnsLookup(() => task)("missing.invalid")).rejects.toBe(failure);
    expect(task.cancel).not.toHaveBeenCalled();
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
    expect(lookup.mock.calls[0][0]).toBe("example.org");
    expect(lookup.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
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
