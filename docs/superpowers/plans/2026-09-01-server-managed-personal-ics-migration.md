# Server-Managed Personal ICS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy per-teacher Google calendars during the next group synchronization and replace them with secure, personalized ICS subscriptions exposed alongside the existing general Google Calendar on Bacheca.

**Architecture:** Keep Google as the unchanged owner and synchronization source for the general calendar, while rendering one dynamic RFC 5545 feed per eligible user directly from PostgreSQL. Preserve legacy calendar identifiers only until idempotent whole-calendar deletion succeeds; all new event writes stop fanning out to users immediately.

**Tech Stack:** Node.js 22, TypeScript, Express 4, Prisma/PostgreSQL, Google Calendar API, `ical-generator` 11, React 18, Tailwind CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-server-managed-personal-ics-migration-design.md`

## Global Constraints

- The configured general calendar remains on Google and its import, webhook, visibility, and event contents do not change.
- No code path may create, rename, populate, reconcile, or recreate a per-teacher Google calendar after deployment.
- A synchronization may clear legacy database references only after Google confirms whole-calendar deletion or reports `404`/`410`.
- The personal URL shape is `${BASE_URL}/calendar/feed/<email-local-part>-<256-bit-secret>.ics`.
- Store only a SHA-256 lookup hash and AES-GCM encrypted full path token; never store or log plaintext tokens.
- `CALENDAR_EXCLUDED_EMAILS` accounts never receive a personal feed.
- Regular inactive users receive `410` from previously valid feeds; admin bypass semantics remain intact.
- Personal feeds include global and current-subgroup events and exclude `bachecaOnly` events.
- ICS output must be deterministic for unchanged data so strong ETags remain stable.
- Keep `User.calendarId`, `User.calendarName`, and `EventInstance` during this release for safe cleanup.
- The Bacheca always displays two resource actions; unavailable actions remain visible but disabled with an explanation.
- Before the first real destructive synchronization, production must have a database backup containing the legacy calendar IDs.

---

### Task 1: Persist and reconstruct secure personal feed credentials

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260901010000_personal_calendar_feed/migration.sql`
- Create: `server/src/services/calendarFeedCredential.ts`
- Create: `server/src/services/calendarFeedCredential.test.ts`
- Modify: `server/src/subgroupSchema.test.ts`

**Interfaces:**
- Produces: `normalizeFeedPrefix(email: string): string`.
- Produces: `hashFeedToken(token: string): string`.
- Produces: `createFeedCredential(email: string, random?: (size: number) => Buffer): { token: string; tokenHash: string; tokenEnc: string; issuedAt: Date }`.
- Produces: `decryptFeedToken(tokenEnc: string): string`.
- Adds nullable `User.calendarFeedTokenHash`, `User.calendarFeedTokenEnc`, `User.calendarFeedTokenIssuedAt`, and `User.calendarFeedLastFetchedAt`.

- [ ] **Step 1: Write failing credential and schema tests**

Test the literal token prefix, URL-safe replacement, deterministic hash, encrypted round trip, different secrets, and absence of plaintext inside encrypted storage. Extend the schema test to require all four optional fields and the migration's unique index.

```ts
const fixedRandom = () => Buffer.alloc(32, 7);
const credential = createFeedCredential("Kevin.Delugan@rainerum.it", fixedRandom);
expect(credential.token).toMatch(/^kevin\.delugan-[A-Za-z0-9_-]{43}$/);
expect(hashFeedToken(credential.token)).toBe(credential.tokenHash);
expect(decryptFeedToken(credential.tokenEnc)).toBe(credential.token);
expect(credential.tokenEnc).not.toContain(credential.token);
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace server -- src/services/calendarFeedCredential.test.ts src/subgroupSchema.test.ts`

Expected: FAIL because the credential module and Prisma fields are absent.

- [ ] **Step 3: Add the additive schema migration**

Add to `User`:

```prisma
calendarFeedTokenHash       String?   @unique
calendarFeedTokenEnc        String?
calendarFeedTokenIssuedAt   DateTime?
calendarFeedLastFetchedAt   DateTime?
calendarFeedLastFetchedAt   DateTime?
```

