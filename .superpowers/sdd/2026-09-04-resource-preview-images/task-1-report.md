# Task 1 report — nullable resource preview image storage

## Red / green evidence

- **Red:** `npm test --workspace server -- sharedResourceSchema.test.ts sharedResourceService.test.ts` failed as intended before implementation: the Prisma DMMF had no `previewImageData` field and public resource serialization had no `hasPreviewImage` flag. Result: 2 failed, 20 passed.
- **Green:** the same focused command passed after the schema and serialization changes. Result: 2 files passed, 22 tests passed.

## Migration inspection

`server/prisma/migrations/20260904010000_shared_resource_preview_image/migration.sql` is additive only:

```sql
ALTER TABLE "SharedResource"
  ADD COLUMN "previewImageData" BYTEA,
  ADD COLUMN "previewImageMimeType" TEXT;
```

The Prisma model uses nullable `Bytes? @db.ByteA` and `String?` fields. `prisma generate` completed successfully. `prisma validate` also passed using a local placeholder `DATABASE_URL`; it did not connect to a database.

## Changes

- Added nullable PostgreSQL preview-image byte and MIME storage plus the additive migration.
- Added `ResourceImage`, repository write fields, and a selective `findResourceImage(id)` query.
- Kept bytes out of `ResourceRecord`; `hasPreviewImage` is true only when both stored fields are non-null.
- Preserved `previewImageUrl`; new service writes retain its server-controlled `null` value.
- Added the public frontend flag, while excluding it from `SharedResourceDraft`.
- Updated typed web test fixtures for the expanded response contract.

## Files

- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260904010000_shared_resource_preview_image/migration.sql`
- `server/src/services/sharedResourceService.ts`
- `server/src/services/sharedResourceService.test.ts`
- `server/src/services/sharedResourceSchema.test.ts`
- `web/src/types.ts`
- `web/src/pages/AdminResources.test.tsx`
- `web/src/pages/Risorse.test.tsx`

## Verification

- `npm test --workspace server -- sharedResourceSchema.test.ts sharedResourceService.test.ts` — 22 passed.
- `npm test --workspace web -- AdminResources.test.tsx Risorse.test.tsx` — 18 passed.
- `npm run prisma:generate --workspace server` — passed.
- `DATABASE_URL='postgresql://preview:preview@127.0.0.1:5432/preview' npm exec --workspace server prisma validate` — passed.
- `npm run typecheck --workspace server` — passed.
- `npm run typecheck --workspace web` — passed.
- `git diff --check` — passed.

## Commit

`feat: store resource preview images`

## Concerns / follow-up

The storage boundary is complete. Preview acquisition, image lifecycle, visibility-aware serving, and UI rendering are intentionally deferred to Tasks 2–4.
