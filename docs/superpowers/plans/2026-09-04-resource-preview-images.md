# Safe Resource Preview Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real resource preview images when available without making authenticated browsers contact arbitrary third-party image hosts.

**Architecture:** Extend the existing DNS-pinned link-preview boundary to retrieve bounded Open Graph images. Persist validated bytes and MIME type in PostgreSQL, expose only a `hasPreviewImage` flag in resource JSON, and serve bytes through a visibility-checked authenticated endpoint.

**Tech Stack:** Node.js 22, Express 4, Prisma 5/PostgreSQL, React 18, TypeScript 5.7, Vitest, Supertest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-04-bacheca-risorse-rubrica-responsive-design.md`

**Prerequisite:** Complete `docs/superpowers/plans/2026-09-04-bacheca-risorse-navigation.md` first; this plan extends its authenticated `/api/resources` route and Risorse page.

## Global Constraints

- Browsers never use an external Open Graph URL as an `<img src>`.
- Image fetches accept only HTTP/HTTPS public destinations and revalidate every redirect.
- Reject private, loopback, link-local, multicast, credential-bearing, and non-image destinations.
- Accept `image/jpeg`, `image/png`, `image/webp`, and `image/gif`; reject SVG.
- Maximum stored image size is 512 KiB and timeout remains 5 seconds.
- A preview failure never prevents manual resource creation or update.
- Existing resources remain valid and use the text fallback until refreshed.
- No filesystem persistence or production deployment is introduced.

---

### Task 1: Add Nullable Preview Image Storage

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260904010000_shared_resource_preview_image/migration.sql`
- Modify: `server/src/services/sharedResourceService.ts`
- Modify: `server/src/services/sharedResourceService.test.ts`
- Create: `server/src/services/sharedResourceSchema.test.ts`
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces database fields: `previewImageData Bytes?` and `previewImageMimeType String?`.
- Produces public field: `hasPreviewImage: boolean`.
- Keeps legacy `previewImageUrl` nullable and always null in new writes.
- Produces repository methods `findResourceImage(id)` and image fields on create/update data.

- [ ] **Step 1: Write failing schema and serialization tests**

Assert the Prisma model contains both nullable fields. Extend service fixtures with image bytes and verify public records contain the boolean but never serialized bytes.

```ts
expect(resource?.fields.find(({ name }) => name === "previewImageData"))
  .toMatchObject({ type: "Bytes", isRequired: false });
expect(resource?.fields.find(({ name }) => name === "previewImageMimeType"))
  .toMatchObject({ type: "String", isRequired: false });
expect(publicRecord).toMatchObject({ hasPreviewImage: true, previewImageUrl: null });
expect(publicRecord).not.toHaveProperty("previewImageData");
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test --workspace server -- sharedResourceSchema.test.ts sharedResourceService.test.ts`

Expected: FAIL because the fields and boolean do not exist.

- [ ] **Step 3: Add schema fields and migration**

```prisma
model SharedResource {
  // existing fields remain unchanged
  previewImageData     Bytes?  @db.ByteA
  previewImageMimeType String?
}
```

Generate the migration with Prisma, inspect it, and keep the SQL additive:

```sql
ALTER TABLE "SharedResource"
  ADD COLUMN "previewImageData" BYTEA,
  ADD COLUMN "previewImageMimeType" TEXT;
```

- [ ] **Step 4: Extend repository storage without exposing bytes**

Define:

```ts
export type ResourceImage = { data: Uint8Array; mimeType: string };
export type ResourceRecord = {
  // existing JSON fields
  hasPreviewImage: boolean;
};
```

Map `hasPreviewImage` from the simultaneous presence of data and MIME. Add `findResourceImage(id): Promise<ResourceImage | null>` to `SharedResourceRepository`; Prisma selects only `previewImageData` and `previewImageMimeType` for that method. Create/update inputs accept both fields, but `toResourceRecord` omits them.

- [ ] **Step 5: Update frontend types and run tests**

Add `hasPreviewImage: boolean` to `SharedResource`. Exclude it from `SharedResourceDraft`, because it is computed by the server rather than submitted by the editor:

```ts
export type SharedResourceDraft = Omit<
  SharedResource,
  "id" | "previewFetchedAt" | "sortOrder" | "createdAt" | "updatedAt" | "hasPreviewImage"
>;
```

Keep the existing compatibility field `previewImageUrl` for this migration.

Run: `npm test --workspace server -- sharedResourceSchema.test.ts sharedResourceService.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/services/sharedResourceService.ts server/src/services/sharedResourceService.test.ts server/src/services/sharedResourceSchema.test.ts web/src/types.ts
git commit -m "feat: store resource preview images"
```

### Task 2: Fetch Bounded Public Images