Create additive SQL columns plus a unique index on `calendarFeedTokenHash`. Do not alter or drop legacy calendar columns or `EventInstance`.

- [ ] **Step 4: Implement credential primitives**

Use `randomBytes(32).toString("base64url")`, `createHash("sha256")`, and the existing `encrypt`/`decrypt` functions. Normalize only the local part and restrict it to `[a-z0-9._-]`, replacing runs of unsupported characters with `-`.

```ts
export function createFeedCredential(email: string, random = randomBytes) {
  const token = `${normalizeFeedPrefix(email)}-${random(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashFeedToken(token),
    tokenEnc: encrypt(token),
    issuedAt: new Date(),
  };
}
```

- [ ] **Step 5: Generate Prisma client and verify GREEN**

Run: `npm run prisma:generate --workspace server && npm test --workspace server -- src/services/calendarFeedCredential.test.ts src/subgroupSchema.test.ts && npm run typecheck --workspace server`

Expected: credential/schema tests pass and server typecheck succeeds.

- [ ] **Step 6: Commit credential storage**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260901010000_personal_calendar_feed/migration.sql server/src/services/calendarFeedCredential.ts server/src/services/calendarFeedCredential.test.ts server/src/subgroupSchema.test.ts
git commit -m "feat(calendar): add secure personal feed credentials"
```

---

### Task 2: Render deterministic personalized RFC 5545 calendars

**Files:**
- Modify: `server/package.json`
- Modify: `package-lock.json`
- Create: `server/src/services/personalCalendarFeed.ts`
- Create: `server/src/services/personalCalendarFeed.test.ts`

**Interfaces:**
- Consumes: Prisma `Event`, `EventTag`, `Tag`, and `SubgroupMember` relations.
- Produces: `type PersonalFeedEvent = Prisma.EventGetPayload<{ include: { tags: { include: { tag: true } } } }>`.
- Produces: `personalEventWhere(userId: string, subgroupIds: string[]): Prisma.EventWhereInput`.
- Produces: `renderPersonalCalendar(input: { user: { id: string; email: string; name: string | null }; events: PersonalFeedEvent[]; sourceUrl: string }): string`.
- Produces: `loadPersonalCalendar(userId: string, sourceUrl: string): Promise<string>`.

- [ ] **Step 1: Install the serializer dependency**

Run: `npm install ical-generator@^11.1.1 --workspace server`

Expected: `server/package.json` and `package-lock.json` record a Node 22-compatible dependency with built-in TypeScript types.

- [ ] **Step 2: Write failing visibility and serialization tests**

Cover the exact Prisma filter and render a fixed timed event plus an all-day event. Assert stable output across two calls, stable UID, UTC times, `VALUE=DATE`, exclusive all-day end, escaped text, `LAST-MODIFIED`, and absence of `bachecaOnly` data.

```ts
expect(personalEventWhere("u1", ["g1"])).toEqual({
  bachecaOnly: false,
  OR: [
    { isGlobal: true },
    { isGlobal: false, subgroups: { some: { subgroupId: { in: ["g1"] } } } },
  ],
});
expect(ics).toContain("UID:event-1@intercomunica.rainerum.delugan.net");
expect(ics).toContain("DTSTART:20260910T080000Z");
expect(ics).toContain("DTSTART;VALUE=DATE:20260911");
expect(renderPersonalCalendar(input)).toBe(renderPersonalCalendar(input));
```

- [ ] **Step 3: Verify RED**

Run: `npm test --workspace server -- src/services/personalCalendarFeed.test.ts`

Expected: FAIL because the feed service does not exist.

- [ ] **Step 4: Implement visibility loading and deterministic serialization**

Load current memberships first, then query all matching events ordered by `startsAt`, `id`, including tags. Configure `ical-generator` with a stable name and product ID, UTC timed events, `allDay: true` for date events, and event `stamp`/`lastModified` from `updatedAt`. Do not include the current clock anywhere in the serialized body.

