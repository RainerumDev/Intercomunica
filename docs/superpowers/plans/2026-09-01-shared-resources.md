# Shared Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-managed, audience-filtered link cards with safe optional previews to the Intercomunica bacheca while preserving the current event behavior.

**Architecture:** Add additive Prisma models for resources and subgroup targeting, isolate URL-preview security behind an injected fetch/DNS boundary, and expose admin CRUD/order endpoints plus one aggregated bacheca response. Keep UI state and form normalization in focused modules so behavior can be tested without coupling tests to CSS.

**Tech Stack:** Node.js 22, TypeScript 5.7, Express 4, Prisma 5, PostgreSQL 16, Zod 3, React 18, Vite 6, Tailwind CSS 4, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-09-01-shared-resources-and-rainerum-ui-design.md`

## Global Constraints

- Resources contain links and metadata only; never accept file uploads.
- Preview fetching accepts only public HTTP/HTTPS destinations and revalidates every redirect.
- Previews are text/site/domain only. Ignore external image metadata, keep persisted image fields null, and never issue browser image requests unless a separately approved server-side proxy/cache is implemented.
- Resource visibility is enforced on the server: global or at least one subgroup in common.
- Existing event sectioning, filtering, and limits remain unchanged.
- Intercomunica remains on React 18 in this plan.
- Do not deploy or migrate production.

---

### Task 1: Add the resource persistence model

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260901000000_shared_resources/migration.sql`
- Modify: `server/src/services/bachecaService.test.ts`

**Interfaces:**
- Produces: Prisma models `SharedResource` and `SharedResourceSubgroup`.
- Produces: ordered resources with `subgroups` relations consumable by later services.

- [ ] **Step 1: Add a failing schema-contract test**

Add a test that reads the Prisma DMMF and asserts that `SharedResource` exposes `url`, `title`, `description`, `previewEnabled`, `previewImageUrl`, `previewSiteName`, `isGlobal`, `sortOrder`, `previewFetchedAt`, `createdAt`, `updatedAt`, and `subgroups`, and that `Subgroup` exposes `resources`.

```ts
import { Prisma } from "@prisma/client";

it("exposes the shared-resource persistence contract", () => {
  const resource = Prisma.dmmf.datamodel.models.find((model) => model.name === "SharedResource");
  expect(resource?.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
    "id", "url", "title", "description", "previewEnabled", "previewImageUrl",
    "previewSiteName", "isGlobal", "sortOrder", "previewFetchedAt",
    "createdAt", "updatedAt", "subgroups",
  ]));
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test --workspace server -- src/services/bachecaService.test.ts`

Expected: FAIL because the generated client has no `SharedResource` model.

- [ ] **Step 3: Add the additive Prisma models and migration**

Use this model contract:

```prisma
model SharedResource {
  id               String   @id @default(cuid())
  url              String
  title            String
  description      String?
  previewEnabled   Boolean  @default(true)
  previewImageUrl  String?
  previewSiteName  String?
  isGlobal         Boolean  @default(false)
  sortOrder        Int
  previewFetchedAt DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  subgroups        SharedResourceSubgroup[]

  @@index([sortOrder])
}

model SharedResourceSubgroup {
  resourceId String
  subgroupId String
  resource   SharedResource @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  subgroup   Subgroup       @relation(fields: [subgroupId], references: [id], onDelete: Cascade)

  @@id([resourceId, subgroupId])
  @@index([subgroupId])
}
```

Add `resources SharedResourceSubgroup[]` to `Subgroup`. The SQL migration must create both tables, the composite primary key, foreign keys with cascade deletion, and indexes on `sortOrder` and `subgroupId`.

- [ ] **Step 4: Regenerate Prisma and rerun the test**

Run: `npm run prisma:generate --workspace server`

Run: `npm test --workspace server -- src/services/bachecaService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the persistence slice**

```bash
git add server/prisma server/src/services/bachecaService.test.ts package-lock.json
git commit -m "feat(resources): add shared resource schema"
```

---

### Task 2: Implement safe link-preview fetching

**Files:**
- Create: `server/src/services/linkPreview.test.ts`
- Create: `server/src/services/linkPreview.ts`

**Interfaces:**
- Produces: `fetchLinkPreview(url: string, dependencies?: LinkPreviewDependencies): Promise<LinkPreview>`.
- Produces: `LinkPreview = { finalUrl: string; title: string | null; description: string | null; imageUrl: null; siteName: string | null }`; the image field remains only for contract compatibility.
- Produces: `UnsafePreviewUrlError` for blocked schemes or destinations.
- Consumes: injected `lookup(hostname)` and `fetch(url, init)` in tests; production defaults use `node:dns/promises` and global `fetch`.

- [ ] **Step 1: Write failing tests for the security boundary**

Cover these observable breaks with literal fixtures:

```ts
it.each(["file:///etc/passwd", "ftp://example.com/file", "http://127.0.0.1", "http://[::1]"])(
  "rejects unsafe preview destination %s",
  async (url) => expect(fetchLinkPreview(url, fakePublicDependencies)).rejects.toBeInstanceOf(UnsafePreviewUrlError)
);

