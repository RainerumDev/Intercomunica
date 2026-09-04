import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SITE_NAME_LENGTH = 160;
const MAX_LOOKUP_WORKER_ADDRESSES = 64;
export const PREVIEW_REQUEST_TIMEOUT_MS = 5000;
// DNS lookups use one Worker each. These module-wide production limits prevent
// request bursts from creating an unbounded number of threads or queued jobs.
export const MAX_ACTIVE_PREVIEW_DNS_WORKERS = 6;
export const MAX_QUEUED_PREVIEW_DNS_LOOKUPS = 24;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_CONTENT_TYPE_LENGTH = 256;

export type LinkPreview = {
  finalUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

export type LinkPreviewLookupAddress = {
  address: string;
  family: number;
};

export type LinkPreviewLookupTask = {
  result: Promise<LinkPreviewLookupAddress[]>;
  cancel(): Promise<unknown> | unknown;
};

export type ScheduledLinkPreviewLookupTask = LinkPreviewLookupTask & {
  finished: Promise<void>;
};

export type LinkPreviewDependencies = {
  deadlineMs?: number;
  lookup: (hostname: string, signal?: AbortSignal) => Promise<LinkPreviewLookupAddress[]>;
  fetch: (
    url: string,
    init: RequestInit,
    validatedAddresses?: readonly LinkPreviewLookupAddress[]
  ) => Promise<Response>;
};

export class UnsafePreviewUrlError extends Error {
  constructor(message = "Preview URL is not a public HTTP destination") {
    super(message);
    this.name = "UnsafePreviewUrlError";
  }
}

function invalidContentType(): Error {
  return new Error("Preview Content-Type is invalid");
}

function isContentTypeTokenCharacter(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x21 ||
    code === 0x23 ||
    code === 0x24 ||
    code === 0x25 ||
    code === 0x26 ||
    code === 0x27 ||
    code === 0x2a ||
    code === 0x2b ||
    code === 0x2d ||
    code === 0x2e ||
    code === 0x5e ||
    code === 0x5f ||
    code === 0x60 ||
    code === 0x7c ||
    code === 0x7e
  );
}

function consumeContentTypeToken(value: string, start: number): number {
  let index = start;
  while (index < value.length && isContentTypeTokenCharacter(value.charCodeAt(index))) index++;
  if (index === start) throw invalidContentType();
  return index;
}

function consumeOptionalWhitespace(value: string, start: number): number {
  let index = start;
  while (value.charCodeAt(index) === 0x20 || value.charCodeAt(index) === 0x09) index++;
  return index;
}

function isQuotedText(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x20 ||
    code === 0x21 ||
    (code >= 0x23 && code <= 0x5b) ||
    (code >= 0x5d && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  );
}

function isQuotedPairCharacter(code: number): boolean {
  return (
    code === 0x09 ||
    code === 0x20 ||
    (code >= 0x21 && code <= 0x7e) ||
    (code >= 0x80 && code <= 0xff)
  );
}

function consumeQuotedString(value: string, start: number): number {
  let index = start + 1;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code === 0x22) return index + 1;
    if (code === 0x5c) {
      index++;
      if (index >= value.length || !isQuotedPairCharacter(value.charCodeAt(index))) {
        throw invalidContentType();
      }
      index++;
      continue;
    }
    if (!isQuotedText(code)) throw invalidContentType();
    index++;
  }
  throw invalidContentType();
}

export function parseStrictContentType(value: string): string {
  if (value.length === 0 || value.length > MAX_CONTENT_TYPE_LENGTH) {
    throw invalidContentType();
  }

  const typeEnd = consumeContentTypeToken(value, 0);
  if (value[typeEnd] !== "/") throw invalidContentType();
  const subtypeStart = typeEnd + 1;
  const subtypeEnd = consumeContentTypeToken(value, subtypeStart);
  let index = subtypeEnd;

  while (index < value.length) {
    index = consumeOptionalWhitespace(value, index);
    if (value[index] !== ";") throw invalidContentType();
    index = consumeOptionalWhitespace(value, index + 1);

    if (index === value.length || value[index] === ";") continue;

    index = consumeContentTypeToken(value, index);
    if (value[index] !== "=") throw invalidContentType();
    index++;
    if (value[index] === '"') {
      index = consumeQuotedString(value, index);
    } else {
      index = consumeContentTypeToken(value, index);
    }
  }

  return `${value.slice(0, typeEnd).toLowerCase()}/${value
    .slice(subtypeStart, subtypeEnd)
    .toLowerCase()}`;
}

