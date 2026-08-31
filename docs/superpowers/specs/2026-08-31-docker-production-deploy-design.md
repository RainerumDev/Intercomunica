# Docker production deployment design

## Goal

Deploy Intercomunica on one Linux VPS using Docker Compose. Nginx Proxy Manager already provides the public HTTPS endpoint and forwards requests to the application on the VPS.

## Architecture

The production stack contains two services:

- `app`: one Node.js 22 container serving both the Express API and the compiled React application on port 3000.
- `db`: PostgreSQL 16 on an internal Docker network with persistent storage.

Only the application is published to the host, bound to `127.0.0.1:3000`. PostgreSQL is not published. Nginx Proxy Manager forwards the public HTTPS hostname to `http://127.0.0.1:3000`.

## Application image

A multi-stage Dockerfile will:

1. Install dependencies deterministically with `npm ci`.
2. Generate the Prisma client.
3. Build the TypeScript server and Vite frontend.
4. Copy production dependencies, Prisma files, server build, and frontend build into a minimal Node.js 22 Alpine runtime image.
5. Run as the unprivileged `node` user.

The runtime starts through a small shell entrypoint. It executes `prisma migrate deploy` and then replaces itself with `node server/dist/index.js`. Migration deployment is idempotent and safe on every restart.

## Database migration

The current schema has been managed with `prisma db push`, but production requires versioned migrations. An initial migration SQL file will be generated from the current Prisma schema and committed.

For a fresh production database, `prisma migrate deploy` creates the complete schema. Existing development databases are not automatically converted or modified as part of this change.

Production rollback does not automatically reverse database migrations. The initial migration is additive on a fresh database; application rollback consists of redeploying the previous image. Future destructive migrations must have a separately documented data rollback.

## Configuration and secrets

`docker-compose.yml` loads application and database values from a deployment `.env` file that is excluded from Git. A committed `.env.production.example` documents:

- public `BASE_URL` and `WEB_URL`, both using the HTTPS hostname;
- Google OAuth credentials and allowed redirect URLs;
- JWT and encryption secrets;
- administrator emails and allowed Workspace domain;
- PostgreSQL database, user, and strong password;
- optional signage token.

The Compose file contains no production passwords. `DATABASE_URL` is assembled inside Compose from the database variables.

## Networking and health

PostgreSQL receives a `pg_isready` healthcheck. The app waits for the database health condition before starting.

The application health endpoint will verify both process availability and database connectivity. Docker uses it as the app healthcheck. A failed database check returns HTTP 503 rather than reporting a false healthy state.

The app binds to `127.0.0.1:3000` on the VPS. If Nginx Proxy Manager runs as a container on the same host and cannot reach host loopback, the operator can either use its Docker host gateway or attach it to the Intercomunica frontend network; this topology-specific NPM configuration stays outside this repository.

## Operations

Documented commands will cover:

- first deployment and Google OAuth redirect configuration;
- image rebuild and rolling restart with Docker Compose;
- viewing logs and checking health;
- PostgreSQL logical backup with `pg_dump`;
- restore into an explicitly selected empty database;
- application rollback to a previously tagged image/build.

## Verification

The implementation is accepted when:

1. Existing typechecks and unit tests pass.
2. `docker compose config` validates with example production values.
3. The application image builds from a clean Docker context.
4. The full stack starts with a fresh named volume.
5. Prisma migrations apply automatically.
6. `/api/health` returns success and confirms database connectivity.
7. `/` and a client-side route return the React application.
8. PostgreSQL has no published host port.
9. Restarting the stack does not reapply or fail the migration.

## Non-goals

- Installing or configuring Nginx Proxy Manager.
- Provisioning the VPS, firewall, DNS, or TLS certificate.
- Automated off-site backup scheduling.
- Container orchestration beyond Docker Compose.
