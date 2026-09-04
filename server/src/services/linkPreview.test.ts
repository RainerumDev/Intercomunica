import { once } from "node:events";
import { lookup as osLookup } from "node:dns/promises";
import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAbortableDnsLookup,
  createBoundedDnsLookup,
  createLookupWorkerTask,
  fetchLinkPreview,
  fetchUsingValidatedAddresses,
  MAX_ACTIVE_PREVIEW_DNS_WORKERS,
  MAX_QUEUED_PREVIEW_DNS_LOOKUPS,
  parseStrictContentType,
  UnsafePreviewUrlError,
  type LinkPreviewDependencies,
  type LinkPreviewLookupTask,
  type ScheduledLinkPreviewLookupTask,
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

describe("RFC 9110 Content-Type parsing", () => {
  it.each([
    ["text/html", "text/html"],
    ['Text/HTML;Charset="utf-8"', "text/html"],
    ["application/XHTML+XML \t; charset=utf-8; ;", "application/xhtml+xml"],
    ["text/html;", "text/html"],
    ["text/html; ; charset=utf-8;;", "text/html"],
    ['text/html; title="café"', "text/html"],
    ['image/png; title="café"; empty=""', "image/png"],
    ['image/jpeg; note="a\\"b\\\\c"', "image/jpeg"],
    ['image/webp; note="caf\\é"', "image/webp"],
    ["image/gif;symbols=!#$%&'*+-.^_`|~", "image/gif"],
  ])("normalizes valid field value %j to %s", (value, expected) => {
    expect(parseStrictContentType(value)).toBe(expected);
  });

  it.each([
    "text /html",
    "text/ html",
    "text/html; charset =utf-8",
    "text/html; charset= utf-8",
    "text/html; charset\t=utf-8",
    "text/html; charset=\tutf-8",
    "text/html; charset=",
    "text/html; =utf-8",
    'text/html; charset="unterminated',
    'text/html; charset="bad\\',
    'text/html; title="closed"junk',
    'image/png; title="line\rbreak"',
    'image/png; title="line\nbreak"',
    'image/png; title="nul\0byte"',
    'image/png; title="delete\x7fbyte"',
    'image/png; title="wide\u0100"',
    'image/png; title="bad\\\x7fescape"',
    "image/png,text/html",
    "\rtext/html",
    "text/html\n",
  ])("rejects invalid field value %j", (value) => {
    expect(() => parseStrictContentType(value)).toThrow(/content-type/i);
  });
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
    let serverSocket: Socket | undefined;
    const server = createServer((_request, response) => {
      response.writeHead(200, [
        "Content-Type", "image/png",
        "Content-Type", "text/html",
      ]);
      response.flushHeaders();
    });
    server.on("connection", (socket) => {
      serverSocket = socket;
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
      serverSocket?.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("rejects duplicate Content-Length headers and closes the pinned transport", async () => {
    let socketClosed = false;
    let serverSocket: Socket | undefined;
    const server = createServer((_request, response) => {
      response.writeHead(200, [
        "Content-Type", "image/png",
        "Content-Length", "9",
        "Content-Length", "9",
      ]);
      response.flushHeaders();
    });
    server.on("connection", (socket) => {
      serverSocket = socket;
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
      serverSocket?.destroy();
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

  it("rejects a final HTML Content-Type with invalid parameter syntax", async () => {
    const dependencies = previewDependencies([
      new Response("<title>Must not parse</title>", {
        headers: { "content-type": "text/html; invalid parameter" },
      }),
    ]);

    await expect(fetchLinkPreview("https://example.org", dependencies)).rejects.toThrow(
      /type|HTML/i
    );
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

  it("actively cancels an injected lookup task and waits for capacity release", async () => {
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

  it("stays pending until macrotask cancellation releases lookup capacity", async () => {
    let resolveResult: (addresses: typeof PUBLIC_DNS_RESULT) => void = () => undefined;
    let capacityReleased = false;
    const task: LinkPreviewLookupTask = {
      result: new Promise((resolve) => {
        resolveResult = resolve;
      }),
      cancel: vi.fn(() => new Promise<void>((resolve) => {
        setTimeout(() => {
          capacityReleased = true;
          resolve();
        }, 25);
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
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(settled).toBe(false);
    await expect(pending).rejects.toThrow(/timed out/i);
    expect(capacityReleased).toBe(true);
    expect(task.cancel).toHaveBeenCalledOnce();
  });

  it("caps active OS lookup workers and the queue under 128 concurrent requests", async () => {
    type ControlledTask = {
      completeResult(): void;
      finishWorker(): void;
      task: ScheduledLinkPreviewLookupTask;
    };
    const controlledTasks: ControlledTask[] = [];
    let activeWorkers = 0;
    let maximumActiveWorkers = 0;
    const lookup = createBoundedDnsLookup(() => {
      activeWorkers++;
      maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers);
      let completeResult: (addresses: typeof PUBLIC_DNS_RESULT) => void = () => undefined;
      let completeWorker: () => void = () => undefined;
      let resultCompleted = false;
      let workerFinished = false;
      const task: ScheduledLinkPreviewLookupTask = {
        result: new Promise((resolve) => {
          completeResult = resolve;
        }),
        finished: new Promise((resolve) => {
          completeWorker = resolve;
        }),
        cancel: vi.fn(),
      };
      controlledTasks.push({
        task,
        completeResult() {
          if (resultCompleted) return;
          resultCompleted = true;
          completeResult(PUBLIC_DNS_RESULT);
        },
        finishWorker() {
          if (workerFinished) return;
          workerFinished = true;
          activeWorkers--;
          completeWorker();
        },
      });
      return task;
    });
    const deadlines = Array.from({ length: 128 }, () => new AbortController());
    const requests = deadlines.map((deadline, index) =>
      lookup(`host-${index}.example`, deadline.signal)
    );
    const allOutcomes = Promise.allSettled(requests);
    const acceptedCapacity =
      MAX_ACTIVE_PREVIEW_DNS_WORKERS + MAX_QUEUED_PREVIEW_DNS_LOOKUPS;

    expect(controlledTasks).toHaveLength(MAX_ACTIVE_PREVIEW_DNS_WORKERS);
    expect(maximumActiveWorkers).toBe(MAX_ACTIVE_PREVIEW_DNS_WORKERS);
    const overflow = await Promise.allSettled(requests.slice(acceptedCapacity));
    expect(overflow).toHaveLength(128 - acceptedCapacity);
    expect(overflow.every((outcome) =>
      outcome.status === "rejected" && /queue is full/i.test(String(outcome.reason))
    )).toBe(true);

    deadlines[MAX_ACTIVE_PREVIEW_DNS_WORKERS].abort(new Error("Preview timed out"));
    await expect(requests[MAX_ACTIVE_PREVIEW_DNS_WORKERS]).rejects.toThrow(/timed out/i);
    expect(controlledTasks).toHaveLength(MAX_ACTIVE_PREVIEW_DNS_WORKERS);

    const expectedWorkerCreations = acceptedCapacity - 1;
    controlledTasks[0].completeResult();
    await expect(requests[0]).resolves.toEqual(PUBLIC_DNS_RESULT);
    expect(controlledTasks).toHaveLength(MAX_ACTIVE_PREVIEW_DNS_WORKERS);
    controlledTasks[0].finishWorker();
    for (let index = 0; index < expectedWorkerCreations; index++) {
      await vi.waitFor(() => expect(controlledTasks.length).toBeGreaterThan(index));
      controlledTasks[index].completeResult();
      controlledTasks[index].finishWorker();
    }

    const outcomes = await allOutcomes;
    expect(controlledTasks).toHaveLength(expectedWorkerCreations);
    expect(maximumActiveWorkers).toBeLessThanOrEqual(MAX_ACTIVE_PREVIEW_DNS_WORKERS);
    expect(activeWorkers).toBe(0);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(
      expectedWorkerCreations
    );
  });

  it("retains an active scheduler slot until delayed cancellation completes", async () => {
    const finishWorkers: Array<() => void> = [];
    let tasksCreated = 0;
    let cancellationReleased = false;
    const lookup = createBoundedDnsLookup(() => {
      const taskIndex = tasksCreated++;
      let finishWorker: () => void = () => undefined;
      const task: ScheduledLinkPreviewLookupTask = {
        result: new Promise(() => undefined),
        finished: new Promise((resolve) => {
          finishWorker = resolve;
        }),
        cancel: taskIndex === 0
          ? () => new Promise<void>((resolve) => setTimeout(() => {
              cancellationReleased = true;
              resolve();
            }, 25))
          : vi.fn(),
      };
      finishWorkers.push(finishWorker);
      return task;
    });
    const deadlines = Array.from(
      { length: MAX_ACTIVE_PREVIEW_DNS_WORKERS + 1 },
      () => new AbortController()
    );
    const requests = deadlines.map((deadline, index) =>
      lookup(`slot-${index}.example`, deadline.signal)
    );
    const observed = requests.map((request) => request.catch(() => undefined));

    expect(tasksCreated).toBe(MAX_ACTIVE_PREVIEW_DNS_WORKERS);
    deadlines[0].abort(new Error("Preview timed out"));
    finishWorkers[0]();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(cancellationReleased).toBe(false);
    expect(tasksCreated).toBe(MAX_ACTIVE_PREVIEW_DNS_WORKERS);
    await expect(requests[0]).rejects.toThrow(/timed out/i);
    await vi.waitFor(() => expect(tasksCreated).toBe(MAX_ACTIVE_PREVIEW_DNS_WORKERS + 1));

    for (const finishWorker of finishWorkers.slice(1)) finishWorker();
    for (const deadline of deadlines.slice(1)) deadline.abort(new Error("cleanup"));
    await Promise.all(observed);
  });

  it("matches node:dns.lookup system resolver results and ordering", async () => {
    const expected = await osLookup("localhost", { all: true });

    await expect(createAbortableDnsLookup()("localhost")).resolves.toEqual(expected);
  });

  it("terminates an actual production lookup Worker on abort and releases its scheduler slot", async () => {
    const lookup = createAbortableDnsLookup();
    const deadline = new AbortController();
    const pending = lookup("localhost", deadline.signal);

    deadline.abort(new Error("Preview timed out"));

    await expect(pending).rejects.toThrow(/timed out/i);
    await expect(lookup("localhost")).resolves.toEqual(
      await osLookup("localhost", { all: true })
    );
  });

  it("preserves an empty result at the abortable resolver abstraction", async () => {
    const task: LinkPreviewLookupTask = {
      result: Promise.resolve([]),
      cancel: vi.fn(),
    };

    await expect(createAbortableDnsLookup(() => task)("empty.example")).resolves.toEqual([]);
  });

  it.each([
    null,
    {},
    { ok: "true", addresses: [] },
    { ok: true, addresses: null },
    { ok: true, addresses: new Array(1) },
    {
      ok: true,
      addresses: Array.from({ length: 65 }, (_, index) => ({
        address: `93.184.216.${index + 1}`,
        family: 4,
      })),
    },
    { ok: true, addresses: [{ address: "93.184.216.34", family: "4" }] },
    { ok: true, addresses: [{ address: "not-an-address", family: 4 }] },
    { ok: true, addresses: [{ address: "93.184.216.34", family: 6 }] },
    { ok: false, error: { message: "missing name" } },
    { ok: false, error: { name: "Error", message: 42 } },
  ])("rejects and terminates a Worker that sends malformed lookup message %#", async (message) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require("node:worker_threads");
      parentPort.postMessage(workerData.message);
      setInterval(() => undefined, 1000);
    `, {
      eval: true,
      workerData: { message },
    });
    const task = createLookupWorkerTask(worker);

    try {
      await expect(task.result).rejects.toThrow(/invalid message/i);
      await expect(task.finished).resolves.toBeUndefined();
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  });

  it("terminates a sparse-message Worker and lets subsequent queued work proceed", async () => {
    type ControlledTask = {
      hostname: string;
      completeResult(): void;
      finishWorker(): void;
    };
    const sparseWorker = new Worker(`
      const { parentPort } = require("node:worker_threads");
      parentPort.postMessage({ ok: true, addresses: new Array(1) });
      setInterval(() => undefined, 1000);
    `, { eval: true });
    const controlledTasks: ControlledTask[] = [];
    const createdHostnames: string[] = [];
    const lookup = createBoundedDnsLookup((hostname) => {
      createdHostnames.push(hostname);
      if (hostname === "sparse.example") return createLookupWorkerTask(sparseWorker);

      let completeResult: (addresses: typeof PUBLIC_DNS_RESULT) => void = () => undefined;
      let finishWorker: () => void = () => undefined;
      let resultCompleted = false;
      let workerFinished = false;
      const task: ScheduledLinkPreviewLookupTask = {
        result: new Promise((resolve) => {
          completeResult = resolve;
        }),
        finished: new Promise((resolve) => {
          finishWorker = resolve;
        }),
        cancel: vi.fn(),
      };
      controlledTasks.push({
        hostname,
        completeResult() {
          if (resultCompleted) return;
          resultCompleted = true;
          completeResult(PUBLIC_DNS_RESULT);
        },
        finishWorker() {
          if (workerFinished) return;
          workerFinished = true;
          finishWorker();
        },
      });
      return task;
    });
    const hostnames = [
      "sparse.example",
      ...Array.from(
        { length: MAX_ACTIVE_PREVIEW_DNS_WORKERS - 1 },
        (_, index) => `held-${index}.example`
      ),
      "queued.example",
    ];
    const deadlines = hostnames.map(() => new AbortController());
    const requests = hostnames.map((hostname, index) => lookup(hostname, deadlines[index].signal));
    const observed = requests.map((request) => request.catch(() => undefined));

    try {
      expect(createdHostnames).not.toContain("queued.example");
      await expect(requests[0]).rejects.toThrow(/invalid message/i);
      await vi.waitFor(() => expect(createdHostnames).toContain("queued.example"));

      const queuedTask = controlledTasks.find(({ hostname }) => hostname === "queued.example");
      expect(queuedTask).toBeDefined();
      queuedTask?.completeResult();
      await expect(requests.at(-1)).resolves.toEqual(PUBLIC_DNS_RESULT);
      queuedTask?.finishWorker();
    } finally {
      await sparseWorker.terminate().catch(() => undefined);
      for (const deadline of deadlines.slice(1)) deadline.abort(new Error("cleanup"));
      for (const task of controlledTasks) task.finishWorker();
      await Promise.all(observed);
    }
  });

  it("reconstructs a fully validated lookup error from a Worker message", async () => {
    const worker = new Worker(`
      const { parentPort } = require("node:worker_threads");
      parentPort.postMessage({
        ok: false,
        error: { name: "ResolverError", message: "host not found", code: "ENOTFOUND" },
      });
    `, { eval: true });
    const task = createLookupWorkerTask(worker);

    await expect(task.result).rejects.toMatchObject({
      name: "ResolverError",
      message: "host not found",
      code: "ENOTFOUND",
    });
    await expect(task.finished).resolves.toBeUndefined();
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
