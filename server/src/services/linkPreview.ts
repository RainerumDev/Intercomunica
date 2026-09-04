import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SITE_NAME_LENGTH = 160;
export const PREVIEW_REQUEST_TIMEOUT_MS = 5000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

export type LinkPreviewDependencies = {
  deadlineMs?: number;
  lookup: (hostname: string) => Promise<LinkPreviewLookupAddress[]>;
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

export const defaultLinkPreviewDependencies: LinkPreviewDependencies = {
  lookup: async (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
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
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }

        const status = incoming.statusCode ?? 500;
        const hasNoBody = status === 204 || status === 205 || status === 304;
        const body = hasNoBody
          ? null
          : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
        resolve(
          new Response(body, {
            headers,
            status,
            statusText: incoming.statusMessage,
          })
        );
      }
    );

    outgoing.once("error", reject);
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

  const addresses = await withDeadline(lookup(hostname), signal);
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

export function withDeadline<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(deadlineError(signal));

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
    operation.then(
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
      const { done, value } = await withDeadline(reader.read(), signal);
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
      const { url: validatedUrl, addresses } = await resolvePublicHttpUrl(
        currentUrl,
        dependencies.lookup,
        deadline.signal
      );
      const response = await withDeadline(dependencies.fetch(validatedUrl.toString(), {
        redirect: "manual",
        signal: deadline.signal,
        headers: { Accept: "text/html" },
      }, addresses), deadline.signal);

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
        const contentType = response.headers.get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase();
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
