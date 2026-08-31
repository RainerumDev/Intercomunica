# Docker Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the complete Intercomunica application and PostgreSQL database as a production-ready Docker Compose stack for a single VPS behind Nginx Proxy Manager.

**Architecture:** A multi-stage Node.js 22 image builds both workspaces and runs Express as an unprivileged user. Docker Compose connects that container to an internal PostgreSQL 16 service, applies versioned Prisma migrations on startup, publishes only the application on VPS loopback, and exposes database-aware healthchecks.

**Tech Stack:** Docker Engine, Docker Compose v2, Node.js 22 Debian slim, npm workspaces, Express, React/Vite, Prisma 5, PostgreSQL 16 Alpine

**Spec:** `docs/superpowers/specs/2026-08-31-docker-production-deploy-design.md`

## Global Constraints

- Target one Linux VPS running Docker Compose behind an existing Nginx Proxy Manager HTTPS endpoint.
- Publish the application only on `127.0.0.1:3000`; do not publish PostgreSQL.
- Run the application process as the unprivileged `node` user.
- Use `prisma migrate deploy` for production schema changes; never run `prisma db push` in the production container.
- Keep all production credentials out of tracked files.
- Generate `POSTGRES_PASSWORD` with `openssl rand -hex 32`; Compose interpolates it directly into `DATABASE_URL`, so arbitrary punctuation passwords are unsupported.
- Preserve the existing Node.js 22, PostgreSQL 16, Express, Prisma, and Vite stack.
- Do not configure Nginx Proxy Manager, DNS, firewall rules, or automated off-site backups in this repository.

The application image intentionally uses Debian slim rather than Alpine: Prisma is supported on its glibc base and OpenSSL is installed reliably with `apt`. PostgreSQL remains on its Alpine image; the small Node image-size trade-off avoids Alpine-specific Prisma/OpenSSL compatibility handling.

---

### Task 1: Database-aware application health

**Files:**
- Create: `server/src/health.ts`
- Create: `server/src/health.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: exported `prisma` instance from `server/src/db.ts`.
- Produces: `checkDatabase(query?: () => Promise<unknown>): Promise<boolean>` and `GET /api/health` responses `{ ok: true, app: "intercomunica", database: "up" }` or HTTP 503 `{ ok: false, app: "intercomunica", database: "down" }`.

- [ ] **Step 1: Write failing health tests**

Create `server/src/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkDatabase } from "./health.js";

