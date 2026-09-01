# Subgroup Directory and Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add readable deterministic subgroup colors, stable directory ordering, a non-admin member modal with email handoff, and immediate main-group-based access control.

**Architecture:** Persist only optional manual subgroup colors; derive automatic chip presentation in a pure frontend utility. Keep subgroup reads as the source for member details, extend teacher memberships with subgroup display metadata, and enforce authentication against synchronized `User.isActive` with explicit admin/service-account bypasses.

**Tech Stack:** Prisma/PostgreSQL, Express, Zod, React 18, TypeScript, Tailwind CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-subgroup-colors-order-and-member-modal-design.md`

## Global Constraints

- `Subgroup.color = null` means automatic color; manual colors are uppercase `#RRGGBB`.
- Automatic colors are deterministic from the subgroup name and always choose a readable foreground.
- Subgroups sort by Italian folder name, then subgroup name, then ID.
- Non-admin users open member details from subgroup cards and chips; admins keep existing mutation controls.
- Regular access requires a synchronized active user; `ADMIN_EMAILS` and `CALENDAR_EXCLUDED_EMAILS` bypass membership.
- Inactive regular sessions are rejected on their next request.
- Do not add a live Google membership lookup to login.
- Preserve the earlier commits; make one final implementation commit after all gates pass.

---

### Task 1: Enforce synchronized-group access

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/src/config.test.ts`
- Modify: `server/src/auth/session.ts`
- Create: `server/src/auth/session.test.ts`
- Modify: `server/src/routes/auth.ts`
- Modify: `web/src/api.ts`
- Create: `web/src/api.test.ts`
- Modify: `web/src/auth.tsx`
- Modify: `web/src/pages/Login.tsx`

**Interfaces:**
- Produces: `isAccessBypassEmail(email: string): boolean`.
- Produces: `canAccessApp(email: string, isActive: boolean | undefined): boolean`.
- Changes: `upsertLoginUser(profile): Promise<SessionUser | null>` where `null` means group access denied.
- Changes: `sessionMiddleware` revalidates the database user and calls `next()` without `req.user` when inactive and not bypassed.
- Produces: a shared unauthorized listener that clears frontend authentication state on any API `401`.

- [ ] **Step 1: Write failing authorization tests**

Add cases proving active regular users, admins, and calendar-excluded addresses are accepted, while missing/inactive regular users are rejected. Add a middleware case using a valid signed cookie whose DB user has become inactive and assert `req.user` stays undefined.

```ts
expect(canAccessApp("docente@rainerum.it", true)).toBe(true);
expect(canAccessApp("docente@rainerum.it", false)).toBe(false);
expect(canAccessApp("presidenza@rainerum.it", false)).toBe(true);
expect(canAccessApp("segreteria@rainerum.it", false)).toBe(true);
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace server -- src/config.test.ts src/auth/session.test.ts`

Expected: FAIL because bypass/access helpers and session revalidation do not exist.

- [ ] **Step 3: Implement minimal access policy**

Union the normalized admin and calendar-excluded sets in `isAccessBypassEmail`. In `upsertLoginUser`, read the existing user first and return `null` unless `canAccessApp` succeeds; only bypass accounts may be created when missing. Make `sessionMiddleware` async, load the session user from Prisma, use the current DB role/email, and clear rejected cookies.

In the OAuth callback:

```ts
const user = await upsertLoginUser(profile);
if (!user) {
  res.redirect(`${config().WEB_URL}/login?error=group`);
  return;
}
```

Add the Italian `group` error copy to `Login.tsx`. Have the shared API client notify `AuthProvider` on any `401`, so the current user is cleared without a page reload.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace server -- src/config.test.ts src/auth/session.test.ts && npm run typecheck --workspaces`

Expected: all selected tests pass and both workspaces typecheck.

---

### Task 2: Add optional subgroup color storage

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260901000000_subgroup_color/migration.sql`
- Create: `server/src/subgroupSchema.test.ts`

**Interfaces:**
- Produces: Prisma `Subgroup.color: string | null`.
- Produces SQL: `ALTER TABLE "Subgroup" ADD COLUMN "color" TEXT;`.

- [ ] **Step 1: Write failing schema and migration tests**

Read Prisma DMMF and assert `Subgroup` includes optional `color`. Read the migration file and assert a nullable text column is added without modifying existing rows.

```ts
const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === "Subgroup");
expect(model?.fields.find((field) => field.name === "color")?.isRequired).toBe(false);
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace server -- src/subgroupSchema.test.ts`

Expected: FAIL because `Subgroup.color` and its migration are absent.

- [ ] **Step 3: Add schema and additive SQL migration**

Add `color String?` beside `folder` and create the exact additive migration. Run Prisma generation after editing the schema.

Run: `npm run prisma:generate --workspace server`

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace server -- src/subgroupSchema.test.ts && npm run typecheck --workspace server`