```ts
calendar.createEvent({
  id: `${event.id}@intercomunica.rainerum.delugan.net`,
  start: event.startsAt,
  end: event.endsAt,
  allDay: event.allDay,
  summary: event.title,
  description: event.description ?? undefined,
  location: event.location ?? undefined,
  stamp: event.updatedAt,
  lastModified: event.updatedAt,
  categories: event.tags.map(({ tag }) => ({ name: tag.name })),
});
```

- [ ] **Step 5: Verify GREEN and build**

Run: `npm test --workspace server -- src/services/personalCalendarFeed.test.ts && npm run typecheck --workspace server && npm run build --workspace server`

Expected: feed tests, types, and build pass.

- [ ] **Step 6: Commit feed rendering**

```bash
git add server/package.json package-lock.json server/src/services/personalCalendarFeed.ts server/src/services/personalCalendarFeed.test.ts
git commit -m "feat(calendar): render personalized ICS feeds"
```

---

### Task 3: Expose secure feed and calendar-resource endpoints

**Files:**
- Create: `server/src/services/calendarLinks.ts`
- Create: `server/src/services/calendarLinks.test.ts`
- Create: `server/src/routes/calendarFeed.ts`
- Create: `server/src/routes/calendarFeed.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: Task 1 credential helpers and Task 2 `loadPersonalCalendar`.
- Produces: `generalGoogleCalendarUrl(calendarId: string): string`.
- Produces: `ensureUserFeedCredential(userId: string): Promise<StoredFeedCredential>` with concurrency-safe first creation.
- Produces: `calendarLinksForUser(userId: string): Promise<CalendarLinksResponse>`.
- Produces: `calendarLinksRouter` mounted at `/api/calendar-links`.
- Produces: `calendarFeedRouter` mounted at `/calendar/feed` before static SPA fallback.

```ts
export interface StoredFeedCredential {
  token: string;
  tokenHash: string;
  issuedAt: Date;
  lastFetchedAt: Date | null;
}

export interface CalendarLinksResponse {
  generalGoogleUrl: string | null;
  personalIcsUrl: string | null;
  personalWebcalUrl: string | null;
  personalFeedEligible: boolean;
  lastFetchedAt: Date | null;
}
```

- [ ] **Step 1: Write failing URL and credential lifecycle tests**

Assert Google URL encoding, `${BASE_URL}/calendar/feed/...ics`, `webcal://`, ineligible excluded users, stable redisplay, two concurrent initial requests resolving to the same persisted token, and rotation replacing the old hash.

```ts
expect(generalGoogleCalendarUrl("calendar id@group.calendar.google.com")).toBe(
  "https://calendar.google.com/calendar/embed?src=calendar%20id%40group.calendar.google.com&ctz=Europe%2FRome"
);
expect(links.personalIcsUrl).toMatch(
  /^https:\/\/intercomunica\.rainerum\.delugan\.net\/calendar\/feed\/kevin\.delugan-.+\.ics$/
);
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace server -- src/services/calendarLinks.test.ts`

Expected: FAIL because the links service is absent.

- [ ] **Step 3: Implement concurrency-safe credential creation and rotation**

When no token exists, create a credential and use `updateMany` guarded by `calendarFeedTokenHash: null`. Refetch the row and decrypt the winner, so concurrent first loads cannot return a token that was immediately overwritten. Rotation uses one unconditional update and returns the new links.

Eligibility is:

```ts
canAccessApp(user.email, user.isActive) && usesPersonalCalendar(user.email)
```

Build the public URL with `new URL(`/calendar/feed/${token}.ics`, config().BASE_URL)`.

- [ ] **Step 4: Write failing route tests**

Use mocked Prisma/feed services and Express response stubs to cover:

- authenticated links and rotation;
- unknown token `404`;
- inactive or excluded known user `410`;
- valid `200` content type/body;
- matching `If-None-Match` returning `304`;
- feed generation/database error returning `503` rather than a valid empty calendar;
- `calendarFeedLastFetchedAt` update for both `200` and `304`.
- privacy-safe structured outcomes for `200`, `304`, `404`, `410`, and `503` containing no token or email.

- [ ] **Step 5: Implement feed HTTP behavior**

Strip the `.ics` route suffix via Express routing, hash the remaining exact token, and query by `calendarFeedTokenHash`. Render before sending any success status. Hash the deterministic UTF-8 body for a quoted strong ETag.

