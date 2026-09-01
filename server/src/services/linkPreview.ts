import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5000;
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
  lookup: (hostname: string) => Promise<LinkPreviewLookupAddress[]>;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
};

export class UnsafePreviewUrlError extends Error {
  constructor(message = "Preview URL is not a public HTTP destination") {
    super(message);
    this.name = "UnsafePreviewUrlError";
  }
}

const defaultDependencies: LinkPreviewDependencies = {
  lookup: async (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  fetch: (url, init) => globalThis.fetch(url, init),
};

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

export async function validatePublicHttpUrl(
  value: string,
  lookup: LinkPreviewDependencies["lookup"]
): Promise<URL> {
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
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new UnsafePreviewUrlError();
    return url;
  }

  const addresses = await lookup(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new UnsafePreviewUrlError();
  }

  return url;
}

async function readBoundedHtml(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    throw new Error("Preview HTML exceeds 1 MiB");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let html = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Preview HTML exceeds 1 MiB");
    }
    html += decoder.decode(value, { stream: true });
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

function normalizeMetadata(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  return normalized || null;
}

function attributesForTag(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const match of tag.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function extractMetadata(html: string, finalUrl: string): Omit<LinkPreview, "finalUrl"> {
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
  const title = normalizeMetadata(openGraph.get("og:title") ?? titleElement?.replace(/<[^>]*>/g, ""));
  const image = normalizeMetadata(openGraph.get("og:image"));
  let imageUrl: string | null = null;
  if (image) {
    try {
      imageUrl = new URL(image, finalUrl).toString();
    } catch {
      imageUrl = null;
    }
  }

  return {
    title,
    description: normalizeMetadata(openGraph.get("og:description")),
    imageUrl,
    siteName: normalizeMetadata(openGraph.get("og:site_name")),
  };
}

export async function fetchLinkPreview(
  value: string,
  dependencies: LinkPreviewDependencies = defaultDependencies
): Promise<LinkPreview> {
  let currentUrl = value;
  let redirects = 0;

  while (true) {
    const validatedUrl = await validatePublicHttpUrl(currentUrl, dependencies.lookup);
    const response = await dependencies.fetch(validatedUrl.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "text/html" },
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Preview redirect is missing a location");
      if (redirects >= MAX_REDIRECTS) throw new Error("Preview exceeded three redirects");
      currentUrl = new URL(location, validatedUrl).toString();
      redirects++;
      continue;
    }

    if (!response.ok) throw new Error(`Preview request failed with status ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
      throw new Error("Preview response is not HTML");
    }

    const html = await readBoundedHtml(response);
    return {
      finalUrl: validatedUrl.toString(),
      ...extractMetadata(html, validatedUrl.toString()),
    };
  }
}
