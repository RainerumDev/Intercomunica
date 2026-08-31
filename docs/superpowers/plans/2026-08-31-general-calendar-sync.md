# General Calendar Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional general-calendar synchronization and complete the requested event-modal fixes.

**Architecture:** Persist Google synchronization cursors and event links in Prisma, centralize all Google-to-database processing in one idempotent service, and invoke it from admin, webhook, and scheduler entry points. Keep event distribution rules in `eventService` so every source reconciles teacher calendars consistently.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, Google Calendar API, React, Vitest

**Spec:** `docs/superpowers/specs/2026-08-31-general-calendar-sync-design.md`

## Global Constraints

- Initial import covers the previous 30 days and all future events.
- Google recurring events become independently editable occurrences.
- Solo-bacheca events never reach teacher calendars.
- Existing OAuth master account remains the Google API identity.
- No new runtime dependency is required.

---

### Task 1: Persistence and Google conversion

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260831010000_general_calendar_sync/migration.sql`
- Modify: `server/src/google/calendar.ts`
- Test: `server/src/google/calendar.test.ts`

**Interfaces:**
- Produces: general-calendar event listing, watch-channel operations, and Google-event conversion helpers.

- [x] Write failing conversion tests for timed, all-day, cancelled, and imported occurrences.
- [x] Run the focused Calendar tests and confirm missing APIs fail.
- [x] Add additive schema fields and Google Calendar helper functions.
- [x] Run the focused tests and Prisma generation.

### Task 2: General synchronization service

**Files:**
- Create: `server/src/services/generalCalendarSync.ts`
- Test: `server/src/services/generalCalendarSync.test.ts`
- Modify: `server/src/services/eventService.ts`

**Interfaces:**
- Consumes: Google conversion/list/watch APIs from Task 1.
- Produces: `syncGeneralCalendar`, `configureGeneralCalendar`, `ensureGeneralCalendarWatch`, and redistribution behavior.

- [x] Write failing tests for the 30-day window and event classification rules.
- [x] Run focused tests and confirm expected failures.
- [x] Implement serialized incremental import, stale-token reset, and watch renewal.
- [x] Integrate general-copy upsert/delete with application event operations.
- [x] Run service and event tests.

### Task 3: Routes and scheduler

**Files:**
- Modify: `server/src/routes/admin.ts`
- Create: `server/src/routes/googleCalendar.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/config.ts`
- Modify: `server/.env.example`

**Interfaces:**
- Consumes: synchronization service from Task 2.
- Produces: authenticated settings/manual-sync endpoints and validated public webhook.

- [x] Write failing route-level behavior tests where practical.
- [x] Add config save, status, manual sync, and webhook routes.
- [x] Start and stop the 15-minute scheduler with the HTTP server lifecycle.
- [x] Run server tests and typecheck.

### Task 4: Administration interface

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/pages/AdminSettings.tsx`

**Interfaces:**
- Consumes: admin config and manual-sync endpoints from Task 3.
- Produces: intuitive general-calendar configuration and status controls.

- [x] Extend client types for general-calendar status.
- [x] Add calendar ID editor, save feedback, sync status, and manual action.
- [x] Run web typecheck.

### Task 5: Event modal behavior

**Files:**
- Create: `web/src/components/eventForm.ts`
- Create: `web/src/components/eventForm.test.ts`
- Modify: `web/src/components/EventModal.tsx`
- Modify: `web/package.json`

**Interfaces:**
- Produces: pure date/tag normalization helpers used by the modal.

- [x] Write failing tests for pending tags and all-day date conversion.
- [x] Implement pure normalization helpers.
- [x] Commit tags on blur/save, switch date controls, group folders, and handle Escape.
- [x] Run web tests, typecheck, and build.

### Task 6: Deployment verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: public webhook behavior and deployment environment requirements.

- [x] Document HTTPS webhook URL, configuration, and synchronization semantics.
- [x] Run Prisma validation and all repository tests.
- [x] Run production build and inspect the final diff.