**Files:**
- Modify: `server/src/services/linkPreview.ts`
- Modify: `server/src/services/linkPreview.test.ts`
- Create: `server/src/services/resourcePreviewImage.ts`
- Create: `server/src/services/resourcePreviewImage.test.ts`

**Interfaces:**
- Produces: `fetchResourcePreview(url: string): Promise<{ preview: LinkPreview; image: ResourceImage | null }>`.
- Reuses the existing DNS-pinned request path and redirect rules.
- `LinkPreview.imageUrl` is internal discovery data; API serializers must replace it with null.

- [ ] **Step 1: Write failing Open Graph URL resolution tests**

Cover absolute and relative `og:image` values, HTML without an image, a redirect to a private address, invalid MIME, an oversized response, and a successful PNG. Ensure test fetch dependencies assert the validated IP addresses are supplied.

```ts
expect((await fetchLinkPreview("https://example.org/article", relativeImageDeps)).imageUrl)
  .toBe("https://example.org/images/card.png");

await expect(fetchPublicImage("http://127.0.0.1/private.png", deps))
  .rejects.toBeInstanceOf(UnsafePreviewUrlError);
await expect(fetchPublicImage("https://example.org/card.svg", svgDeps))
  .rejects.toThrow(/image type/i);
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test --workspace server -- linkPreview.test.ts resourcePreviewImage.test.ts`

Expected: FAIL because image extraction/fetching is disabled.

- [ ] **Step 3: Resolve `og:image` against the validated final page URL**

Change metadata extraction to accept the page URL. Return a normalized HTTP/HTTPS URL only; return null for invalid protocols or credentials. Keep it as data—never generate markup from it.

