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
- [ ] docker-compose.yml (postgres 16)
- [ ] server scaffold: package.json, tsconfig, Prisma schema (full domain incl. WIP models), env config
- [ ] server: express app, error handling, JWT session middleware, role guard
- [ ] server: Google OAuth (user login + master account offline connect)
- [ ] server: Google service wrappers (directory, calendar, gmail)
- [ ] Flusso 1: setup endpoints — select main group, orchestrate calendar creation, refresh/sync (sync service + SyncLog)
- [ ] Flusso 2: subgroups CRUD + member assignment (m2m) + search
- [ ] Flusso 3: events CRUD, tag mgmt, injection into teacher calendars, global-flag logic, extendedProperties
- [ ] Flusso 4: email module — directory view, send via Gmail API, To/Bcc selector (default To)
- [ ] Flusso 5: bacheca — per-TAG sections, first 3 upcoming events per tag, personalized by membership + global events
- [ ] web scaffold: Vite + React + Tailwind, router, auth context, API client
- [ ] web: login page + admin settings (master connect, group select, refresh button)
- [ ] web: anagrafica/directory page (members list, subgroup chips, search)
- [ ] web: calendar page (month/week/day/list) + event modal (subgroups, tags, global flag)
- [ ] web: email composer modal (To/Bcc selector)
- [ ] web: bacheca homepage (tag sections × 3 upcoming)
- [ ] WIP stubs: students/guardians models + empty routes; birthdays widget endpoint + RSS feed stub; timetable import POST endpoint stub
- [ ] tests: unit tests for services (sync diff, bacheca query, event injection payload)
- [ ] README.md (setup, env vars, Google Cloud console steps)
- [ ] Final pass: typecheck, lint, tests green, docs accurate

## Verification commands
- `npm run typecheck --workspaces`
- `npm test --workspace server`
- `npm run build --workspaces`

## Iteration log
- **Iter 1 (2026-07-10)**: repo bootstrap, architecture decided, scaffolding started.
