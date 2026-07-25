# BulkReach

Multi-tenant bulk **SMS & Email** SaaS platform for Uganda / East Africa. Built to the
[System Documentation v2.0](./Rooibok%20BulkReach_System_Documentation_v1.docx.pdf) — the single
source of truth for every requirement.

- **Self-service** — customers log in, upload contacts, compose, and send campaigns.
- **Managed service** — the BulkReach team runs the campaign and issues a branded client report.
- **Data Archive** — compliance-grade, superadmin-only vault with retention, legal holds, and erasure.

## Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Backend    | FastAPI · Python 3.12 · SQLAlchemy 2 (async) · Alembic            |
| Databases  | PostgreSQL 16 (live + archive) · ClickHouse 24.3 (live + archive) |
| Queue/cache| Redis 7 · ARQ workers                                             |
| Storage    | S3 / MinIO (+ Glacier tier for cold archive)                      |
| Dispatch   | Africa's Talking (SMS) · Mailgun SMTP (email)                     |
| Payments   | Flutterwave (MTN MoMo · Airtel Money · Visa/Mastercard)           |
| Reports    | WeasyPrint (HTML → PDF)                                            |
| Frontend   | Next.js 14 (App Router) · TypeScript · Tailwind · shadcn/ui       |

## Quick start (Section 11)

```bash
# 1. Infrastructure
cd infra/docker && docker compose up -d

# 2. Backend
cd ../../backend
cp .env.example .env                # fill in secrets; generate SECRET_KEY: openssl rand -hex 32
uv venv .venv && source .venv/bin/activate
uv pip install -r requirements.txt
alembic upgrade head                # live schema
alembic -c alembic_archive.ini upgrade head   # archive schema
uvicorn app.main:app --reload --port 8000
arq app.workers.campaign_worker.WorkerSettings   # separate terminal

# 3. Frontend
cd ../frontend && npm install && npm run dev

# 4. First superadmin
python scripts/create_superadmin.py --email admin@bulkreach.ug --password yourpassword
```

| Service        | URL                          |
| -------------- | ---------------------------- |
| API + docs     | http://localhost:8000/docs   |
| Frontend       | http://localhost:3000        |
| MinIO console  | http://localhost:9011        |
| ClickHouse     | http://localhost:8123/play   |

## Build status

See [CONTEXT.md](./CONTEXT.md) for the live milestone tracker. This project is built in verified
milestones — each is import/type-checked before the next begins.

- **M0 — Foundation** ✅ monorepo, Docker (8 services), backend core (config/db/security/deps),
  13 live + 9 archive models, Alembic (dual DB), ClickHouse schema, frontend scaffold + landing.
- **M1 — Auth & accounts** — next.