const OS_LOOKUP_WORKER_SOURCE = `
const { lookup } = require("node:dns");
const { parentPort, workerData } = require("node:worker_threads");

lookup(workerData.hostname, { all: true }, (error, addresses) => {
  if (error) {
    parentPort.postMessage({
      ok: false,
      error: { name: error.name, message: error.message, code: error.code },
    });
    return;
  }
  parentPort.postMessage({ ok: true, addresses });
});
`;

type LookupWorkerMessage =
  | { ok: true; addresses: LinkPreviewLookupAddress[] }
  | { ok: false; error: { name: string; message: string; code?: string } };

function invalidLookupWorkerMessage(): Error {
  return new Error("Preview DNS lookup Worker returned an invalid message");
}

function parseLookupWorkerMessage(message: unknown): LookupWorkerMessage {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    throw invalidLookupWorkerMessage();
  }
  const record = message as Record<string, unknown>;

  if (record.ok === true) {
    const rawAddresses = record.addresses;
    if (!Array.isArray(rawAddresses) || rawAddresses.length > MAX_LOOKUP_WORKER_ADDRESSES) {
      throw invalidLookupWorkerMessage();
    }
    const addresses: LinkPreviewLookupAddress[] = [];
    for (let index = 0; index < rawAddresses.length; index++) {
      if (!Object.hasOwn(rawAddresses, index)) throw invalidLookupWorkerMessage();
      const entry = rawAddresses[index];
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw invalidLookupWorkerMessage();
      }
      const address = (entry as Record<string, unknown>).address;
      const family = (entry as Record<string, unknown>).family;
      if (
        typeof address !== "string" ||
        (family !== 4 && family !== 6) ||
        isIP(address) !== family
      ) {
        throw invalidLookupWorkerMessage();
      }
      addresses.push({ address, family });
    }
    return { ok: true, addresses };
  }

  if (record.ok === false) {
    if (typeof record.error !== "object" || record.error === null || Array.isArray(record.error)) {
      throw invalidLookupWorkerMessage();
    }
    const errorRecord = record.error as Record<string, unknown>;
    if (
      typeof errorRecord.name !== "string" ||
      !errorRecord.name ||
      typeof errorRecord.message !== "string" ||
      (errorRecord.code !== undefined && typeof errorRecord.code !== "string")
    ) {
      throw invalidLookupWorkerMessage();
    }
    return {
      ok: false,
      error: {
        name: errorRecord.name,
        message: errorRecord.message,
        ...(errorRecord.code === undefined ? {} : { code: errorRecord.code }),
      },
    };
  }

  throw invalidLookupWorkerMessage();
}

export function createLookupWorkerTask(worker: Worker): ScheduledLinkPreviewLookupTask {
  let resultCompleted = false;
  let rejectResult: (error: Error) => void = () => undefined;
  let finishWorker: () => void = () => undefined;
  let termination: Promise<unknown> | undefined;
  const terminate = () => {
    termination ??= Promise.resolve().then(() => worker.terminate());
    return termination;
  };

  const result = new Promise<LinkPreviewLookupAddress[]>((resolve, reject) => {
    rejectResult = reject;
    const receive = (untrustedMessage: unknown) => {
      try {
        const message = parseLookupWorkerMessage(untrustedMessage);
        resultCompleted = true;
        if (!message.ok) {
          const error = new Error(message.error.message) as NodeJS.ErrnoException;
          error.name = message.error.name;
          error.code = message.error.code;
          reject(error);
          return;
        }
        resolve(message.addresses);
      } catch (error) {
        resultCompleted = true;
        reject(error instanceof Error ? error : invalidLookupWorkerMessage());
        void terminate().catch(() => undefined);
      }
    };
    const fail = (error: Error) => {
      if (resultCompleted) return;
      resultCompleted = true;
      reject(error);
    };
    const exit = (code: number) => {
      worker.off("message", receive);
      worker.off("error", fail);
      worker.off("exit", exit);
      if (!resultCompleted) {
        resultCompleted = true;
        rejectResult(new Error(`Preview DNS lookup Worker exited with code ${code}`));
      }
      finishWorker();
    };

    worker.once("message", receive);
    worker.once("error", fail);
    worker.once("exit", exit);
  });
  const finished = new Promise<void>((resolve) => {
    finishWorker = resolve;
  });

  return { result, finished, cancel: terminate };
}