describe("checkDatabase", () => {
  it("returns true when the database query succeeds", async () => {
    await expect(checkDatabase(async () => [{ result: 1 }])).resolves.toBe(true);
  });

  it("returns false when the database query fails", async () => {
    await expect(
      checkDatabase(async () => {
        throw new Error("database unavailable");
      })
    ).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Verify the test fails for the missing module**

Run: `npm test --workspace server -- src/health.test.ts`

Expected: FAIL because `server/src/health.ts` does not exist.

- [ ] **Step 3: Implement the health checker**

Create `server/src/health.ts`:

```ts
import { prisma } from "./db.js";

export async function checkDatabase(
  query: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`
): Promise<boolean> {
  try {
    await query();
    return true;
  } catch {
    return false;
  }
}
```

Change `/api/health` in `server/src/index.ts` to await `checkDatabase()` and return HTTP 503 when it is false.

- [ ] **Step 4: Verify health tests and server typecheck**

Run: `npm test --workspace server -- src/health.test.ts && npm run typecheck --workspace server`

Expected: 2 tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit database-aware health**

```bash
git add server/src/health.ts server/src/health.test.ts server/src/index.ts
git commit -m "feat(server): report database health"
```

### Task 2: Versioned initial Prisma migration

**Files:**
- Create: `server/prisma/migrations/20260831000000_init/migration.sql`
- Create: `server/prisma/migrations/migration_lock.toml`

**Interfaces:**
- Consumes: current `server/prisma/schema.prisma` as the canonical desired schema.
- Produces: a PostgreSQL migration history accepted by `prisma migrate deploy` on a fresh database.

- [ ] **Step 1: Generate the initial migration from an empty database model**

Run:

```bash
mkdir -p server/prisma/migrations/20260831000000_init
./node_modules/.bin/prisma migrate diff \
  --from-empty \
  --to-schema-datamodel server/prisma/schema.prisma \
  --script > server/prisma/migrations/20260831000000_init/migration.sql
printf 'provider = "postgresql"\n' > server/prisma/migrations/migration_lock.toml
```

Expected: SQL contains `CREATE TYPE`, `CREATE TABLE`, indexes, and foreign keys for every model in `schema.prisma`.

- [ ] **Step 2: Verify migration/schema equivalence without modifying development data**

Run:

```bash
./node_modules/.bin/prisma migrate diff \
  --from-migrations server/prisma/migrations \
  --to-schema-datamodel server/prisma/schema.prisma \
  --shadow-database-url "$DATABASE_URL" \
  --exit-code
```

Expected: exit 0 and `No difference detected` against a disposable database URL. If the local database cannot safely serve as a shadow database, run this check against the temporary Docker database created in Task 5 instead; never point `--shadow-database-url` at production.

- [ ] **Step 3: Inspect migration for destructive statements**

Run: `rg -n 'DROP|TRUNCATE|DELETE' server/prisma/migrations/20260831000000_init/migration.sql`

Expected: no matches.

- [ ] **Step 4: Commit the migration baseline**

```bash
git add server/prisma/migrations
git commit -m "feat(db): add initial Prisma migration"
```

### Task 3: Production application image

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker/entrypoint.sh`

**Interfaces:**
- Consumes: root `package-lock.json`, npm workspaces, `server/prisma`, compiled `server/dist`, and compiled `web/dist`.
- Produces: image command `/app/docker/entrypoint.sh`, listening on container port 3000 and applying migrations before server startup.

- [ ] **Step 1: Add an image-structure validation script that initially fails**

Run before creating files:

```bash
test -f Dockerfile && test -f .dockerignore && test -x docker/entrypoint.sh
```

Expected: non-zero exit because the production image files do not exist.

- [ ] **Step 2: Create the entrypoint**

Create executable `docker/entrypoint.sh`:

```sh
#!/bin/sh
set -eu

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy --schema server/prisma/schema.prisma

echo "Starting Intercomunica..."
exec node server/dist/index.js
```

- [ ] **Step 3: Create the multi-stage Dockerfile**

Use four stages:

```dockerfile
FROM node:22-bookworm-slim AS dependencies
RUN apt-get update \
  && apt-get install --no-install-recommends -y openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

FROM dependencies AS build
COPY server server
COPY web web
RUN npm run prisma:generate --workspace server && npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install --no-install-recommends -y openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules node_modules
COPY --from=production-dependencies /app/package.json package.json
COPY --from=production-dependencies /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/web/dist web/dist
COPY docker/entrypoint.sh docker/entrypoint.sh
RUN chmod +x docker/entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
```

Before finalizing, verify that `prisma` CLI remains available after `npm prune --omit=dev`. Because `prisma` is currently a dev dependency, either move `prisma` into `server.dependencies` or copy its required CLI packages from the build stage. Prefer moving `prisma` to runtime dependencies so `prisma migrate deploy` has an explicit supported dependency.

- [ ] **Step 4: Create `.dockerignore`**

Include exactly the local/generated and secret paths that must not enter the context:

```text
.git
.claude
node_modules
server/node_modules
web/node_modules
server/dist
web/dist
server/.env
.env
.env.*
!.env.production.example
npm-debug.log*
```

- [ ] **Step 5: Validate files and build image**

Run:

```bash
test -f Dockerfile && test -f .dockerignore && test -x docker/entrypoint.sh
docker build --tag intercomunica:test .
docker image inspect intercomunica:test --format '{{.Config.User}} {{json .Config.Entrypoint}}'
```

Expected: build succeeds; inspection prints user `node` and `/app/docker/entrypoint.sh`.

- [ ] **Step 6: Commit the production image**

```bash
git add Dockerfile .dockerignore docker/entrypoint.sh server/package.json package-lock.json
git commit -m "feat(docker): add production application image"
```

### Task 4: Production Compose stack and environment contract

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker-compose.dev.yml`
- Create: `.env.production.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Docker image from Task 3 and health endpoint from Task 1.
- Produces: Compose services `app` and `db`, internal network `backend`, named volume `pgdata`, and host endpoint `127.0.0.1:${APP_PORT:-3000}`.

- [ ] **Step 1: Capture the current expected Compose failure**

Run: `docker compose config --services`

Expected before editing: output contains only `db`, proving the application service is absent.

- [ ] **Step 2: Add production environment template**

Create `.env.production.example` with non-secret examples and required blank secrets:

```dotenv
APP_PORT=3000
PUBLIC_URL=https://intercomunica.example.it

POSTGRES_DB=intercomunica
POSTGRES_USER=intercomunica
# Generate with: openssl rand -hex 32
POSTGRES_PASSWORD=9f7c2a4e8b1d6f03c5a9e2b7d4f8a1c6e3b0d9f5a7c2e8b4d1f6a3c9e0b5d7f2

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
JWT_SECRET=
ENCRYPTION_KEY=
ADMIN_EMAILS=presidenza@rainerum.it
ALLOWED_EMAIL_DOMAIN=rainerum.it
SIGNAGE_TOKEN=
```

Add `.env.production` to `.gitignore` while retaining the example file.

- [ ] **Step 3: Replace Compose with the two-service production stack**

Define `db` with PostgreSQL 16 Alpine, no `ports`, a named volume, `backend` network, `pg_isready` healthcheck, and restart policy. Define `app` with `build: .`, `depends_on.db.condition: service_healthy`, all application environment values, port binding `127.0.0.1:${APP_PORT:-3000}:3000`, app healthcheck using Node's built-in `fetch`, and restart policy. Attach `app` to the mandatory pre-existing external `PROXY_NETWORK` with the unique stable alias `intercomunica`. Create `docker-compose.dev.yml` separately with only the local PostgreSQL service and its port mapping. Set `DATABASE_URL` to:

```yaml
DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}?schema=public
```

The healthcheck command must be:

```yaml
test:
  - CMD
  - node
  - -e
  - "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
```

- [ ] **Step 4: Validate the environment contract and Compose topology**

Run:

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production config --services
docker compose --env-file .env.production config | rg 'published: "5432"'
rm .env.production
```

Expected: config exits 0; services are `db` and `app`; the final search returns no match, proving PostgreSQL is not published.

- [ ] **Step 5: Commit Compose and environment contract**

```bash
git add docker-compose.yml .env.production.example .gitignore
git commit -m "feat(docker): add production Compose stack"
```

### Task 5: Fresh-stack and idempotent-restart verification

**Files:**
- No production files unless verification exposes a defect.

**Interfaces:**
- Consumes: all artifacts from Tasks 1–4.
- Produces: proof that a fresh database migrates and the app survives restart without migration errors.

- [ ] **Step 1: Create isolated verification environment**

Run:

```bash
cp .env.production.example .env.production
python3 -c 'from pathlib import Path; p=Path(".env.production"); s=p.read_text(); s=s.replace("GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_ID=test-client").replace("GOOGLE_CLIENT_SECRET=", "GOOGLE_CLIENT_SECRET=test-secret").replace("JWT_SECRET=", "JWT_SECRET=test-jwt-secret-at-least-16").replace("ENCRYPTION_KEY=", "ENCRYPTION_KEY=" + "a"*64); p.write_text(s)'
```

Expected: `.env.production` remains ignored by Git and contains valid startup values.

- [ ] **Step 2: Build and start a fresh stack**

Run:

```bash
COMPOSE_PROJECT_NAME=intercomunica_verify docker compose --env-file .env.production up --build -d --wait
COMPOSE_PROJECT_NAME=intercomunica_verify docker compose --env-file .env.production ps
```

Expected: both `app` and `db` show `healthy`.

- [ ] **Step 3: Verify API, frontend, and SPA fallback**

Run:

```bash
curl --fail --silent http://127.0.0.1:3000/api/health
curl --fail --silent http://127.0.0.1:3000/ | rg '<div id="root"></div>'
curl --fail --silent http://127.0.0.1:3000/directory | rg '<div id="root"></div>'
```

Expected: health JSON contains `"database":"up"`; both frontend requests contain the React root.

- [ ] **Step 4: Verify migration deployment and restart idempotence**

Run:

```bash
COMPOSE_PROJECT_NAME=intercomunica_verify docker compose --env-file .env.production logs app | rg 'Applying database migrations|Starting Intercomunica'
COMPOSE_PROJECT_NAME=intercomunica_verify docker compose --env-file .env.production restart app
COMPOSE_PROJECT_NAME=intercomunica_verify docker compose --env-file .env.production up -d --wait
curl --fail --silent http://127.0.0.1:3000/api/health
```

Expected: startup logs show migration then application; restart returns healthy without migration failure.

- [ ] **Step 5: Tear down only the verification stack**

Run:

```bash
COMPOSE_PROJECT_NAME=intercomunica_verify docker compose --env-file .env.production down --volumes
rm .env.production
```

Expected: verification containers, network, and disposable volume are removed; no development or production volume is touched.

### Task 6: Production operations documentation

**Files:**
- Modify: `README.md`
- Modify: `PLAN.md`

**Interfaces:**
- Consumes: final Compose and environment commands from Tasks 3–5.
- Produces: operator instructions for deploy, Nginx Proxy Manager, upgrades, backups, restore safety, and rollback.

- [ ] **Step 1: Document first deployment**

Add a `Deploy produzione con Docker` section covering:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
docker compose --env-file .env.production up --build -d --wait
docker compose --env-file .env.production ps
curl --fail http://127.0.0.1:3000/api/health
```

State that Nginx Proxy Manager forwards the public hostname to VPS port 3000, WebSocket support is not required, and Google OAuth redirect URIs must be `${PUBLIC_URL}/api/auth/google/callback` and `${PUBLIC_URL}/api/admin/master/callback`.

- [ ] **Step 2: Document updates and logs**

Include:

```bash
git pull --ff-only
docker compose --env-file .env.production up --build -d --wait
docker compose --env-file .env.production logs --tail=200 app
```

- [ ] **Step 3: Document backup and guarded restore**

Include backup:

```bash
docker compose --env-file .env.production exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "intercomunica-$(date +%F).dump"
```

Document restore only after stopping `app`, confirming the target database is disposable/empty, and taking a current backup. Use:

```bash
docker compose --env-file .env.production stop app
docker compose --env-file .env.production exec -T db \
  pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" < intercomunica-YYYY-MM-DD.dump
docker compose --env-file .env.production start app
```

- [ ] **Step 4: Document application rollback limitation**

Explain that application rollback uses a previous Git tag/commit and `docker compose up --build -d --wait`, but database rollback is not automatic. A release with a destructive migration requires its own verified database restore plan before deployment.

- [ ] **Step 5: Run final repository gates**

Run:

```bash
npm run typecheck
npm test
npm run build
docker compose --env-file .env.production.example config --quiet
git diff --check
```

Expected: all commands exit 0; 36 server tests pass after adding the two health tests.

- [ ] **Step 6: Commit operations documentation**

```bash
git add README.md PLAN.md
git commit -m "docs: add Docker production operations guide"
```

### Task 7: Final review and release readiness

**Files:**
- Review all files changed by Tasks 1–6.

**Interfaces:**
- Consumes: complete implementation and verification evidence.
- Produces: final deployment readiness report with exact operator inputs still required.

- [ ] **Step 1: Review repository state and Docker security properties**

Run:

```bash
git status --short
git log --oneline -8
docker compose --env-file .env.production.example config | rg '127.0.0.1|published: "5432"|POSTGRES_PASSWORD'
```

Expected: clean worktree; app binding includes `127.0.0.1`; no published PostgreSQL port. The rendered config will contain the example password, so do not paste rendered production Compose output into logs or tickets.

- [ ] **Step 2: Report required VPS inputs**

List only values the operator must supply: `PUBLIC_URL`, `POSTGRES_PASSWORD`, Google OAuth credentials, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAILS`, optional `SIGNAGE_TOKEN`, and Nginx Proxy Manager forwarding target.

- [ ] **Step 3: Stop after readiness proof**

Do not deploy to the real VPS, edit DNS, configure Nginx Proxy Manager, or restore production data without a separate explicit request.

## Deferred follow-ups

- [ ] Add a route-level integration test for `GET /api/health`; it is explicitly acceptable to defer because the health checker unit tests cover this release, and no new dependency is needed.
- [ ] Review `npm audit` findings and select only justified, compatible remediation; do not blindly update dependencies.