it("revalidates a redirect destination", async () => {
  const dependencies = previewDependencies([
    new Response(null, { status: 302, headers: { location: "http://10.0.0.8/private" } }),
  ]);
  await expect(fetchLinkPreview("https://example.org", dependencies)).rejects.toBeInstanceOf(UnsafePreviewUrlError);
});
```

Also cover DNS resolving to private IPv4/IPv6, more than three redirects, non-HTML content, response bodies over 1 MiB, and a 5-second timeout.

- [ ] **Step 2: Run the preview tests and verify the expected failure**

Run: `npm test --workspace server -- src/services/linkPreview.test.ts`

Expected: FAIL because `linkPreview.ts` does not exist.

- [ ] **Step 3: Implement destination validation and bounded fetching**

Implement `validatePublicHttpUrl`, `isPublicAddress`, and a manual redirect loop. Set `redirect: "manual"`, an `AbortSignal.timeout(5000)`, `Accept: text/html`, a maximum of three redirects, and stop reading after 1 MiB. Resolve every hostname immediately before requesting it and reject the request if any returned address is non-public.

- [ ] **Step 4: Rerun the focused security tests**

Run: `npm test --workspace server -- src/services/linkPreview.test.ts`

Expected: security tests PASS; metadata extraction tests are not present yet.

- [ ] **Step 5: Write failing metadata extraction tests**

Use a literal HTML fixture with attributes in mixed order and both single and double quotes. Assert this literal result:

```ts
expect(await fetchLinkPreview("https://example.org/article", dependencies)).toEqual({
  finalUrl: "https://example.org/article",
  title: "Open day 2026",
  description: "Programma e prenotazioni",
  imageUrl: null,
  siteName: "Rainerum",
});
```

Add fallback tests for `<title>`, ignored `og:image` metadata, and missing metadata returning nulls.

- [ ] **Step 6: Implement metadata extraction and rerun tests**

Parse only the first 1 MiB, decode HTML entities needed by titles/descriptions, normalize whitespace, prefer `og:title`, `og:description`, and `og:site_name`, ignore `og:image`, and fall back to `<title>` for the title.

Run: `npm test --workspace server -- src/services/linkPreview.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the preview slice**

```bash
git add server/src/services/linkPreview.ts server/src/services/linkPreview.test.ts
git commit -m "feat(resources): fetch safe link previews"
```

---

### Task 3: Add resource validation and service behavior

**Files:**
- Create: `server/src/services/sharedResourceService.test.ts`
- Create: `server/src/services/sharedResourceService.ts`

**Interfaces:**
- Produces: `resourceInputSchema` and `resourceOrderSchema`.
- Produces: `createResource`, `updateResource`, `deleteResource`, `listAdminResources`, `listResourcesForUser`, and `reorderResources`.
- Consumes: Prisma `SharedResource` models from Task 1 and `fetchLinkPreview` from Task 2.

- [ ] **Step 1: Write failing validation and visibility tests**

Test these exact rules:

- title is trimmed and must contain 1–160 characters;
- description is nullable and capped at 500 characters;
- URL must use HTTP/HTTPS;
- `isGlobal: false` requires at least one distinct subgroup ID;
- `isGlobal: true` normalizes subgroup IDs to an empty list;
- visible resources are global or share at least one subgroup with the user;
- resources are sorted by `sortOrder`, then `createdAt`, then `id`.

Use a repository fake that records data and returns real resource objects; assert returned resources and persisted state, not calls to the fake.

- [ ] **Step 2: Run the service tests and verify the expected failure**

Run: `npm test --workspace server -- src/services/sharedResourceService.test.ts`

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement schemas, normalization, visibility and CRUD**

Define the external input shape exactly:

```ts
export type SharedResourceInput = {
  url: string;
  title: string;
  description: string | null;
  previewEnabled: boolean;
  previewImageUrl: string | null;
  previewSiteName: string | null;
  isGlobal: boolean;
  subgroupIds: string[];
};
```

Creation assigns `max(sortOrder) + 1`. Updates replace subgroup relations transactionally. Preview image URLs are never persisted; disabling preview also clears site name and fetched timestamp. Deletion closes the order gap by normalizing remaining positions.

- [ ] **Step 4: Write the failing reorder test**

Assert that `reorderResources(["r3", "r1", "r2"])` stores contiguous values `0, 1, 2`, and rejects missing, duplicate, or foreign IDs without partial changes.

- [ ] **Step 5: Implement transactional reordering and rerun tests**