Expected: schema test and server typecheck pass.

---

### Task 3: Extend subgroup API contracts

**Files:**
- Modify: `server/src/routes/subgroups.ts`
- Create: `server/src/routes/subgroups.test.ts`
- Modify: `server/src/routes/users.ts`
- Modify: `server/src/routes/users.test.ts`
- Modify: `server/src/routes/auth.ts`

**Interfaces:**
- Produces: `normalizeSubgroupInput` behavior accepting `color?: string | null` and outputting uppercase hex or null.
- Produces: subgroup list objects with `color`.
- Produces: teacher membership objects `{ id, name, folder, color }`.

- [ ] **Step 1: Write failing API normalization and payload tests**

Test lowercase manual color normalization, `null` automatic color, and rejection of malformed values such as `red` and `#123`. Extend the users payload test to require `folder` and `color` on memberships.

```ts
expect(parseSubgroup({ name: "1A", color: "#1a2b3c" }).color).toBe("#1A2B3C");
expect(parseSubgroup({ name: "1A", color: null }).color).toBeNull();
```

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace server -- src/routes/subgroups.test.ts src/routes/users.test.ts`

Expected: FAIL because color is not validated or returned and membership display metadata is incomplete.

- [ ] **Step 3: Implement API changes**

Extend the Zod schema with:

```ts
color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).transform((value) => value.toUpperCase()).optional().nullable()
```

Persist `color ?? null` on create/update, return it from `/api/subgroups`, and include `folder`/`color` in `/api/users` and `/api/auth/me` subgroup mappings.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace server -- src/routes/subgroups.test.ts src/routes/users.test.ts && npm run typecheck --workspace server`

Expected: focused tests pass.

---

### Task 4: Build deterministic chip presentation and ordering utilities

**Files:**
- Create: `web/src/subgroups.ts`
- Create: `web/src/subgroups.test.ts`
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces: `subgroupColors(name: string, override?: string | null): { background: string; foreground: string; border: string; contrast: number }`.
- Produces: `compareSubgroups(a: SubgroupRef, b: SubgroupRef): number`.
- Produces: `sortSubgroups<T extends SubgroupRef>(items: readonly T[]): T[]` without input mutation.
- Produces: `sortMembers<T extends MemberRef>(items: readonly T[]): T[]` without input mutation.

- [ ] **Step 1: Write failing pure utility tests**

Use literal expected results for at least one automatic name, verify repeatability, verify a renamed group changes the automatic color, verify manual override preservation, and assert reported contrast is at least `4.5`. Test folder/name/ID ordering and input immutability.

```ts
expect(subgroupColors("Consiglio 1A", null)).toEqual({
  background: "#8122AA",
  foreground: "#FFFFFF",
  border: "#9A4EBB",
  contrast: 7.656710172513475,
});
expect(sortSubgroups(input).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
expect(input).toEqual(original);
```

The literal values above are independently calculated from the specified FNV-1a/HSL conversion; do not compute expectations with production helpers.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace web -- src/subgroups.test.ts`

Expected: FAIL because the utility module does not exist.

- [ ] **Step 3: Implement hash, HSL conversion, luminance, contrast, and sorters**

Use 32-bit FNV-1a. Map hue to `hash % 360`, saturation to `58 + ((hash >>> 8) % 25)`, and lightness to `38 + ((hash >>> 16) % 25)`. Convert to RGB, then choose `#FFFFFF` or `#172033` by the higher WCAG contrast. Derive border by mixing the background 20% toward the selected foreground.

Extend `Subgroup`, `Member.subgroups`, and `Me.subgroups` types with nullable `folder` and `color` where returned by the API.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace web -- src/subgroups.test.ts && npm run typecheck --workspace web`

Expected: utility tests and frontend typecheck pass.

---

### Task 5: Add reusable subgroup member modal and colored chips

**Files:**
- Create: `web/src/components/SubgroupDetailsModal.tsx`
- Create: `web/src/components/SubgroupChip.tsx`
- Modify: `web/src/components/MemberSubgroupCell.tsx`
- Modify: `web/src/pages/Directory.tsx`

**Interfaces:**
- Produces: `SubgroupChip({ subgroup, interactive, onClick, children })` using `subgroupColors`.
- Produces: `SubgroupDetailsModal({ subgroup, onClose, onEmail })`.
- Changes: `MemberSubgroupCell` receives `onInspect?: (subgroupId: string) => void` and sorts chips with `sortSubgroups`.

- [ ] **Step 1: Add modal/member-order utility coverage**

Extend `web/src/subgroups.test.ts` with name/email fallback ordering and empty names. This protects the data shown by the modal without introducing a new DOM test dependency.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace web -- src/subgroups.test.ts`