function createOsLookupTask(hostname: string): ScheduledLinkPreviewLookupTask {
  const worker = new Worker(OS_LOOKUP_WORKER_SOURCE, {
    eval: true,
    workerData: { hostname },
  });
  return createLookupWorkerTask(worker);
}

type LinkPreviewLookupTaskProvider = (
  hostname: string,
  signal?: AbortSignal
) => LinkPreviewLookupTask | Promise<LinkPreviewLookupTask>;

export function createAbortableDnsLookup(
  createTask?: LinkPreviewLookupTaskProvider
): LinkPreviewDependencies["lookup"] {
  if (!createTask) return productionDnsLookup;

  return async (hostname, signal) => {
    if (signal?.aborted) throw deadlineError(signal);

    const task = await createTask(hostname, signal);
    type TaskOutcome =
      | { kind: "success"; addresses: LinkPreviewLookupAddress[] }
      | { kind: "failure"; error: unknown };
    type LookupOutcome = TaskOutcome | { kind: "abort" };
    const result: Promise<TaskOutcome> = task.result.then(
      (addresses) => ({ kind: "success", addresses }),
      (error: unknown) => ({ kind: "failure", error })
    );
    if (signal?.aborted) {
      await Promise.resolve().then(() => task.cancel()).catch(() => undefined);
      throw deadlineError(signal);
    }
    if (!signal) {
      const outcome = await result;
      if (outcome.kind === "failure") throw outcome.error;
      return outcome.addresses;
    }

    let notifyAbort: () => void = () => undefined;
    const aborted = new Promise<LookupOutcome>((resolve) => {
      notifyAbort = () => resolve({ kind: "abort" });
    });
    let cancellationCompletion: Promise<void> | undefined;
    const beginCancellation = () => {
      cancellationCompletion ??= Promise.resolve()
        .then(() => task.cancel())
        .then(() => undefined, () => undefined);
      notifyAbort();
      return cancellationCompletion;
    };
    signal.addEventListener("abort", beginCancellation, { once: true });
    if (signal.aborted) beginCancellation();

    try {
      const outcome = await Promise.race([result, aborted]);
      if (outcome.kind === "abort") {
        await beginCancellation();
        throw deadlineError(signal);
      }
      if (signal.aborted) {
        await beginCancellation();
        throw deadlineError(signal);
      }
      if (outcome.kind === "failure") throw outcome.error;
      return outcome.addresses;
    } finally {
      signal.removeEventListener("abort", beginCancellation);
    }
  };
}

export function createBoundedDnsLookup(
  createTask: (hostname: string) => ScheduledLinkPreviewLookupTask
): LinkPreviewDependencies["lookup"] {
  type QueueEntry = {
    hostname: string;
    signal?: AbortSignal;
    resolve(task: LinkPreviewLookupTask): void;
    reject(error: Error): void;
    abort(): void;
  };

  let activeWorkers = 0;
  const queue: QueueEntry[] = [];

  const drain = () => {
    while (activeWorkers < MAX_ACTIVE_PREVIEW_DNS_WORKERS && queue.length > 0) {
      const entry = queue.shift();
      if (!entry) return;
      entry.signal?.removeEventListener("abort", entry.abort);
      if (entry.signal?.aborted) {
        entry.reject(deadlineError(entry.signal));
        continue;
      }

      activeWorkers++;
      let task: ScheduledLinkPreviewLookupTask;
      try {
        task = createTask(entry.hostname);
      } catch (error) {
        activeWorkers--;
        entry.reject(error instanceof Error ? error : new Error("Preview DNS lookup failed"));
        continue;
      }

      let cancellationCompletion: Promise<unknown> | undefined;
      const scheduledTask: LinkPreviewLookupTask = {
        result: task.result,
        cancel: () => {
          cancellationCompletion ??= Promise.resolve().then(() => task.cancel());
          return cancellationCompletion;
        },
      };
      const cancelActiveTask = () => {
        void Promise.resolve(scheduledTask.cancel()).catch(() => undefined);
      };
      entry.signal?.addEventListener("abort", cancelActiveTask, { once: true });
      if (entry.signal?.aborted) cancelActiveTask();
      const releaseSlot = async () => {
        entry.signal?.removeEventListener("abort", cancelActiveTask);
        if (cancellationCompletion) {
          await cancellationCompletion.catch(() => undefined);
        }
        activeWorkers--;
        drain();
      };
      void task.finished.then(releaseSlot, releaseSlot).catch(() => undefined);
      entry.resolve(scheduledTask);
    }
  };

  const acquireTask: LinkPreviewLookupTaskProvider = (hostname, signal) =>
    new Promise<LinkPreviewLookupTask>((resolve, reject) => {
      if (signal?.aborted) {
        reject(deadlineError(signal));
        return;
      }
      if (
        activeWorkers >= MAX_ACTIVE_PREVIEW_DNS_WORKERS &&
        queue.length >= MAX_QUEUED_PREVIEW_DNS_LOOKUPS
      ) {
        reject(new Error("Preview DNS lookup queue is full"));
        return;
      }

      const entry: QueueEntry = {
        hostname,
        signal,
        resolve,
        reject,
        abort: () => {
          const index = queue.indexOf(entry);
          if (index === -1) return;
          queue.splice(index, 1);
          signal?.removeEventListener("abort", entry.abort);
          reject(deadlineError(signal));
        },
      };
      queue.push(entry);
      signal?.addEventListener("abort", entry.abort, { once: true });
      drain();
    });

  return createAbortableDnsLookup(acquireTask);
}

