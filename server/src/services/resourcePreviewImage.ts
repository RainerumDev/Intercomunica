import { MIMEType } from "node:util";
import {
  defaultLinkPreviewDependencies,
  fetchLinkPreview,
  PREVIEW_REQUEST_TIMEOUT_MS,
  resolvePublicHttpUrl,
  withDeadline,
  type LinkPreview,
  type LinkPreviewDependencies,
} from "./linkPreview.js";
import type { ResourceImage } from "./sharedResourceService.js";

export type { ResourceImage } from "./sharedResourceService.js";

export const MAX_PREVIEW_IMAGE_BYTES = 512 * 1024;

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
  const token = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+";
  const quotedValue = '"(?:[\\t\\x20-\\x21\\x23-\\x5b\\x5d-\\x7e]|\\\\[\\t\\x20-\\x7e])*"';
  const parameterSyntax = new RegExp(
    `^\\s*${token}/${token}(?:\\s*;\\s*${token}\\s*=\\s*(?:${token}|${quotedValue}))*\\s*$`
  );
  if (contentType.length > 256 || !parameterSyntax.test(contentType)) {
    throw new Error("Preview image type is invalid");
  }

  let mimeType: string;
  try {
    mimeType = new MIMEType(contentType).essence.toLowerCase();
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
  return Number(value);
}

async function readBoundedImage(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const declaredLength = declaredImageLength(response);
  if (declaredLength !== null && declaredLength > MAX_PREVIEW_IMAGE_BYTES) {
    throw new Error("Preview image exceeds 512 KiB");
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await withDeadline(reader.read(), signal);
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_PREVIEW_IMAGE_BYTES) {
        throw new Error("Preview image exceeds 512 KiB");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const data = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
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
      const { url: validatedUrl, addresses } = await resolvePublicHttpUrl(
        currentUrl,
        dependencies.lookup,
        deadline.signal
      );
      const response = await withDeadline(
        dependencies.fetch(
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
  const preview = await fetchLinkPreview(url, dependencies);
  if (!preview.imageUrl) return { preview, image: null };

  try {
    return { preview, image: await fetchPublicImage(preview.imageUrl, dependencies) };
  } catch {
    return { preview, image: null };
  }
}
