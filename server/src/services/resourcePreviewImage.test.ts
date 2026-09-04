import { describe, expect, it, vi } from "vitest";
import { UnsafePreviewUrlError, type LinkPreviewDependencies } from "./linkPreview.js";
import {
  fetchPublicImage,
  fetchResourcePreview,
  MAX_PREVIEW_IMAGE_BYTES,
} from "./resourcePreviewImage.js";

const PUBLIC_DNS_RESULT = [{ address: "93.184.216.34", family: 4 as const }];

function imageDependencies(
  responses: Response[],
  options: {
    deadlineMs?: number;
    lookup?: LinkPreviewDependencies["lookup"];
    onFetch?: (
      url: string,
      init: RequestInit,
      addresses: readonly { address: string; family: number }[] | undefined
    ) => void;
  } = {}
): LinkPreviewDependencies {
  return {
    deadlineMs: options.deadlineMs,
    lookup: options.lookup ?? (async () => PUBLIC_DNS_RESULT),
    fetch: async (url, init, addresses) => {
      options.onFetch?.(url, init, addresses);
      const response = responses.shift();
      if (!response) throw new Error("Unexpected fetch");
      return response;
    },
  };
}

describe("fetchPublicImage security boundary", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.org/card.png",
    "https://user:secret@example.org/card.png",
    "http://127.0.0.1/private.png",
    "http://[::1]/private.png",
  ])("rejects unsafe image destination %s", async (url) => {
    await expect(fetchPublicImage(url, imageDependencies([]))).rejects.toBeInstanceOf(
      UnsafePreviewUrlError
    );
  });

  it("revalidates an image redirect and rejects a private destination", async () => {
    const dependencies = imageDependencies([
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    ]);

    await expect(fetchPublicImage("https://example.org/card.png", dependencies)).rejects.toBeInstanceOf(
      UnsafePreviewUrlError
    );
  });

  it("supplies the DNS-validated addresses to the actual request", async () => {
    const seen: Array<{ url: string; addresses: readonly { address: string; family: number }[] | undefined }> = [];
    const dependencies = imageDependencies([
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      }),
    ], {
      onFetch: (url, init, addresses) => {
        expect(init.redirect).toBe("manual");
        expect(new Headers(init.headers).get("accept")).toBe("image/jpeg, image/png, image/webp, image/gif");
        seen.push({ url, addresses });
      },
    });

    await fetchPublicImage("https://example.org/card.png", dependencies);

    expect(seen).toEqual([{
      url: "https://example.org/card.png",
      addresses: PUBLIC_DNS_RESULT,
    }]);
  });

  it.each([
    "image/svg+xml",
    "text/html",
    "image/png, text/html",
    "image/png; invalid parameter",
  ])("rejects invalid image type %s", async (contentType) => {
    const dependencies = imageDependencies([
      new Response(new Uint8Array([1]), { headers: { "content-type": contentType } }),
    ]);

    await expect(fetchPublicImage("https://example.org/card", dependencies)).rejects.toThrow(
      /image type/i
    );
  });

  it("rejects a declared image size above 512 KiB before reading", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const dependencies = imageDependencies([
      new Response(body, {
        headers: {
          "content-type": "image/png",
          "content-length": String(MAX_PREVIEW_IMAGE_BYTES + 1),
        },
      }),
    ]);

    await expect(fetchPublicImage("https://example.org/card.png", dependencies)).rejects.toThrow(
      /512 KiB/i
    );
    expect(cancelled).toBe(true);
  });

  it("cancels a streamed image body as soon as it exceeds 512 KiB", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_PREVIEW_IMAGE_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const dependencies = imageDependencies([
      new Response(body, { headers: { "content-type": "image/png" } }),
    ]);

    await expect(fetchPublicImage("https://example.org/card.png", dependencies)).rejects.toThrow(
      /512 KiB/i
    );
    expect(cancelled).toBe(true);
  });

  it("enforces one five-second deadline across image DNS resolution", async () => {
    vi.useFakeTimers();
    try {
      const dependencies = imageDependencies([], {
        lookup: () => new Promise(() => undefined),
      });
      const pending = fetchPublicImage("https://example.org/card.png", dependencies);
      const rejection = expect(pending).rejects.toThrow(/timed out/i);

      await vi.advanceTimersByTimeAsync(5001);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a stalled image body when its deadline expires", async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      });
      const dependencies = imageDependencies([
        new Response(body, { headers: { "content-type": "image/png" } }),
      ], { deadlineMs: 50 });
      const pending = fetchPublicImage("https://example.org/card.png", dependencies);
      const rejection = expect(pending).rejects.toThrow(/timed out/i);

      await vi.advanceTimersByTimeAsync(51);

      await rejection;
      expect(cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows exactly three redirects and rejects a fourth", async () => {
    const dependencies = imageDependencies([
      new Response(null, { status: 302, headers: { location: "/one" } }),
      new Response(null, { status: 302, headers: { location: "/two" } }),
      new Response(null, { status: 302, headers: { location: "/three" } }),
      new Response(null, { status: 302, headers: { location: "/four" } }),
    ]);

    await expect(fetchPublicImage("https://example.org/card.png", dependencies)).rejects.toThrow(
      /redirect/i
    );
  });

  it("returns an allowed PNG with safely parsed content-type parameters", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const dependencies = imageDependencies([
      new Response(png, { headers: { "content-type": "image/png; charset=binary" } }),
    ]);

    await expect(fetchPublicImage("https://example.org/card.png", dependencies)).resolves.toEqual({
      data: png,
      mimeType: "image/png",
    });
  });
});