Run: `npm test --workspace server -- src/services/sharedResourceService.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the service slice**

```bash
git add server/src/services/sharedResourceService.ts server/src/services/sharedResourceService.test.ts
git commit -m "feat(resources): manage targeted shared links"
```

---

### Task 4: Expose admin resource endpoints

**Files:**
- Create: `server/src/routes/resources.test.ts`
- Create: `server/src/routes/resources.ts`
- Modify: `server/src/index.ts`
- Modify: `server/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `resourcesRouter`, mounted at `/api/admin/resources`.
- Consumes: resource schemas/services from Task 3 and `fetchLinkPreview` from Task 2.

- [ ] **Step 1: Install the request-test dependency**

Run: `npm install --save-dev supertest @types/supertest --workspace server`

Expected: `server/package.json` and the root lockfile record exact resolved versions without changing production dependencies.

- [ ] **Step 2: Write failing request-handler tests**

Exercise the real Express app with Supertest and signed session-cookie fixtures. Tests must cover:

- unauthenticated request returns `401`;
- teacher request returns `403`;
- admin `GET /api/admin/resources` returns ordered resources;
- invalid create returns `400` with no persisted row;
- valid create returns `201`;
- preview failure returns a bounded error and does not create a row;
- update, delete, and reorder return the documented resource/order results.

- [ ] **Step 3: Run the route tests and verify the expected failure**

Run: `npm test --workspace server -- src/routes/resources.test.ts`

Expected: FAIL with `404` because the router is not mounted.

- [ ] **Step 4: Implement and mount the admin router**

Use these routes under `/api/admin/resources`:

```text
GET    /
POST   /preview
POST   /
PUT    /order
PUT    /:id
DELETE /:id
```

Apply `requireAdmin` to the router before handlers. Parse every body with `parseBody`; never accept preview metadata or subgroup IDs outside the validated schemas.

- [ ] **Step 5: Run focused and full server tests**

Run: `npm test --workspace server -- src/routes/resources.test.ts`

Run: `npm test --workspace server`

Expected: PASS.

- [ ] **Step 6: Commit the API slice**

```bash
git add server/package.json package-lock.json server/src/routes/resources.ts server/src/routes/resources.test.ts server/src/index.ts
git commit -m "feat(resources): add admin resource API"
```

---

### Task 5: Aggregate resources into the bacheca contract

**Files:**
- Modify: `server/src/services/bachecaService.test.ts`
- Modify: `server/src/services/bachecaService.ts`
- Modify: `server/src/routes/bacheca.ts`

**Interfaces:**
- Produces: `BachecaPayload = { resources: BachecaResource[]; eventSections: BachecaSection[] }`.
- Produces: `bachecaForUser(userId: string): Promise<BachecaPayload>`.
- Preserves: `buildSections(events): BachecaSection[]` unchanged.

- [ ] **Step 1: Write a failing aggregation test**

Use repository fakes to assert that a user in subgroup `g1` receives global resources plus resources targeted to `g1`, excludes `g2`-only resources, preserves `sortOrder`, and receives the same event sections as `buildSections`.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test --workspace server -- src/services/bachecaService.test.ts`

Expected: FAIL because `bachecaForUser` returns only event sections.

- [ ] **Step 3: Implement the aggregated response**

Reuse `listResourcesForUser`; do not duplicate its visibility query. Extract the existing event query into `eventSectionsForUser(userId: string): Promise<BachecaSection[]>`, then compose both promises into `{ resources, eventSections }`.

- [ ] **Step 4: Rerun focused and full server tests**

Run: `npm test --workspace server -- src/services/bachecaService.test.ts`

Run: `npm test --workspace server`

Expected: PASS with the five existing event-section tests unchanged.

- [ ] **Step 5: Commit the bacheca backend slice**

```bash
git add server/src/services/bachecaService.ts server/src/services/bachecaService.test.ts server/src/routes/bacheca.ts
git commit -m "feat(bacheca): include visible shared resources"
```

---

### Task 6: Add tested frontend models and form behavior

**Files:**
- Modify: `web/src/types.ts`
- Create: `web/src/components/resourceForm.test.ts`
- Create: `web/src/components/resourceForm.ts`

**Interfaces:**
- Produces: `SharedResource`, `SharedResourceDraft`, and `BachecaPayload` frontend types.
- Produces: `emptyResourceDraft`, `normalizeResourceDraft`, `moveResourceId`, and `resourceCardFallback`.

- [ ] **Step 1: Write failing pure-behavior tests**

Assert that normalization trims fields, removes duplicate subgroup IDs, clears subgroup IDs for global resources, clears preview metadata when disabled, and that `moveResourceId` respects first/last boundaries without mutating its input.

- [ ] **Step 2: Run the web test and verify the expected failure**

Run: `npm test --workspace web -- src/components/resourceForm.test.ts`

Expected: FAIL because `resourceForm.ts` does not exist.

- [ ] **Step 3: Implement minimal models and helpers**

Use the server contract names exactly. Normalization always clears `previewImageUrl`. `resourceCardFallback` returns `previewSiteName` when present, otherwise `new URL(url).hostname` with the leading `www.` removed.

- [ ] **Step 4: Rerun the focused test**

Run: `npm test --workspace web -- src/components/resourceForm.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the frontend model slice**