```ts
res.set({
  "Content-Type": "text/calendar; charset=utf-8",
  "Content-Disposition": 'inline; filename="intercomunica.ics"',
  "Cache-Control": "private, no-cache",
  ETag: `"${createHash("sha256").update(body).digest("base64url")}"`,
});
```

Return generic bodies without email/token data. Emit a structured status-only outcome such as `calendar_feed status=304` so hosting logs can aggregate feed health without recording URL paths, tokens, or email addresses. Register the public router before production static-file and SPA fallback handlers.

- [ ] **Step 6: Verify GREEN**

Run: `npm test --workspace server -- src/services/calendarLinks.test.ts src/routes/calendarFeed.test.ts && npm run typecheck --workspace server && npm run build --workspace server`

Expected: lifecycle/route tests, types, and build pass.

- [ ] **Step 7: Commit calendar endpoints**

```bash
git add server/src/services/calendarLinks.ts server/src/services/calendarLinks.test.ts server/src/routes/calendarFeed.ts server/src/routes/calendarFeed.test.ts server/src/index.ts
git commit -m "feat(calendar): expose secure calendar subscriptions"
```

---

### Task 4: Remove personal event fan-out and retire legacy Google calendars

**Files:**
- Modify: `server/src/google/calendar.ts`
- Modify: `server/src/google/calendar.test.ts`
- Modify: `server/src/services/eventService.ts`
- Create: `server/src/services/eventService.test.ts`
- Modify: `server/src/services/syncService.ts`
- Create: `server/src/services/syncService.test.ts`
- Modify: `server/src/routes/events.ts`
- Modify: `server/src/routes/admin.ts`
- Modify: `server/src/routes/users.ts`
- Modify: `server/src/routes/users.test.ts`

**Interfaces:**
- Produces: `deleteCalendar(calendarId: string): Promise<void>` treating `404`/`410` as success.
- Produces: `retireLegacyCalendars(users, dependencies): Promise<{ calendarsRemoved: string[]; calendarsPending: string[]; errors: string[] }>`.
- Changes: `SyncResult` to `added`, `deactivated`, `reactivated`, `calendarsRemoved`, `calendarsPending`, `errors`.
- Removes: personal-target lookup, `injectForTargets`, `reconcileEvents`, and `instanceCount` from live API behavior.

```ts
export interface LegacyCalendarUser {
  id: string;
  email: string;
  calendarId: string;
}

export interface RetirementDependencies {
  deleteCalendar: (calendarId: string) => Promise<void>;
  finalizeUser: (userId: string) => Promise<void>;
  pause: (milliseconds: number) => Promise<void>;
  isUsageLimit: (error: unknown) => boolean;
}
```

- [ ] **Step 1: Write failing whole-calendar deletion tests**

Extend Google wrapper tests to assert `cal.calendars.delete({ calendarId })`; assert `404` and `410` resolve and other errors reject.

- [ ] **Step 2: Write failing retirement state-machine tests**

Inject `deleteCalendar`, `finalizeUser`, `pause`, and `isUsageLimit` dependencies. Cover success, already absent, a normal per-user failure that continues, usage-limit stop, untouched remaining users, and retry on a later call.

```ts
expect(result).toEqual({
  calendarsRemoved: ["prima@rainerum.it"],
  calendarsPending: ["seconda@rainerum.it", "terza@rainerum.it"],
  errors: [expect.stringContaining("limite operativo")],
});
expect(finalizeUser).toHaveBeenCalledWith("user-1");
expect(finalizeUser).not.toHaveBeenCalledWith("user-2");
```

- [ ] **Step 3: Write failing no-fan-out event tests**

Mock Prisma and Google wrappers. Prove create performs at most the general-calendar write, update performs at most the general-calendar update, delete performs at most the general-calendar deletion, and no `EventInstance` mutation or personal Google call occurs.

- [ ] **Step 4: Verify RED**

Run: `npm test --workspace server -- src/google/calendar.test.ts src/services/syncService.test.ts src/services/eventService.test.ts`

Expected: FAIL because whole-calendar deletion and retirement do not exist and event operations still fan out.

