# Deployment & Operations — UstoGo Backend

**Version:** 1.0.0 · **Last updated:** 2026-07-29

---

## 1. Environments

| Environment   | Purpose                     | Database                  | Swagger                    |
| ------------- | --------------------------- | ------------------------- | -------------------------- |
| `development` | Local                       | Docker PostgreSQL         | Open                       |
| `test`        | Automated tests             | Testcontainers, ephemeral | Off                        |
| `staging`     | Pre-production verification | Managed, anonymised data  | Open to the team           |
| `production`  | Live                        | Managed, HA, PITR         | Off (or gateway-protected) |

Environments differ **only** in configuration. There are no `if (env === 'production')` branches in business code — a code path that is never exercised outside production is a code path that is never tested.

---

## 2. Local Setup

**Prerequisites:** Node.js 22 LTS, Docker, Docker Compose, Git.

```bash
git clone <repo> && cd ustogo-backend
cp .env.example .env          # local defaults work as-is
npm ci
docker compose up -d          # postgres · minio · redis · mailpit
npm run prisma:migrate:dev
npm run prisma:seed           # reference data only: cities, categories
npm run cli -- admin:create --email=you@example.com   # prompts for the password
npm run start:dev
```

The administrator is created by the CLI, not by the seed. A seeded admin with a known password is the admin registration path `PROJECT_RULES.md` forbids, wearing a different hat — and the password that reaches a shared environment is whichever one was committed. `admin:create` refuses `--password` for the same reason: an argv value lands in `ps`, in shell history and in CI logs.

| Service       | URL                            |
| ------------- | ------------------------------ |
| API           | http://localhost:3000/api/v1   |
| Swagger       | http://localhost:3000/api/docs |
| MinIO console | http://localhost:9001          |
| Mailpit       | http://localhost:8025          |

`npm run dev` is the single command: it runs `docker compose up -d --wait`, provisions the MinIO bucket, then starts the API in watch mode. `npm run stack:down` stops the containers; `npm run stack:reset` also drops the volumes.

**Port conflicts.** Every host port in `docker-compose.yml` is overridable — `POSTGRES_PORT`, `MINIO_PORT`, `MINIO_CONSOLE_PORT`, `REDIS_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_WEB_PORT`. The defaults are the ports in the table above. A developer already running PostgreSQL natively, or another project's stack, sets these in `.env` instead of editing the compose file or stopping the other stack — and updates `DATABASE_URL`, `S3_ENDPOINT`, `REDIS_URL` and `MAIL_PORT` to match. Container ports never change, so nothing inside the compose network is affected.

Target: clone to running, seeded API in under 15 minutes (NFR-OP-5). If it takes longer, that is a bug in this document.

---

## 3. Configuration

```bash
# Application
NODE_ENV=production
PORT=3000
API_PREFIX=api/v1
CORS_ORIGINS=https://ustogo.app,https://admin.ustogo.app

# Database
DATABASE_URL=postgresql://user:pass@host:5432/ustogo?schema=public&connection_limit=20
DATABASE_POOL_SIZE=20

# JWT — RS256 access-token keypair (base64 PEM, see .env.example for the openssl
# commands) plus an independent 64-byte random refresh secret
JWT_ACCESS_PRIVATE_KEY=…
JWT_ACCESS_PUBLIC_KEY=…
JWT_REFRESH_SECRET=…
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
JWT_ISSUER=ustogo-api
JWT_AUDIENCE=ustogo-clients
BCRYPT_ROUNDS=12
PASSWORD_RESET_TTL=30m
PASSWORD_RESET_URL=https://ustogo.app/reset-password

# Storage
S3_ENDPOINT=https://s3.eu-central-1.amazonaws.com
S3_REGION=eu-central-1
S3_BUCKET=ustogo-prod
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_PRESIGN_TTL=900

# Mail
MAIL_HOST=…  MAIL_PORT=587  MAIL_USER=…  MAIL_PASSWORD=…
MAIL_FROM="UstoGo <no-reply@ustogo.app>"

# Redis (throttling, socket adapter)
REDIS_URL=redis://…

# Observability
LOG_LEVEL=info
SENTRY_DSN=…
SWAGGER_ENABLED=false
```

Rules

- Secrets come from a secret manager, never from an image or a repository
- The Zod schema validates everything at boot; invalid configuration exits **before** the listener binds
- `CORS_ORIGINS=*` is rejected in production
- Access and refresh secrets are independent values

---

## 4. Container

```dockerfile
# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
```

Non-root, no dev dependencies, no source, no `.env`. Base image pinned by digest and rebuilt weekly.

---

## 5. Database Migrations

**Migrations run as a separate step before the new application version starts**, under a database role that has DDL rights — the application role does not.

```
1. CI builds and tests the image
2. Deploy job runs: npx prisma migrate deploy
3. Rolling restart of application instances
4. Health checks gate the rollout
```

**Expand/contract is mandatory** (NFR-A-3). Renaming `bio` to `about`:

| Release | Action                                                  |
| ------- | ------------------------------------------------------- |
| N       | Add `about` (nullable). Write to both. Read from `bio`. |
| N+1     | Backfill `about`. Read from `about`. Still write both.  |
| N+2     | Stop writing `bio`.                                     |
| N+3     | Drop `bio`.                                             |

Slower than a rename, and it is the difference between a deploy and an outage. Destructive migrations require sign-off recorded in `CHANGELOG.md`.