```ts
function resolveImageUrl(raw: string | undefined, pageUrl: URL): string | null {
  if (!raw) return null;
  try {
    const image = new URL(raw, pageUrl);
    return ["http:", "https:"].includes(image.protocol) && !image.username && !image.password
      ? image.toString()
      : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement bounded binary fetching**

Export the existing public URL resolver inside the service module or move it to a focused internal helper. Follow at most three redirects, validate every destination, require an allowed exact MIME, reject a `content-length` above 524288, and stream at most 524288 bytes before cancelling.

```ts
export const MAX_PREVIEW_IMAGE_BYTES = 512 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function fetchResourcePreview(url: string): Promise<ResourcePreviewResult> {
  const preview = await fetchLinkPreview(url);
  if (!preview.imageUrl) return { preview, image: null };
  try {
    return { preview, image: await fetchPublicImage(preview.imageUrl) };
  } catch {
    return { preview, image: null };
  }
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test --workspace server -- linkPreview.test.ts resourcePreviewImage.test.ts`

Expected: PASS.

```bash
git add server/src/services/linkPreview.ts server/src/services/linkPreview.test.ts server/src/services/resourcePreviewImage.ts server/src/services/resourcePreviewImage.test.ts
git commit -m "feat: fetch bounded resource preview images"
```

### Task 3: Persist Previews and Serve Them with Visibility Checks

**Files:**
- Modify: `server/src/services/sharedResourceService.ts`
- Modify: `server/src/services/sharedResourceService.test.ts`
- Modify: `server/src/routes/resources.ts`
- Modify: `server/src/routes/resources.test.ts`
- Modify: `server/src/routes/publicResources.ts`
- Modify: `server/src/routes/publicResources.test.ts`

**Interfaces:**
- Consumes: `fetchResourcePreview` and `ResourceImage` from Task 2.
- Produces: `getResourceImageForUser(userId, resourceId): Promise<ResourceImage>`.
- Produces: `GET /api/resources/:id/preview-image` with `Content-Type`, private cache headers, and 404 for missing/invisible images.

- [ ] **Step 1: Write failing service lifecycle tests**

Test successful image persistence, fallback when only the image fails, clearing bytes when preview is disabled, replacing bytes on update, and denying a user outside the resource audience.

```ts
expect(repository.created[0]).toMatchObject({
  previewImageMimeType: "image/png",
  previewImageData: image.data,
});
await expect(service.getResourceImageForUser("outside-user", "resource-1"))
  .rejects.toBeInstanceOf(ResourceNotFoundError);
```

- [ ] **Step 2: Run focused service tests and confirm they fail**

Run: `npm test --workspace server -- sharedResourceService.test.ts`

Expected: FAIL because image lifecycle and visibility retrieval are missing.

- [ ] **Step 3: Integrate preview acquisition into create/update**

Inject `fetchResourcePreview` into `createSharedResourceService`. Ignore client-provided `previewImageUrl`; when enabled, persist metadata plus validated bytes. On any page-preview failure, store all preview fields as null. On image-only failure, retain site/title metadata and store image fields as null. Disabling preview explicitly clears all persisted preview fields.

- [ ] **Step 4: Write failing HTTP tests**

Assert an authenticated visible user receives exact bytes and MIME, while anonymous, invisible, missing, and image-less cases do not reveal existence.

```ts
expect(response.status).toBe(200);
expect(response.headers["content-type"]).toMatch(/^image\/png/);
expect(response.headers["cache-control"]).toBe("private, max-age=3600");
expect(Buffer.compare(response.body, pngBytes)).toBe(0);
expect(invisible.status).toBe(404);
```

- [ ] **Step 5: Implement the image endpoint and sanitize admin preview JSON**

The route calls the visibility-aware service, sets `Content-Type`, `Content-Length`, `Cache-Control: private, max-age=3600`, and sends a `Buffer`. Map both missing resource and missing image to 404. In `POST /api/admin/resources/preview`, return `imageUrl: null` even when internal discovery found an image.

- [ ] **Step 6: Run tests and commit**

Run: `npm test --workspace server -- sharedResourceService.test.ts resources.test.ts publicResources.test.ts`

Expected: PASS.

```bash
git add server/src/services/sharedResourceService.ts server/src/services/sharedResourceService.test.ts server/src/routes/resources.ts server/src/routes/resources.test.ts server/src/routes/publicResources.ts server/src/routes/publicResources.test.ts
git commit -m "feat: serve visible resource preview images"
```

### Task 4: Render Preview Images with a Stable Fallback

**Files:**
- Modify: `web/src/components/ResourceCard.tsx`
- Create: `web/src/components/ResourceCard.test.tsx`
- Modify: `web/src/components/ResourceEditor.test.tsx`
- Modify: `web/src/components/resourceForm.test.ts`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: `SharedResource.hasPreviewImage` and authenticated URL `/api/resources/:id/preview-image`.
- Preserves: unlinked admin preview cards and external safe link behavior.

- [ ] **Step 1: Write failing rendering tests**

For a persisted resource with `hasPreviewImage: true`, assert an image uses the local endpoint and has empty alt text. For false or a draft without an ID, assert the text/hostname fallback remains and no image is rendered.

```tsx
expect(screen.getByRole("img", { hidden: true }).getAttribute("src"))
  .toBe("/api/resources/resource-1/preview-image");
expect(screen.getByRole("img", { hidden: true }).getAttribute("alt")).toBe("");
expect(screen.queryByRole("img", { hidden: true })).toBeNull();
expect(screen.getByText("example.org")).toBeTruthy();
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test --workspace web -- ResourceCard.test.tsx ResourceEditor.test.tsx resourceForm.test.ts`

Expected: FAIL because `ResourceCard` always renders the fallback.

- [ ] **Step 3: Implement image/fallback rendering and responsive crop**

Narrow `ResourceCard` props so persisted records can expose the ID while drafts continue to render. Use `loading="lazy"`, `decoding="async"`, empty alt text, and `object-fit: cover`; do not add error-driven external fallback URLs.

```tsx
const imageSrc = "id" in resource && resource.hasPreviewImage
  ? `/api/resources/${encodeURIComponent(resource.id)}/preview-image`
  : null;

<div className="resource-card__preview">
  {imageSrc ? <img src={imageSrc} alt="" loading="lazy" decoding="async" />
    : <span>{resourceCardFallback(resource)}</span>}
</div>
```

- [ ] **Step 4: Run frontend tests and commit**

Run: `npm test --workspace web -- ResourceCard.test.tsx ResourceEditor.test.tsx resourceForm.test.ts Risorse.test.tsx`

Expected: PASS.

```bash
git add web/src/components/ResourceCard.tsx web/src/components/ResourceCard.test.tsx web/src/components/ResourceEditor.test.tsx web/src/components/resourceForm.test.ts web/src/index.css
git commit -m "feat: display cached resource previews"
```

### Task 5: Migration and Acceptance Verification

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Verifies Tasks 1–4 as one secure boundary.

- [ ] **Step 1: Validate migration on a disposable database**

Run Prisma migration deployment against the repository's disposable test database, then run `npx prisma validate --schema server/prisma/schema.prisma` and `npm run prisma:generate --workspace server`.

Expected: additive migration succeeds and Prisma validation exits 0.

- [ ] **Step 2: Run all checks**

```bash
npm test --workspace server
npm test --workspace web
npm run typecheck
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Verify browser behavior**

With one resource containing valid Open Graph PNG data and one without an image, confirm the first request targets only `/api/resources/:id/preview-image`, the second displays the hostname fallback, unauthorized requests return 401, invisible resources return 404, and no external image URL appears in network requests or rendered HTML.

- [ ] **Step 4: Commit verification fixes if any**

If verification required changes:

```bash
git commit -m "fix: complete secure resource preview acceptance"
```

If no files changed, do not create an empty commit.