- [ ] **Step 5: Implement idempotent Google calendar deletion**

```ts
export async function deleteCalendar(calendarId: string): Promise<void> {
  const cal = await calendarApi();
  try {
    await withRetry(() => cal.calendars.delete({ calendarId }));
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 404 && code !== 410) throw error;
  }
}
```

- [ ] **Step 6: Simplify event operations**

Remove personal target queries and `EventInstance` loops. Keep `ensureGeneralCopy` and the existing `skipGeneral` option used by general-calendar imports. Database cascade handles legacy instance rows if an event is deleted before calendar retirement.

Remove `_count.instances` and `instanceCount` from event API serialization because it no longer describes delivery.

- [ ] **Step 7: Implement synchronization retirement**

After membership alignment, query every user with non-null `calendarId`. For each successful deletion, use a Prisma transaction:

```ts
await prisma.$transaction([
  prisma.eventInstance.deleteMany({ where: { userId } }),
  prisma.user.update({
    where: { id: userId },
    data: { calendarId: null, calendarName: null },
  }),
]);
```

Remove calendar creation, rename, and event reconciliation from `runFullSync`. Report pending users after failures or early operational-limit stop. Remove obsolete calendar-name endpoint/output from admin settings API, but retain its database column during transition.

- [ ] **Step 8: Update directory calendar semantics**

Remove `hasCalendar` from the teacher directory serializer and its frontend-facing contract later in Task 5. Extend `users.test.ts` to prove subgroup payload remains unchanged while the obsolete flag is gone.

- [ ] **Step 9: Verify GREEN and server regression suite**

Run: `npm test --workspace server && npm run typecheck --workspace server && npm run build --workspace server`

Expected: all server tests pass; build contains no personal calendar create/inject/reconcile call path.

- [ ] **Step 10: Commit retirement behavior**

```bash
git add server/src/google/calendar.ts server/src/google/calendar.test.ts server/src/services/eventService.ts server/src/services/eventService.test.ts server/src/services/syncService.ts server/src/services/syncService.test.ts server/src/routes/events.ts server/src/routes/admin.ts server/src/routes/users.ts server/src/routes/users.test.ts
git commit -m "feat(calendar): retire legacy teacher calendars"
```

---

### Task 5: Add the two permanent Bacheca calendar resources

**Files:**
- Create: `web/src/components/CalendarResources.tsx`
- Create: `web/src/components/CalendarResources.test.tsx`
- Modify: `web/src/pages/Bacheca.tsx`
- Modify: `web/src/pages/AdminSettings.tsx`
- Modify: `web/src/types.ts`

**Interfaces:**
- Consumes: `GET /api/calendar-links` and `POST /api/calendar-links/rotate` from Task 3.
- Produces: `CalendarLinks` frontend type.
- Produces: `CalendarResources({ links, onRotate })` with Google action, personal dialog, copy/webcal actions, and rotation confirmation.
- Changes: `SyncResult` frontend type to retirement counters.

- [ ] **Step 1: Write failing static render and view-model tests**

Use `react-dom/server` so no DOM dependency is added. Assert both permanent action labels render, the Google action uses the Google host, and unavailable links render disabled explanatory copy rather than disappearing.

```tsx
const html = renderToStaticMarkup(
  <CalendarResources links={links} onRotate={async () => links} />
);
expect(html).toContain("Collega calendario generale");
expect(html).toContain("Collega il mio calendario");
expect(html).toContain("calendar.google.com");
```

Extract and test a small `confirmRotation(confirm: (message: string) => boolean, rotate: () => Promise<void>)` helper so rotation never calls the API when confirmation is rejected.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace web -- src/components/CalendarResources.test.tsx`

Expected: FAIL because the resource component and types are absent.

- [ ] **Step 3: Implement the calendar resource component**

Render two cards at equal visual weight. General Google opens with `target="_blank" rel="noreferrer"`. Personal opens an accessible dialog with Escape/backdrop/close behavior, `webcal://` action, clipboard action, provider instructions, last-fetch state, and confirmed rotation.

The HTTPS URL is shown as selectable text but is not a normal download anchor.

- [ ] **Step 4: Integrate Bacheca without coupling event failure state**

