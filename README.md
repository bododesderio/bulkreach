# BulkReach

Multi-tenant bulk **SMS & Email** SaaS for Uganda / East Africa. Self-service and
fully-managed campaigns, multi-provider payments, a superadmin portal, and a
compliance-grade data-archive subsystem.

- **Self-service** — customers upload contacts, compose, and send SMS/email campaigns.
- **Managed service** — BulkReach staff take a brief through a workflow and issue a branded client PDF.
- **Admin portal** — superadmin dashboard, accounts, revenue, payments, plans, health, audit.
- **Data archive** — separate DB with retention, anonymisation, legal holds, right-to-erasure, access log.

This is the single doc for the project. Live task state lives in [CONTEXT.md](./CONTEXT.md).

---

## Stack

| Layer       | Technology |
| ----------- | ---------- |
| Backend     | FastAPI · Python 3.12 · SQLAlchemy 2 (async) · Alembic (dual DB) |
| Databases   | PostgreSQL 16 (live + archive) · ClickHouse 24.3 (analytics, 7-yr TTL) |
| Queue/cache | Redis 7 · ARQ worker (dispatch + crons) |
| Storage     | S3 / MinIO (uploads, report PDFs, archive exports) |
| Dispatch    | Africa's Talking / Twilio / Infobip / Vonage (SMS) · Mailgun / SendGrid / Postmark / SES (email) |
| Payments    | Flutterwave · Pesapal · MTN MoMo · Airtel Money (admin-configurable, encrypted) |
| Reports     | WeasyPrint (HTML → PDF) |
| Frontend    | Next.js 14 (App Router) · TypeScript · Tailwind · shadcn/ui |

Architecture: the Next.js app proxies `/api` → FastAPI (same-origin, no CORS). The
ARQ worker runs campaign dispatch plus scheduled crons (promote-scheduled, payment
reconcile, nightly archive ingest + retention). Payments are server-authoritative
(amount from DB, integer UGX, webhook signature + re-verify + idempotency).

---

## Run locally

### Option A — dev datastores (fast inner loop, port lane 3100)

```bash
# datastores
docker compose -f docker-compose.dev.yml up -d      # pg 55432 · redis 63799 · clickhouse 3112 · minio 3120

# backend (from backend/, venv active) — env points at the dev datastores
export DATABASE_URL=postgresql+asyncpg://bulkreach:pw@localhost:55432/bulkreach
export ARCHIVE_DATABASE_URL=postgresql+asyncpg://bulkreach:pw@localhost:55432/bulkreach_archive
export REDIS_URL=redis://localhost:63799/0
export SECRET_KEY=$(openssl rand -hex 32)
alembic upgrade head && alembic -c alembic_archive.ini upgrade head
PYTHONPATH=. uvicorn app.main:app --port 3101
PYTHONPATH=. arq app.workers.WorkerSettings          # separate terminal

# frontend (from frontend/)
API_PROXY_URL=http://localhost:3101/api npx next dev -p 3100
```

Frontend http://localhost:3100 · API http://localhost:3101 · `/health` on the API.
**Build gotcha:** always `NODE_ENV=production npm run build`; never build while `next dev`
holds the same `.next` (restart dev + `rm -rf .next` afterward).

### Option B — full production-parity stack

```bash
cp .env.production.example .env.production          # fill in secrets (see "Secrets")
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
# app served through nginx at http://localhost:${WEB_HTTP_PORT:-8080}
```
Brings up pg + redis + clickhouse + minio + api + worker + web + nginx. The api
container runs both Alembic migrations on start (`backend/entrypoint.prod.sh`).
`--env-file` is required (Compose only auto-loads a file literally named `.env`).

---

## Testing

```bash
# backend integration suite (in-process ASGI vs the dev datastores)
cd backend && source .venv/bin/activate
python -m pytest tests/test_m8_*.py            # auth · payments · admin · archive · subscription

# frontend
cd frontend && npx tsc --noEmit
NODE_ENV=production npm run build               # prerenders every route
npm run test:e2e                               # Playwright (both servers must be up)
```

---

## Secrets

Generate per environment; never commit real values (`.env*` are git-ignored).

```bash
SECRET_KEY=$(openssl rand -hex 32)              # JWT signing (≥32 chars)
ANON_PEPPER=$(openssl rand -hex 32)             # HMAC pepper for contact anonymisation
# PAYMENTS_ENCRYPTION_KEY — Fernet key (encrypts provider creds; required in prod, fail-closed):
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

| Var | Notes |
| --- | --- |
| `SECRET_KEY` | JWT signing. Rotating forces re-login. |
| `PAYMENTS_ENCRYPTION_KEY` | Fernet; encrypts payment-provider creds at rest. **Required in production.** Rotating orphans stored creds (re-enter in `/admin/settings/payments`). |
| `ANON_PEPPER` | Keep stable or previously-anonymised contacts stop matching. |
| `POSTGRES_PASSWORD`, `MINIO_ROOT_*` | Datastore creds (swap MinIO for real S3 keys in cloud). |
| Mailgun / Africa's Talking / Flutterwave | Delivery + payment fallbacks; most payment creds are set in the admin UI (encrypted), not env. |

See `.env.production.example` for the full list.

---

## Deploy (go-live checklist)

1. **Provision** a Linux VPS (Docker + Compose); DNS `app.bulkreach.ug` → IP; open 80/443 only.
2. **Configure** `.env.production` (secrets above; set `FRONTEND_URL` + `PAYMENTS_CALLBACK_BASE_URL` to the HTTPS host).
3. **Up:** `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build` (migrations auto-run). Create the first superadmin.
4. **TLS:** put Caddy/Traefik or certbot in front of nginx (or terminate at Cloudflare) → redirect 80→443, add HSTS.
5. **Providers / KYC:** enter live credentials in `/admin/settings/payments` (Fernet-encrypted), route each method:
   - Flutterwave — business KYC → live keys + webhook hash → webhook `${CALLBACK}/api/v1/payments/webhooks/flutterwave`.
   - Pesapal — production consumer key/secret + IPN URL (sandbox creds don't work live).
   - MTN MoMo / Airtel — collections KYC / go-live; flip test→live in the admin UI on approval.
   - Africa's Talking — production username + API key + approved sender ID. Mailgun — verify domain (SPF/DKIM).
6. **Smoke test** on the live host: signup → import → send → report; billing → real small payment → subscription active; superadmin suspend/activate + managed report + `/admin/health` green.
7. **Operations:** nightly `pg_dump` of both DBs + MinIO bucket snapshot (prove a restore); attach an S3 lifecycle policy for real Glacier tiering; alert on `/admin/health` + worker liveness.

---

## Status

Milestones **M0–M8 complete** (foundation, auth, contacts, campaigns/dispatch, reports + multi-provider
payments, admin portal + managed workflow, marketing + admin frontend, data-archive, tests + hardening),
plus a verified production deploy stack. Post-build gap-closing against the extended
Auth/Subscription/Payment spec is in progress (subscription quota enforcement and the auth design system
are done). See [CONTEXT.md](./CONTEXT.md) for the current tracker and remaining gaps.