Rollback: forward-only. A bad migration is corrected by a new migration, not by reversing one — a down-migration on production data loses information.

---

## 6. Zero-Downtime Deploys

```
LB ──► v1 ──► v1 ──► v1
        │
        ├─ migrate deploy (backwards-compatible)
        ├─ start v2 instance, wait for /health/ready
        ├─ shift traffic, drain v1 (SIGTERM, ≤30 s)
        └─ repeat
```

Graceful shutdown:

```ts
app.enableShutdownHooks();
// on SIGTERM: stop accepting new connections → finish in-flight requests
// → wait for running jobs → disconnect Prisma → exit
```

Readiness fails while draining, so the load balancer stops routing before the process stops answering.

---

## 7. CI/CD

```yaml
on: [pull_request, push]

jobs:
  quality:
    steps:
      - lint
      - typecheck
      - test:unit
      - test:integration # Testcontainers
      - test:e2e
      - coverage gate
      - npm audit --audit-level=high
      - gitleaks

  deploy-staging:
    if: branch == develop && quality passed
    steps: [build image, push, migrate deploy, rolling deploy, smoke tests]

  deploy-production:
    if: tag matches v*.*.* && quality passed
    environment: production # requires manual approval
    steps: [build image, push, migrate deploy, rolling deploy, smoke tests, notify]
```

Production deploys are tag-triggered and manually approved. Continuous deployment to production is not appropriate for a system holding home addresses.

---

## 8. Observability

| Signal  | Implementation                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------- |
| Logs    | Structured JSON (Pino) with `requestId`, shipped to a central store, 90-day retention                    |
| Metrics | Prometheus at `/metrics` (protected): request rate, error rate, latency histogram, DB pool, job outcomes |
| Errors  | Sentry with `requestId` and `userId`, **without** request bodies                                         |
| Uptime  | External probe on `/health` from two regions                                                             |
| Traces  | OpenTelemetry (Phase 6, B-65)                                                                            |

**Alerts**

| Condition                                | Severity                         |
| ---------------------------------------- | -------------------------------- |
| 5xx rate > 1% over 5 min                 | Page                             |
| p95 latency > 1 s over 10 min            | Page                             |
| `/health/ready` failing on any instance  | Page                             |
| DB connection pool > 80% for 5 min       | Warn                             |
| Refresh-token reuse detections spiking   | Page (possible credential theft) |
| 401/403 rate spiking                     | Warn (possible attack)           |
| Scheduled job failed twice consecutively | Warn                             |
| Disk > 80%                               | Warn                             |

---

## 9. Backup & Recovery

| Item              | Policy                                                        |
| ----------------- | ------------------------------------------------------------- |
| Full backup       | Nightly, encrypted, 30-day retention                          |
| PITR              | WAL archiving, 7-day window                                   |
| Object storage    | Versioning enabled, cross-region replication                  |
| RTO               | 1 hour                                                        |
| RPO               | 15 minutes                                                    |
| Restore rehearsal | Quarterly, into an isolated environment, timed and documented |

A backup that has never been restored is a hypothesis, not a backup. The rehearsal is what makes the RTO number real.

---

## 10. Scaling

**Vertical first** — one well-sized instance and a well-indexed database serve the v1 capacity target (200 rps, 100k users) comfortably.

**Horizontal when needed** — the application is stateless (NFR-S-1), so adding replicas requires only a replica-count change. Prerequisites are already in place: Redis-backed throttling, multi-instance-safe jobs, no local session state, no local file storage.

**Database scaling order:** indexes → query optimisation → connection pooling (PgBouncer) → read replicas for search → partition `bookings` by month if it exceeds ~50 M rows.

Caching is applied only where measured: category tree (5 min), search results (60 s), presigned URLs (until expiry).

---

## 11. Runbook

**API returning 5xx**

1. Check `/health/ready` on each instance
2. Check database connectivity and pool saturation
3. Check Sentry for the dominant error signature, correlate by `requestId`
4. Roll back to the previous image tag if the deploy is implicated
5. Record the incident in `CHANGELOG.md`

**Database unreachable**

1. Verify the managed instance status and connection limits
2. Check for long-running or blocking queries (`pg_stat_activity`)
3. Scale up connections or terminate the blocker
4. Readiness will already be failing, so traffic has stopped — resolve before restarting instances

**Suspected credential compromise**

1. Rotate `JWT_ACCESS_PRIVATE_KEY`/`JWT_ACCESS_PUBLIC_KEY` — every access token dies instantly
2. Revoke the affected refresh token families
3. Review `AuditLog` and 401/403 patterns for the blast radius
4. Notify affected users within 72 hours if personal data is implicated

**Job stopped running**

1. Check job metrics and the last success timestamp
2. Verify the advisory lock is not stuck from a hard-killed instance
3. Jobs are idempotent — safe to trigger manually

---

## 12. Pre-Launch Checklist

- [ ] All secrets in the secret manager; none in the repository or image
- [ ] `SWAGGER_ENABLED=false` in production
- [ ] CORS restricted to real origins
- [ ] TLS + HSTS at the edge
- [ ] Rate limits active and Redis-backed
- [ ] Backups running and a restore rehearsed
- [ ] Alerts wired to a real on-call channel
- [ ] Error tracking receiving events
- [ ] `/health` and `/health/ready` wired to the load balancer
- [ ] Admin account created via CLI with a strong password
- [ ] Load test meets NFR-P targets
- [ ] Penetration test findings closed
- [ ] Runbook reviewed by whoever is on call
