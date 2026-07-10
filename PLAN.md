# Intercomunica — Implementation Plan & Progress

> Ralph-loop memory file. Each iteration: read this, pick next unchecked task, implement, verify, commit, update checkboxes. Keep this file truthful.

## Architecture (decided iteration 1)

- **Monorepo** npm workspaces: `server/` + `web/`
- **Backend**: Node 22, TypeScript, Express, Prisma ORM, PostgreSQL (docker-compose for dev)
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Google**: `googleapis` npm — OAuth2, Directory API, Calendar API, Gmail API
- **Auth**: Google OAuth 2.0 login → signed JWT in httpOnly cookie. Roles: `ADMIN` (presidenza/direzione, from `ADMIN_EMAILS` env + DB override) / `TEACHER`
- **Master account**: admin connects `comunicazione@rainerum.it` via OAuth offline flow; refresh token stored in `AppConfig` (encrypted with `ENCRYPTION_KEY`)
- **Event injection**: app owns per-teacher calendars in master account, shares `reader` with teacher; events written via Calendar API with `extendedProperties.private` carrying subgroup IDs + tags. Global events (visibile a tutti) → DB only, shown on bacheca.

## Task Checklist

### Iteration groundwork
- [x] git init, PLAN.md, .gitignore, workspace root
- [x] docker-compose.yml (postgres 16)
- [x] server scaffold: package.json, tsconfig, Prisma schema (full domain incl. WIP models), env config
- [x] server: express app, error handling, JWT session middleware, role guard
- [x] server: Google OAuth (user login + master account offline connect)
- [x] server: Google service wrappers (directory, calendar, gmail)
- [x] Flusso 1: setup endpoints — select main group, orchestrate calendar creation, refresh/sync (sync service + SyncLog)
- [x] Flusso 2: subgroups CRUD + member assignment (m2m) + search
- [x] Flusso 3: events CRUD, tag mgmt, injection into teacher calendars, global-flag logic, extendedProperties
- [x] Flusso 4: email module — directory view, send via Gmail API, To/Bcc selector (default To)
- [x] Flusso 5: bacheca — per-TAG sections, first 3 upcoming events per tag, personalized by membership + global events
- [x] web scaffold: Vite + React + Tailwind, router, auth context, API client
- [x] web: login page + admin settings (master connect, group select, refresh button)
- [x] web: anagrafica/directory page (members list, subgroup chips, search)
- [x] web: calendar page (month/week/day/list) + event modal (subgroups, tags, global flag)
- [x] web: email composer modal (To/Bcc selector)
- [x] web: bacheca homepage (tag sections × 3 upcoming)
- [x] WIP stubs: students/guardians models + routes; birthdays widget endpoint + RSS feed; timetable import POST endpoint
- [x] tests: crypto roundtrip, bacheca sectioning, calendar payload mapping (11 tests green)
- [x] README.md (setup, env vars, Google Cloud console steps)
- [x] Final pass iter 1: typecheck ✓, tests ✓, build ✓, server boots ✓

### Improvement backlog (next iterations)
- [ ] Prisma migration files (currently only `db push` documented) — add `prisma migrate dev --name init` output to repo
- [ ] Serve built web from Express in production (static hosting) or document deploy
- [ ] E2E smoke with real DB: docker compose + prisma push + seed script + API integration tests (vitest + supertest against test DB)
- [ ] Sync/eventi: batch Google API calls + retry with backoff on 403/429 (rate limits)
- [ ] Domain restriction on login (`hd` param / email domain check) — currently any Google account can log in as TEACHER
- [ ] Master callback: verify admin session on callback (state is signed but callback route lacks requireAdmin — browser session check)
- [ ] Tag CRUD admin UI (rename/color/delete)
- [ ] Bacheca: subscribe/ical link to personal calendar; show tag colors from DB
- [ ] Web: sync-in-progress UX (poll synclogs), synclog history view in settings
- [ ] Email: preview + rich text editor; per-user send quota guard
- [ ] Timetable import (WIP C): actual conversion to recurring events

## Verification commands
- `npm run typecheck --workspaces`
- `npm test --workspace server`
- `npm run build --workspaces`

## Iteration log
- **Iter 1 (2026-07-10)**: Full MVP implemented end-to-end. Backend: Prisma schema (core + WIP models), OAuth login + master offline connect (encrypted refresh token), Directory/Calendar/Gmail wrappers, sync service (membership diff + calendar provisioning + event reconciliation), event service (create/update/delete with per-teacher injection + global flag), bacheca service (3-per-TAG), email send (To/Bcc, Reply-To sender). Frontend: login, bacheca, directory (subgroup chips + search + email composer), FullCalendar admin calendar (month/week/day/list) + event modal, admin settings (connect/group/sync). 11 unit tests green, typecheck + build clean, server boot smoke-tested. NOT yet verified against real Google APIs/DB.