const productionDnsLookup = createBoundedDnsLookup(createOsLookupTask);

export const defaultLinkPreviewDependencies: LinkPreviewDependencies = {
  lookup: productionDnsLookup,
  fetch: (url, init, validatedAddresses) => {
    if (!validatedAddresses) throw new Error("Validated preview addresses are required");
    return fetchUsingValidatedAddresses(url, init, validatedAddresses);
  },
};

function pinnedLookup(addresses: readonly LinkPreviewLookupAddress[]): LookupFunction {
  const normalized = addresses.map(({ address }) => ({ address, family: isIP(address) }));

  return (_hostname, options, callback) => {
    const requestedFamily =
      options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
    const candidates = normalized.filter(
      ({ family }) => !requestedFamily || family === requestedFamily
    );

    if (candidates.length === 0) {
      const error = new Error("No validated address matches the requested family") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "");
      return;
    }

    if (options.all) {
      callback(null, candidates);
      return;
    }

    callback(null, candidates[0].address, candidates[0].family);
  };
}

export function fetchUsingValidatedAddresses(
  value: string,
  init: RequestInit,
  validatedAddresses: readonly LinkPreviewLookupAddress[]
): Promise<Response> {
  const url = new URL(value);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    let settled = false;
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const outgoing = request(
      url,
      {
        agent: false,
        headers: Object.fromEntries(new Headers(init.headers)),
        lookup: pinnedLookup(validatedAddresses),
        method: init.method ?? "GET",
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        if (settled) {
          incoming.destroy();
          return;
        }

        try {
          const contentTypes = incoming.headersDistinct["content-type"] ?? [];
          if (contentTypes.length > 1) {
            throw new Error("Preview response must not contain duplicate Content-Type headers");
          }
          const contentLengths = incoming.headersDistinct["content-length"] ?? [];
          if (contentLengths.length > 1) {
            throw new Error("Preview response must not contain duplicate Content-Length headers");
          }

          const headers = new Headers();
          for (const [name, values] of Object.entries(incoming.headersDistinct)) {
            for (const value of values ?? []) headers.append(name, value);
          }

          const status = incoming.statusCode;
          if (typeof status !== "number" || status < 200 || status > 599) {
            throw new Error(`Preview response status ${String(status)} is invalid`);
          }
          const hasNoBody = status === 204 || status === 205 || status === 304;
          const body = hasNoBody
            ? null
            : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
          const response = new Response(body, {
            headers,
            status,
            statusText: incoming.statusMessage,
          });

          settled = true;
          resolve(response);
        } catch (error) {
          rejectOnce(error);
          incoming.destroy();
        }
      }
    );

    outgoing.once("error", rejectOnce);
    outgoing.end();
  });
}

