# Calendar Subscription and Audience Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide the same resilient Google Calendar subscription flow as Orario and make global/subgroup audience selection mutually exclusive.

**Architecture:** Keep the existing server feed contract untouched and implement subscription behavior as a focused client component with pure URL helpers and in-memory per-feed attempt state. Correct audience transitions atomically inside the shared event modal so creation and editing cannot diverge.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Express, Prisma.

**Spec:** `docs/superpowers/specs/2026-09-03-calendar-subscription-and-audience-selection-design.md`

## Global Constraints

- The tokenized HTTPS feed remains canonical and must not be logged or persisted in browser storage.
- No database migration, API change, dependency upgrade, authentication change, deployment, or push.
- Every behavior change follows a witnessed RED → GREEN test cycle.
- Google first-click URL is `https://calendar.google.com/calendar/r?cid=<percent-encoded HTTPS feed URL>`.
- The manual Google settings URL is `https://calendar.google.com/calendar/u/0/r/settings/addbyurl`.

---

### Task 1: Add resilient calendar subscription controls

**Files:**
- Modify: `web/src/components/CalendarResources.tsx`
- Create: `web/src/components/CalendarSubscriptionAction.tsx`
- Modify: `web/src/index.css`
- Test: `web/src/components/CalendarResources.test.tsx`

**Interfaces:**
- Produces: `googleCalendarSubscribeUrl(httpsUrl: string): string` and `webcalUrl(httpsUrl: string): string` pure helpers.
- State: in-memory attempted-feed set keyed by canonical HTTPS URL; no storage, logging, or analytics.

- [ ] **Step 1: Add failing helper tests** asserting the exact fully encoded `/calendar/r?cid=` URL for a tokenized feed and its equivalent `webcal://` fallback.
- [ ] **Step 2: Run** `npm test --workspace web -- CalendarResources.test.tsx` and confirm the URL contract fails before implementation.
- [ ] **Step 3: Implement the pure helpers** and retain the canonical HTTPS value from the server response.
- [ ] **Step 4: Add failing interaction tests** proving the first activation opens the Google URL in a new tab, the second copies HTTPS and opens the manual dialog, clipboard rejection still opens the dialog, and distinct feeds have independent first attempts.
- [ ] **Step 5: Run the focused test** and confirm the missing interaction fails for the intended reasons.
- [ ] **Step 6: Implement the accessible interaction**: per-feed state, live clipboard status, selectable HTTPS URL, Google `addbyurl` external link, final `Prova con un'altra app calendario` webcal link, focus/Escape/close behavior, and safe external-link attributes.
- [ ] **Step 7: Preserve existing copy/download actions** and relabel the generic app action as the secondary fallback rather than the primary path.
- [ ] **Step 8: Run the focused component test** and confirm all old and new cases pass.
- [ ] **Step 9: Commit** with `git commit -m "fix(calendar): add resilient Google subscription flow"`.

### Task 2: Make event audience selection mutually exclusive

**Files:**
- Modify: `web/src/components/EventModal.tsx`
- Test: `web/src/components/EventModal.test.tsx`

**Interfaces:**
- `toggleSubgroup(id)` atomically sets `isGlobal: false` and toggles only that ID.
- Selecting `Tutti` atomically sets `isGlobal: true` and `subgroupIds: []`.

- [ ] **Step 1: Add failing create-mode tests** starting from global state, clicking one subgroup, and asserting `Tutti` is unchecked while that subgroup remains checked.
- [ ] **Step 2: Add failing targeted-mode tests** clicking `Tutti` with multiple subgroups and asserting all subgroup selections are cleared rather than hidden.
- [ ] **Step 3: Add an edit-mode payload regression test** proving the same transitions submit `isGlobal`/`subgroupIds` consistently while preserving `bachecaOnly` and unrelated fields.
- [ ] **Step 4: Run** `npm test --workspace web -- EventModal.test.tsx` and confirm the new state assertions fail.
- [ ] **Step 5: Implement both transitions as functional, atomic state updates** in the shared modal. Preserve the current invalid targeted-empty validation when `Tutti` is manually cleared.
- [ ] **Step 6: Run the focused test** and confirm all create/edit cases pass.
- [ ] **Step 7: Commit** with `git commit -m "fix(events): make audience choices exclusive"`.

### Task 3: Complete Intercomunica verification

**Files:**
- Modify only task-relevant tests or implementation needed to resolve failures.

**Interfaces:**
- Consumes Task 1 and Task 2; produces a verified main-branch state without push or deploy.

- [ ] **Step 1: Run** `npm test --workspace web` and `npm test --workspace server`; record exact pass/fail counts.
- [ ] **Step 2: Run** `npm run typecheck`.
- [ ] **Step 3: Run** `npm run build`.
- [ ] **Step 4: Inspect the repository for an existing browser suite covering calendar resources or event editing. Run that suite when present; otherwise record in the verification report that focused component coverage is the available UI gate.**
- [ ] **Step 5: Run** `git diff --check` and inspect `git status --short`.
- [ ] **Step 6: Commit only necessary verification fixes** with a specific Conventional Commit message; do not create an empty commit.