```bash
git add web/src/types.ts web/src/components/resourceForm.ts web/src/components/resourceForm.test.ts
git commit -m "feat(resources): add frontend resource model"
```

---

### Task 7: Build the admin resource tab

**Files:**
- Create: `web/src/components/ResourceCard.tsx`
- Create: `web/src/components/ResourceEditor.tsx`
- Create: `web/src/pages/AdminResources.tsx`
- Modify: `web/src/pages/AdminSettings.tsx`
- Modify: `web/src/api.ts`

**Interfaces:**
- Consumes: `/api/admin/resources` endpoints and form helpers from Task 6.
- Produces: `AdminResources` rendered inside the `Risorse condivise` tab.
- Preserves: current calendar settings component and all existing requests.

- [ ] **Step 1: Extract the current settings body without changing behavior**

Rename the current default implementation to `CalendarSettings` in the same file. Keep state, effects, request paths, labels, and button behavior unchanged. Run `npm run typecheck --workspace web` and `npm run build --workspace web` before adding the tab shell.

- [ ] **Step 2: Implement the tab shell and resource editor**

Use real buttons with `role="tab"`, `aria-selected`, and matching `role="tabpanel"`. Default to `Calendario`. The resource editor exposes URL, `Genera anteprima`, `Mostra anteprima`, title, description, `Per tutti`, subgroup choices, a text/site/domain preview, cancel, and save. Preview errors remain local and never clear draft fields. `ResourceCard` never renders an external preview image.

- [ ] **Step 3: Implement list mutations and accessible ordering**

After create/update/delete, replace local data with the API response or refetch. `Sposta su` and `Sposta giù` call `moveResourceId`, persist the complete ID order, disable at boundaries, and roll back local order if the request fails.

- [ ] **Step 4: Verify frontend behavior**

Run: `npm test --workspace web`

Run: `npm run typecheck --workspace web`

Run: `npm run build --workspace web`

Expected: all commands exit 0.

- [ ] **Step 5: Commit the admin UI slice**

```bash
git add web/src/api.ts web/src/components/ResourceCard.tsx web/src/components/ResourceEditor.tsx web/src/pages/AdminResources.tsx web/src/pages/AdminSettings.tsx
git commit -m "feat(settings): manage shared resources"
```

---

### Task 8: Replace the bacheca presentation without regressing events

**Files:**
- Modify: `web/src/pages/Bacheca.tsx`
- Reuse: `web/src/components/ResourceCard.tsx`

**Interfaces:**
- Consumes: `BachecaPayload` from `/api/bacheca`.
- Preserves: date formatting, event category ordering, event card content, and empty event behavior.

- [ ] **Step 1: Change the fetch contract and render resources first**

Fetch `BachecaPayload`, render `Risorse condivise` before `Prossimi eventi`, and keep separate loading/error/empty states. Resource links use `target="_blank"` and `rel="noopener noreferrer"`.

- [ ] **Step 2: Verify both independent empty states manually in development**

Exercise: no resources with events, resources with no events, neither collection, text/domain preview fallback, ignored legacy image URL, long title, and subgroup-only resource. Confirm one empty collection never hides the other.

- [ ] **Step 3: Run the frontend gates**

Run: `npm test --workspace web`

Run: `npm run typecheck --workspace web`

Run: `npm run build --workspace web`

Expected: all commands exit 0.

- [ ] **Step 4: Commit the new bacheca**

```bash
git add web/src/pages/Bacheca.tsx
git commit -m "feat(bacheca): show shared links with events"
```

---

### Task 9: Verify the complete Intercomunica slice and stop

**Files:**
- None expected; a failing acceptance check returns execution to the owning task before this task is rerun.

**Interfaces:**
- Verifies the complete shared-resource feature before visual alignment work begins.

- [ ] **Step 1: Apply the migration to an isolated development database**

Run: `npm run prisma:migrate --workspace server`

Expected: migration applies without altering existing tables beyond the new relations.

- [ ] **Step 2: Run every automated gate**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all exit 0 with no failures.

- [ ] **Step 3: Review the acceptance checklist**

Confirm CRUD, global/subgroup visibility, safe preview failure, order persistence, event regression, no upload surface, and no production changes. Record any verification requiring a real signed-in session for the final browser phase.