Load `/api/bacheca` and `/api/calendar-links` independently. Calendar-resource errors show inside the resource panel and never hide already loaded event sections. Place resources below the greeting and above upcoming event categories, even when there are no events.

- [ ] **Step 5: Remove obsolete Settings controls and update sync reporting**

Remove the calendar-name template section and renumber the remaining sections. Change synchronization copy to “Importa i membri del gruppo e rimuove eventuali calendari personali Google ancora presenti.” Show removed and pending counts from the new `SyncResult`.

Keep general-calendar configuration and manual synchronization unchanged.

- [ ] **Step 6: Verify GREEN and frontend gates**

Run: `npm test --workspace web && npm run typecheck --workspace web && npm run build --workspace web`

Expected: resource tests, existing tests, typecheck, and production build pass.

- [ ] **Step 7: Commit Bacheca resources**

```bash
git add web/src/components/CalendarResources.tsx web/src/components/CalendarResources.test.tsx web/src/pages/Bacheca.tsx web/src/pages/AdminSettings.tsx web/src/types.ts
git commit -m "feat(bacheca): add calendar subscription resources"
```

---

### Task 6: Deployment safety, documentation, complete verification, and push

**Files:**
- Modify: `.env.production.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-01-server-managed-personal-ics-migration-design.md`
- Add: `docs/superpowers/plans/2026-09-01-server-managed-personal-ics-migration.md`
- Review: every file changed in Tasks 1–5

**Interfaces:**
- Consumes all implementation outputs.
- Produces documented backup/deploy/sync procedure and verified commits on `origin/main`.

- [ ] **Step 1: Document production origin and destructive deployment order**

Set the example production `BASE_URL` to `https://intercomunica.rainerum.delugan.net`. Document:

1. back up PostgreSQL before deployment;
2. preserve legacy `calendarId` values in that backup;
3. deploy and apply migrations;
4. confirm general calendar synchronization still succeeds;
5. run teacher synchronization;
6. repeat until `calendarsPending` is zero;
7. test one personal ICS subscription;
8. redact `/calendar/feed/` paths in infrastructure access logs.

- [ ] **Step 2: Generate Prisma and inspect migration status safely**

Run: `npm run prisma:generate --workspace server`

If a configured database is reachable, run: `npm exec prisma migrate status --workspace server -- --schema prisma/schema.prisma`. Do not run reset, drop, or destructive migration-development commands against production data.

- [ ] **Step 3: Run complete automated gates**

Run: `git diff --check && npm test --workspaces && npm run typecheck && npm run build`

Expected: zero failed tests, zero type errors, successful server build, successful Vite production bundle.

- [ ] **Step 4: Audit destructive and privacy acceptance conditions**

Confirm from code and tests:

- no personal Google calendar creation or event fan-out remains reachable;
- whole-calendar cleanup retains DB references on every non-404/410 failure;
- the general calendar still uses Google import/watch/write flows;
- feed tokens never appear in response errors or application logs;
- inactive users and excluded addresses cannot fetch personal feeds;
- both Bacheca actions remain visible and point to the correct provider;
- unchanged feed bodies produce unchanged ETags.

- [ ] **Step 5: Focused browser verification**

With local services available, verify Bacheca resource layout at mobile and desktop widths, keyboard focus, dialog Escape/backdrop behavior, clipboard feedback, disabled states, external Google URL, and token rotation confirmation. Do not invoke a real calendar deletion during UI verification.

- [ ] **Step 6: Review exact repository state and commit documentation**

Run: `git status --short && git diff --stat && git diff --check`

Stage only documentation and configuration owned by this feature, then commit:

```bash
git add .env.production.example README.md docs/superpowers/specs/2026-09-01-server-managed-personal-ics-migration-design.md docs/superpowers/plans/2026-09-01-server-managed-personal-ics-migration.md
git commit -m "docs: document personal calendar migration"
```

- [ ] **Step 7: Push and verify remote alignment**

Run: `git push origin main`

Then run: `git status -sb && git rev-parse HEAD && git rev-parse origin/main && git log -8 --oneline`

Expected: clean `main`, local HEAD equals `origin/main`, and all feature commits are present.
