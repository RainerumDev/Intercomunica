import {
  defaultLinkPreviewDependencies,
  fetchLinkPreview,
  PREVIEW_REQUEST_TIMEOUT_MS,
  parseStrictContentType,
  resolvePublicHttpUrl,
  throwIfPreviewDeadlineElapsed,
  withDeadline,
  type LinkPreview,
  type LinkPreviewDependencies,
} from "./linkPreview.js";
import type { ResourceImage } from "./sharedResourceService.js";

export type { ResourceImage } from "./sharedResourceService.js";

export const MAX_PREVIEW_IMAGE_BYTES = 512 * 1024;

// Uploaded covers are raster bytes, never remote URLs or active SVG/HTML.
export function decodePreviewImage(value: string): ResourceImage | null {
  if (value.length > Math.ceil(MAX_PREVIEW_IMAGE_BYTES / 3) * 4 + 40) return null;
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > MAX_PREVIEW_IMAGE_BYTES || data.toString("base64") !== match[2]) return null;
  const mimeType = match[1];
  const signatureMatches = mimeType === "image/png"
    ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === "image/jpeg"
      ? data[0] === 255 && data[1] === 216 && data[2] === 255
      : mimeType === "image/gif"
        ? /^GIF8[79]a$/.test(data.subarray(0, 6).toString("ascii"))
        : data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  return signatureMatches ? { data, mimeType } : null;
}

const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const IMAGE_ACCEPT_HEADER = [...ALLOWED_IMAGE_TYPES].join(", ");

export type ResourcePreviewResult = {
  preview: LinkPreview;
  image: ResourceImage | null;
};

function imageMimeType(response: Response): string {
  const contentType = response.headers.get("content-type");
  if (!contentType) throw new Error("Preview image type is missing");

  let mimeType: string;
  try {
    mimeType = parseStrictContentType(contentType);
  } catch {
    throw new Error("Preview image type is invalid");
  }

  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("Preview image type is not allowed");
  }
  return mimeType;
}

function declaredImageLength(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^\d+$/.test(value.trim())) throw new Error("Preview image length is invalid");
  const length = Number(value);
  if (!Number.isSafeInteger(length)) throw new Error("Preview image length is invalid");
  return length;
}

async function readBoundedImage(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const declaredLength = declaredImageLength(response);
  if (declaredLength !== null && declaredLength > MAX_PREVIEW_IMAGE_BYTES) {
    throw new Error("Preview image exceeds 512 KiB");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const buffer = new Uint8Array(MAX_PREVIEW_IMAGE_BYTES);
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await withDeadline(() => reader.read(), signal);
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_PREVIEW_IMAGE_BYTES) {
        throw new Error("Preview image exceeds 512 KiB");
      }
      buffer.set(value, bytesRead - value.byteLength);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  return buffer.slice(0, bytesRead);
}

export async function fetchPublicImage(
  value: string,
  dependencies: LinkPreviewDependencies = defaultLinkPreviewDependencies
): Promise<ResourceImage> {
  let currentUrl = value;
  let redirects = 0;
  const deadline = new AbortController();
  const timeout = setTimeout(
    () => deadline.abort(new Error("Preview image timed out")),
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
        () => dependencies.fetch(
          validatedUrl.toString(),
          {
            redirect: "manual",
            signal: deadline.signal,
            headers: { Accept: IMAGE_ACCEPT_HEADER },
          },
          addresses
        ),
        deadline.signal
      );

      try {
        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get("location");
          if (!location) throw new Error("Preview image redirect is missing a location");
          if (redirects >= MAX_REDIRECTS) {
            throw new Error("Preview image exceeded three redirects");
          }
          currentUrl = new URL(location, validatedUrl).toString();
          redirects++;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Preview image request failed with status ${response.status}`);
        }
        const mimeType = imageMimeType(response);
        const data = await readBoundedImage(response, deadline.signal);
        return { data, mimeType };
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

export async function fetchResourcePreview(
  url: string,
  dependencies: LinkPreviewDependencies = defaultLinkPreviewDependencies
): Promise<ResourcePreviewResult> {
  const { imageCandidates, ...preview } = await fetchLinkPreview(url, dependencies);
  if (!preview.imageUrl) return { preview, image: null };

  const expiresAt = Date.now() + (dependencies.deadlineMs ?? PREVIEW_REQUEST_TIMEOUT_MS);
  for (const imageUrl of imageCandidates ?? [preview.imageUrl]) {
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) break;
    try {
      const downloaded = await fetchPublicImage(imageUrl, { ...dependencies, deadlineMs: remainingMs });
      const image = decodePreviewImage(`data:${downloaded.mimeType};base64,${Buffer.from(downloaded.data).toString("base64")}`);
      if (image) return { preview: { ...preview, imageUrl }, image: { ...image, data: new Uint8Array(image.data) } };
    } catch {
      // Try the next declared image within the same bounded image budget.
    }
  }
  return { preview, image: null };
}