function isPublicIpv4(address: string): boolean {
  const [a, b, c] = address.split(".").map(Number);

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6Bytes(address: string): number[] {
  const normalized = address.toLowerCase();
  const halves = normalized.split("::");
  const expandSide = (side: string): number[] => {
    if (!side) return [];
    const parts = side.split(":");
    const last = parts.at(-1);
    if (last?.includes(".")) {
      const ipv4 = last.split(".").map(Number);
      parts.splice(parts.length - 1, 1, ((ipv4[0] << 8) | ipv4[1]).toString(16));
      parts.push(((ipv4[2] << 8) | ipv4[3]).toString(16));
    }
    return parts.map((part) => Number.parseInt(part, 16));
  };
  const left = expandSide(halves[0]);
  const right = expandSide(halves[1] ?? "");
  const omitted = halves.length === 2 ? 8 - left.length - right.length : 0;
  const words = [...left, ...Array(omitted).fill(0), ...right];

  return words.flatMap((word) => [word >> 8, word & 0xff]);
}

function hasIpv6Prefix(bytes: number[], prefix: number[], bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  const remainingBits = bits % 8;

  for (let index = 0; index < fullBytes; index++) {
    if (bytes[index] !== prefix[index]) return false;
  }
  if (remainingBits === 0) return true;

  const mask = 0xff << (8 - remainingBits);
  return (bytes[fullBytes] & mask) === (prefix[fullBytes] & mask);
}

function isPublicIpv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  const isUnspecified = bytes.every((byte) => byte === 0);
  const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  const isGlobalUnicast = hasIpv6Prefix(bytes, [0x20], 3);

  return !(
    !isGlobalUnicast ||
    isUnspecified ||
    isLoopback ||
    hasIpv6Prefix(bytes, [0xfc], 7) ||
    hasIpv6Prefix(bytes, [0xfe, 0x80], 10) ||
    hasIpv6Prefix(bytes, [0xfe, 0xc0], 10) ||
    hasIpv6Prefix(bytes, [0xff], 8) ||
    hasIpv6Prefix(bytes, [0x20, 0x01, 0x00], 23) ||
    hasIpv6Prefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32) ||
    hasIpv6Prefix(bytes, [0x20, 0x02], 16) ||
    hasIpv6Prefix(bytes, [0x3f, 0xff], 20) ||
    hasIpv6Prefix(bytes, [0x5f, 0x00], 16)
  );
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export type ResolvedPublicHttpUrl = {
  url: URL;
  addresses: LinkPreviewLookupAddress[];
};

export async function resolvePublicHttpUrl(
  value: string,
  lookup: LinkPreviewDependencies["lookup"],
  signal?: AbortSignal
): Promise<ResolvedPublicHttpUrl> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafePreviewUrlError("Preview URL is invalid");
  }

  if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) {
    throw new UnsafePreviewUrlError();
  }

  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (!isPublicAddress(hostname)) throw new UnsafePreviewUrlError();
    return { url, addresses: [{ address: hostname, family: literalFamily }] };
  }

  const addresses = await withDeadline(() => lookup(hostname, signal), signal);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new UnsafePreviewUrlError();
  }

  return {
    url,
    addresses: addresses.map(({ address }) => ({ address, family: isIP(address) })),
  };
}

export async function validatePublicHttpUrl(
  value: string,
  lookup: LinkPreviewDependencies["lookup"]
): Promise<URL> {
  return (await resolvePublicHttpUrl(value, lookup)).url;
}

function deadlineError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  return new Error("Preview timed out");
}

export function throwIfPreviewDeadlineElapsed(signal: AbortSignal): void {
  if (signal.aborted) throw deadlineError(signal);
}

export function withDeadline<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(deadlineError(signal));

  let pending: Promise<T>;
  try {
    pending = operation();
  } catch (error) {
    return Promise.reject(error);
  }
  if (!signal) return pending;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (complete: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      complete();
    };
    const abort = () => settle(() => reject(deadlineError(signal)));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    pending.then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error))
    );
  });
}

