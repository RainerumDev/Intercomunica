# Task 1 Report: Add the resource persistence model

## Implementation

- Added the `SharedResource` Prisma model with the exact requested fields, defaults, timestamps, subgroup relation, and `sortOrder` index.
- Added the `SharedResourceSubgroup` join model with a composite primary key, subgroup index, and cascade-delete relations to `SharedResource` and `Subgroup`.
- Added `resources SharedResourceSubgroup[]` to `Subgroup`.
- Added the additive SQL migration `20260901000000_shared_resources` creating both tables, indexes, composite primary key, and cascade foreign keys.
- Added a DMMF contract test covering the requested `SharedResource` fields and `Subgroup.resources` relation.
- Regenerated Prisma Client; `package-lock.json` was updated by the repository's npm tooling and included in the commit as requested.

## Files changed

- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260901000000_shared_resources/migration.sql`
- `server/src/services/bachecaService.test.ts`
- `package-lock.json`

## TDD evidence

### RED

Command:

```text
npm test --workspace server -- src/services/bachecaService.test.ts
```

Result: 1 failed, 5 passed. The new contract test failed with `Received: undefined` because the generated Prisma DMMF had no `SharedResource` model.

### GREEN

Commands:

```text
npm run prisma:generate --workspace server
npm test --workspace server -- src/services/bachecaService.test.ts
```

Result: focused suite passed: 1 test file, 6 tests passed.

Required broader verification:

```text
npm test --workspace server
```

Result: 9 test files, 45 tests passed. Existing `punycode` deprecation warnings remain known and non-failing.

Additional validation:

```text
DATABASE_URL='postgresql://user:pass@localhost:5432/db' npx prisma validate --schema server/prisma/schema.prisma
```

Result: schema is valid. `git diff --check` passed.

## Self-review

- Confirmed all requested scalar fields and relation names match the brief verbatim.
- Confirmed migration SQL is additive and includes the requested primary key, indexes, cascade deletion, and timestamp/default definitions.
- Confirmed the contract test checks both resource fields and the reverse subgroup relation.
- No unrelated source changes were introduced.

## Commit

`5fb2bad feat(resources): add shared resource schema`