describe("fetchResourcePreview", () => {
  it("returns a validated PNG alongside the page metadata", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const dependencies = imageDependencies([
      new Response(`
        <meta property="og:title" content="Open day">
        <meta property="og:image" content="/images/card.png">
      `, { headers: { "content-type": "text/html" } }),
      new Response(png, { headers: { "content-type": "image/png" } }),
    ]);

    await expect(fetchResourcePreview("https://example.org/article", dependencies)).resolves.toEqual({
      preview: {
        finalUrl: "https://example.org/article",
        title: "Open day",
        description: null,
        imageUrl: "https://example.org/images/card.png",
        siteName: null,
      },
      image: { data: png, mimeType: "image/png" },
    });
  });

  it("keeps page metadata and returns no image when Open Graph has no image", async () => {
    const dependencies = imageDependencies([
      new Response('<meta property="og:title" content="Open day">', {
        headers: { "content-type": "text/html" },
      }),
    ]);

    await expect(fetchResourcePreview("https://example.org/article", dependencies)).resolves.toEqual({
      preview: {
        finalUrl: "https://example.org/article",
        title: "Open day",
        description: null,
        imageUrl: null,
        siteName: null,
      },
      image: null,
    });
  });

  it("swallows only image acquisition failures while preserving page metadata", async () => {
    const dependencies = imageDependencies([
      new Response(`
        <meta property="og:title" content="Open day">
        <meta property="og:image" content="https://images.example.org/card.svg">
      `, { headers: { "content-type": "text/html" } }),
      new Response("<svg></svg>", { headers: { "content-type": "image/svg+xml" } }),
    ]);

    await expect(fetchResourcePreview("https://example.org/article", dependencies)).resolves.toMatchObject({
      preview: { title: "Open day", imageUrl: "https://images.example.org/card.svg" },
      image: null,
    });
  });

  it("leaves page-preview failures distinguishable", async () => {
    const dependencies = imageDependencies([
      new Response("not html", { headers: { "content-type": "text/plain" } }),
    ]);

    await expect(fetchResourcePreview("https://example.org/article", dependencies)).rejects.toThrow(
      /HTML/i
    );
  });
});