async function readBoundedHtml(response: Response, signal: AbortSignal): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    throw new Error("Preview HTML exceeds 1 MiB");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let html = "";

  try {
    while (true) {
      const { done, value } = await withDeadline(() => reader.read(), signal);
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_HTML_BYTES) {
        throw new Error("Preview HTML exceeds 1 MiB");
      }
      html += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  return html + decoder.decode();
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    agrave: "à",
    Agrave: "À",
    egrave: "è",
    Egrave: "È",
    eacute: "é",
    Eacute: "É",
    igrave: "ì",
    Igrave: "Ì",
    ograve: "ò",
    Ograve: "Ò",
    ugrave: "ù",
    Ugrave: "Ù",
  };

  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi, (entity, code: string) => {
    if (!code.startsWith("#")) return namedEntities[code] ?? namedEntities[code.toLowerCase()] ?? entity;

    const hexadecimal = code[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return entity;
    }
    return String.fromCodePoint(codePoint);
  });
}

function normalizeMetadata(value: string | undefined, maxLength: number): string | null {
  if (value === undefined) return null;
  const normalized = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function attributesForTag(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const match of tag.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function resolveImageUrl(raw: string | undefined, pageUrl: URL): string | null {
  if (!raw) return null;

  try {
    const normalized = decodeHtmlEntities(raw).trim();
    if (!normalized) return null;
    const image = new URL(normalized, pageUrl);
    if (
      (image.protocol !== "http:" && image.protocol !== "https:") ||
      image.username ||
      image.password ||
      image.toString().length > 2048
    ) {
      return null;
    }
    return image.toString();
  } catch {
    return null;
  }
}

function extractMetadata(html: string, pageUrl: URL): Omit<LinkPreview, "finalUrl"> {
  const openGraph = new Map<string, string>();
  const metaTagPattern = /<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;

  for (const match of html.matchAll(metaTagPattern)) {
    const attributes = attributesForTag(match[0]);
    const property = (attributes.property ?? attributes.name)?.trim().toLowerCase();
    if (property?.startsWith("og:") && attributes.content !== undefined && !openGraph.has(property)) {
      openGraph.set(property, attributes.content);
    }
  }

  const titleElement = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const title = normalizeMetadata(
    openGraph.get("og:title") ?? titleElement?.replace(/<[^>]*>/g, ""),
    MAX_TITLE_LENGTH
  );

  return {
    title,
    description: normalizeMetadata(openGraph.get("og:description"), MAX_DESCRIPTION_LENGTH),
    imageUrl: resolveImageUrl(openGraph.get("og:image"), pageUrl),
    siteName: normalizeMetadata(openGraph.get("og:site_name"), MAX_SITE_NAME_LENGTH),
  };
}

export async function fetchLinkPreview(
  value: string,
  dependencies: LinkPreviewDependencies = defaultLinkPreviewDependencies
): Promise<LinkPreview> {
  let currentUrl = value;
  let redirects = 0;
  const deadline = new AbortController();
  const timeout = setTimeout(
    () => deadline.abort(new Error("Preview timed out")),
    dependencies.deadlineMs ?? PREVIEW_REQUEST_TIMEOUT_MS
  );
  timeout.unref?.();

  try {
    while (true) {
      throwIfPreviewDeadlineElapsed(deadline.signal);
      const { url: validatedUrl, addresses } = await resolvePublicHttpUrl(
        currentUrl,
        dependencies.lookup,
        deadline.signal
      );
      const response = await withDeadline(
        () => dependencies.fetch(validatedUrl.toString(), {
          redirect: "manual",
          signal: deadline.signal,
          headers: { Accept: "text/html" },
        }, addresses),
        deadline.signal
      );

      try {
        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get("location");
          if (!location) throw new Error("Preview redirect is missing a location");
          if (redirects >= MAX_REDIRECTS) throw new Error("Preview exceeded three redirects");
          currentUrl = new URL(location, validatedUrl).toString();
          redirects++;
          continue;
        }

        if (!response.ok) throw new Error(`Preview request failed with status ${response.status}`);
        const rawContentType = response.headers.get("content-type");
        let contentType: string | undefined;
        if (rawContentType) {
          try {
            contentType = parseStrictContentType(rawContentType);
          } catch {
            throw new Error("Preview response HTML type is invalid");
          }
        }
        if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
          throw new Error("Preview response is not HTML");
        }

        const html = await readBoundedHtml(response, deadline.signal);
        return {
          finalUrl: validatedUrl.toString(),
          ...extractMetadata(html, validatedUrl),
        };
      } finally {
        if (response.body && !response.body.locked) {
          await response.body.cancel().catch(() => undefined);
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}
