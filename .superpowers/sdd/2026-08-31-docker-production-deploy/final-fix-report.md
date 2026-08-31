# Docker Production Final-Fix Report

**Date:** 2026-08-31
**Worktree:** `codex/docker-production`
**Implementation commit:** `b65b2f0 fix(docker): harden production deployment`

## Status

Completed the single final-review fix wave without dispatching subagents. No production deployment was performed.

## Files changed

- `.env.production.example` — documents the direct `DATABASE_URL` interpolation constraint and uses a 64-character hexadecimal password placeholder.
- `docker-compose.dev.yml` — restores the local, DB-only PostgreSQL development path with host port `5432`.
- `README.md` — updates development startup, requires and preflights the NPM proxy network, documents the hex-password generation command, custom-port health checks, and proxy-alias isolation.
- `docs/superpowers/specs/2026-08-31-docker-production-deploy-design.md` — records Debian slim as the Prisma/OpenSSL-compatible application-image choice and the deferred route-level health test.
- `docs/superpowers/plans/2026-08-31-docker-production-deploy.md` — aligns Node image references with Debian slim, documents the Compose/dev split, and adds explicit deferred follow-ups.
- `PLAN.md` — records the deferred route-level health test and a non-automatic `npm audit` review.

## Completed findings

- `POSTGRES_PASSWORD` must be generated with `openssl rand -hex 32`; only URL-safe hexadecimal values are supported because Compose assembles `DATABASE_URL` without percent-encoding.
- Production now clearly requires an existing `PROXY_NETWORK`; the documented preflight is `docker network inspect "$PROXY_NETWORK"` after inspecting Nginx Proxy Manager's actual container networks. Documentation explicitly forbids creating or guessing a replacement network.
- Local development uses `docker compose -f docker-compose.dev.yml up -d` and no longer starts the production proxy-dependent stack.
- The stable `intercomunica` alias is documented as unique on `PROXY_NETWORK`; parallel staging requires a distinct network and alias.
- Health-check curl examples state their `APP_PORT=3000` assumption and provide `docker compose ... port app 3000` for custom host ports.
- Debian slim is documented as the intentional application-image base because of Prisma glibc and OpenSSL support; PostgreSQL remains Alpine.
- The route-level health test and `npm audit` review are recorded as follow-ups without adding dependencies or blindly upgrading packages.

## Validation

All commands below completed successfully from the deployment worktree:

```bash
# A temporary external proxy network and temporary env file were created,
# inspected, used for this validation, then removed by a shell cleanup trap.
docker network create "$network_name"
docker network inspect "$network_name"
docker compose -f docker-compose.dev.yml config --quiet
docker compose --env-file "$env_file" config --quiet
docker compose --env-file "$env_file" config --services

npm run typecheck
npm test
npm run build
git diff cbb4e5abecf8522bc4e16965471de01dd0807647...HEAD --check
git diff --check
```

Results:

- Development Compose config validated; service list is `db`.
- Production Compose config validated using the example env with a temporary existing proxy network; service list is `db`, `app`.
- The temporary `/private/tmp` env file and Docker proxy network were removed; no temporary environment or network remains.
- Typecheck passed for both `server` and `web` workspaces.
- Tests passed: 8 files, 36 tests.
- Production build passed for both workspaces.
- Branch-range and working-tree whitespace checks passed at validation time.

## Concerns and follow-up

- Vitest emits Node's `DEP0040` warning for the deprecated `punycode` module; it does not fail the test suite and is not changed in this fix wave.
- The actual Nginx Proxy Manager network and production credentials remain operator-supplied deployment prerequisites.
- The route-level `/api/health` integration test and a reviewed, targeted response to `npm audit` remain intentionally deferred in `PLAN.md`.