Expected: FAIL until `sortMembers` implements the required fallback order.

- [ ] **Step 3: Implement accessible chip and modal components**

Use native buttons for interactive chips. Give the modal `role="dialog"`, `aria-modal="true"`, an `aria-labelledby` title, close button, Escape listener, and backdrop dismissal. Render sorted member names and emails. Disable/omit email when there are no members.

- [ ] **Step 4: Wire Directory interactions**

Keep `selectedSubgroup` separate from `emailTarget`. For non-admin users, card primary buttons and teacher chips set `selectedSubgroup`. `onEmail` clears details and sets `emailTarget`, reusing `EmailComposer`. Use `sortSubgroups` for card groups and all admin pickers.

- [ ] **Step 5: Verify component integration**

Run: `npm test --workspace web && npm run typecheck --workspace web && npm run build --workspace web`

Expected: frontend tests, types, and production bundle pass.

---

### Task 6: Add admin manual-color controls

**Files:**
- Modify: `web/src/pages/Directory.tsx`
- Modify: `web/src/components/SubgroupChip.tsx`

**Interfaces:**
- Consumes: `subgroupColors`, API `Subgroup.color`, and existing `PUT /api/subgroups/:id`.
- Produces: edit payload `{ name, folder, color }` with `null` for automatic mode.

- [ ] **Step 1: Add failing state-normalization test**

Add a pure helper in `web/src/subgroups.ts` named `normalizeColorOverride(value: string | null): string | null` and tests proving empty/automatic becomes null and valid hex becomes uppercase.

- [ ] **Step 2: Verify RED**

Run: `npm test --workspace web -- src/subgroups.test.ts`

Expected: FAIL because `normalizeColorOverride` is absent.

- [ ] **Step 3: Implement edit UI**

Add automatic/manual state, `<input type="color">`, a live `SubgroupChip` preview, and “Usa colore automatico”. Preserve the current draft on API errors. Send normalized `color` in `updateSubgroup`; creation continues to omit it and therefore defaults to null.

- [ ] **Step 4: Verify GREEN**

Run: `npm test --workspace web && npm run typecheck --workspace web && npm run build --workspace web`

Expected: all frontend gates pass.

---

### Task 7: Apply migration, verify the complete feature, commit, and push

**Files:**
- Modify if needed: `README.md`
- Modify: `docs/superpowers/specs/2026-09-01-subgroup-colors-order-and-member-modal-design.md`
- Add: all implementation files from Tasks 1–6

**Interfaces:**
- Consumes all prior task outputs.
- Produces one verified implementation commit pushed to `origin/main`.

- [ ] **Step 1: Verify migration status without destructive reset**

Run: `npm run prisma:generate --workspace server`

If a reachable development database is configured, run: `npm run prisma:migrate --workspace server -- --name subgroup_color`. Do not reset or drop any database; the committed SQL migration remains the deploy artifact when the DB is unavailable.

- [ ] **Step 2: Run complete automated gates**

Run: `git diff --check && npm test --workspaces && npm run typecheck && npm run build`

Expected: zero failures, zero type errors, successful server and Vite builds.

- [ ] **Step 3: Focused behavior audit**

Confirm from code and tests:

- automatic/manual chip colors select readable text;
- chips and cards open member details only for non-admin users;
- email handoff uses the existing subgroup and recipients;
- admin mutation controls remain usable;
- active membership and both bypass lists authorize login;
- inactive regular sessions lose authorization immediately;
- excluded service accounts remain visible inside existing subgroups.

- [ ] **Step 4: Review exact files and commit once**

Run: `git status --short && git diff --stat && git diff --check`

Stage only the spec/plan and implementation files owned by this feature, then commit:

```bash
git commit -m "feat(directory): add subgroup colors and access controls"
```

- [ ] **Step 5: Push and verify remote state**

Run: `git push origin main`

Then run: `git status --short && git log -4 --oneline`

Expected: clean worktree; implementation commit is at local and remote `main` tip.
