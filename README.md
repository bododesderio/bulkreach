<!--
  @author Bodo Desderio <rooiboktechltd@gmail.com>
  @copyright 2026 Rooibok Technologies. All rights reserved.
-->
# BulkReach

Multi-tenant **bulk SMS & Email** marketing SaaS for Uganda / East Africa (base currency **UGX**,
Uganda VAT-aware). A business uploads its contacts, composes a personalized message once, dispatches
it to thousands of recipients over SMS and/or email, and sees how it performed. BulkReach also runs
campaigns **for** clients as a managed service, and ships a superadmin portal and a compliance-grade
data-archive subsystem.

**Author:** Bodo Desderio · Rooibok Technologies

This is the single source of truth for the project. Live task/session state lives in
[CONTEXT.md](./CONTEXT.md); deploy runbooks live in [infra/](./infra) (see [Deploy](#deploy--go-live)).

## Contents
- [What it is & who uses it](#what-it-is--who-uses-it)
- [Core capabilities](#core-capabilities)
- [Architecture](#architecture)
- [Data model](#data-model)
- [API surface](#api-surface)
- [Quotas & enforcement](#quotas--enforcement)
- [Stack](#stack)
- [Run locally](#run-locally)
- [Testing](#testing)
- [Secrets](#secrets)
- [Deploy / go-live](#deploy--go-live)
- [User guide — customer (self-service)](#user-guide--customer-self-service)
- [Managed-client portal](#managed-client-portal)
- [Superadmin (operator) guide](#superadmin-operator-guide)
- [Troubleshooting](#troubleshooting)
- [Status](#status)

---

## What it is & who uses it

There are two ways a customer uses BulkReach:

- **Self-service** — a company signs up, buys a plan (or uses the free trial), and runs its own
  campaigns from the dashboard.
- **Managed service** — the BulkReach operator (superadmin) runs each campaign for the client
  **end-to-end** (brief → content → send → report), advancing it through a single focused workspace.
  There is **no client sign-off step and no assigning the job to a team member** — the operator does
  everything; the client sees status on a **read-only** portal.

| Role | Who | Where |
|------|-----|-------|
| **Owner / Admin / Member** | A customer company's users (multi-user accounts, RBAC) | `bulkreach.ug/dashboard` |
| **Managed client** | A hands-off client of the managed service (read-only visibility) | `bulkreach.ug` managed portal |
| **Superadmin** | The BulkReach operator / platform staff | `admin.bulkreach.ug` |

---

## Core capabilities

- **Contacts** — CSV upload (drag-drop) or paste-import with column auto-detection, validation, and
  de-duplication; reusable contact lists per account.
- **Campaigns & Composer** — SMS, email, or both-channel campaigns; personalize with `{{merge_tags}}`;
  live preview; SMS segment counting; send now or schedule; per-recipient delivery tracking; live
  progress over Server-Sent Events; retry with exponential backoff.
- **Multi-provider dispatch** — SMS via Africa's Talking (primary), Twilio, Infobip, Vonage; email via
  Mailgun (API/SMTP), SendGrid, Postmark, SES, or generic SMTP. Each is used when its keys are
  configured; a labelled simulator is the dev fallback.
- **Reports** — per-account analytics (sent/delivered/failed by channel, over time) and a branded
  per-campaign success **PDF** (WeasyPrint).
- **Delivery reports (DLR) & suppression** — inbound provider callbacks (`/webhooks/dlr/{provider}`)
  move each message to its true outcome (delivered/undelivered/bounced/complained). Hard bounces +
  spam complaints auto-add the recipient to a per-account **suppression list** future campaigns skip.
  Inbound **STOP/START replies** (`/webhooks/inbound/{provider}`) opt the sender out (or back in) for
  the account that last messaged them. Unauthenticated webhooks are gated by a shared callback secret
  (Africa's Talking) or provider signature (Mailgun) and **fail closed in production**.
- **Plans, quota & billing** — Starter/Growth/Business/Managed plans; monthly message quota + daily
  limits + concurrency + feature gates enforced in three layers (Redis counters); invoices/receipts
  with gapless numbering + Uganda 18% VAT + mid-cycle proration; auto-renewal and a failed-payment
  **dunning ladder** (day 0 → 30 → suspend).
- **Payments** — multi-provider, admin-configurable: Flutterwave (card, inline), Pesapal, MTN MoMo,
  Airtel Money. Server-authoritative amounts, verified settlement, refunds; provider creds
  Fernet-encrypted at rest.
- **Per-client plan controls** — superadmins can manually place an account on a plan with custom
  quota/price/feature overrides (custom deals) that survive settlement/dunning appropriately.
- **Notifications** — in-app bell + email, per-category preferences; critical billing/security notices
  force-email (billing/quota alerts always reach the bell).
- **Managed workflow** — an **admin-only** console for operator-run campaigns: a filterable job queue
  (`/admin/managed`) feeding a focused per-job workspace (`/admin/managed/[id]`) with a stage stepper
  (**Brief → Content → Send → Report → Closed**) and one clear next action per state. The operator
  runs each job solo via forward pipeline transitions. No client sign-off, no team assignment.
- **CMS & SEO** — admin-managed marketing content (features, testimonials, FAQs, page copy); metadata,
  sitemap, robots, JSON-LD, dynamic OG images.
- **Data governance / archive** — ingest, 7-year retention, anonymisation, GDPR-style erasure, legal
  holds, access logging, export (ClickHouse + S3/Glacier paths, infra-gated).
- **Auth & sessions** — email+password with OTP verification, multi-step signup, team invites,
  DB-backed rotating refresh sessions with theft detection, active-session management, 15-minute access
  tokens (RS256), superadmin **impersonation** ("log in as"). Constant-time login + password-reset (no
  user-enumeration oracle); `/docs` off in production.
- **Exports** — CSV export of a contact list (self-serve data portability) and of a campaign's full
  per-recipient delivery results; branded campaign / client-success / invoice PDFs (WeasyPrint).
- **Design system** — token-based UI with a persisted, OS-aware **light/dark theme** across the whole
  app; shared component library (cards, tables, KPI tiles, forms, badges, modals, empty/loading states).
- **Audit trail** — every privileged and state-changing action (account/plan, payments provider config
  & routing, managed send/cancel/report, suppressions, invites, billing, password changes, …) is
  written to an append-only audit log; auth events are logged separately.

---

## Architecture

```
                         ┌─────────────────────────────────────────────┐
  Browser ──HTTPS──►     Shared Traefik edge (TLS via Let's Encrypt)    │
                         │   bulkreach.ug / www  → web:3100             │
                         │   admin.bulkreach.ug  → web:3100 (BasicAuth) │
                         │   api.bulkreach.ug    → api:3101 (/docs BA)  │
                         └───────────────┬─────────────────────────────┘
                                         │  (Next proxies /api → api, same-origin)
        ┌────────────────────────────────┼───────────────────────────────┐
        ▼                                ▼                                 ▼
   web (Next.js 14)                 api (FastAPI)                     worker (ARQ)
   App Router SPA               /api/v1/* routers            dispatch + cron jobs
        │                            │                                    │
        └──────────── internal network (no host ports) ──────────────────┘
                 Postgres (live + archive) · Redis · ClickHouse · MinIO/S3
```

- **Frontend:** Next.js 14 App Router, TypeScript (strict), Tailwind, shadcn/ui, Lucide. Route groups:
  marketing (public), `dashboard` (client), `admin` (superadmin), managed portal. All API calls funnel
  through `lib/api.ts` (bearer token + silent refresh on 401 + impersonation-token overlay). Shared
  primitives in `components/ui` (Card/Modal/StatusBadge/**DataState** — one place for loading/error/
  empty). Server state via React Query (`lib/hooks`).
- **Backend:** FastAPI + SQLAlchemy 2 (async), all routes under `/api/v1`. A single ARQ worker runs
  campaign dispatch plus cron jobs (scheduled-send promotion every ~30s, payment reconcile, daily
  renewal + dunning, nightly archive ingest + retention). Denormalized campaign counters are recomputed
  from the `messages` table at dispatch completion (retry-safe).
- **Data:** PostgreSQL 16 (a **live** DB + a separate **archive** DB), Redis 7 (quota counters,
  progress, rate limits, ARQ queue), ClickHouse 24.3 (analytics, feature-gated), MinIO/S3 (files).
- **Auth:** JWT access tokens (15 min, RS256 with HS256 fallback) + a DB-backed **rotating refresh
  cookie** (opaque + sha256, per-family reuse/theft detection, grace window). Roles: `owner`/`admin`/
  `member` per account + platform `superadmin`. Suspend blocks all of an account's users at login.
- **Payments:** a strict state machine `created → pending → successful|failed|timeout`, amount
  server-authoritative + proration-aware, idempotent `ON CONFLICT` subscription upsert, webhook
  signature-verify-then-re-verify.

The Next.js app proxies `/api` → FastAPI (same-origin, no CORS). Web-facing services publish no host
ports — the shared Traefik edge routes them by Host over the external `web` network; TLS via the `le`
ACME resolver. Migrations run on the `api` container at boot.

---

## Data model

- **Account** — the tenant. name, email, plan, status (`active`/`trial`/`suspended`/`closed`),
  logo_url, report_header, contact_name, phone, industry, **timezone**, marketing_opt_in, trial
  allowance, immutable consent record, soft-delete (`is_active`, `deleted_at`).
- **User** — belongs to an Account; email, hashed_password, role, user_type
  (`self_service`/`managed_client`), email_verified, must_change_password.
- **Plan** — name, price_ugx, messages_per_month (−1 = unlimited), batch_size, `features` JSONB (gates:
  daily_limit, simultaneous_limit, scheduling, allowed_formats), presentation fields.
- **Subscription** — one per account (UNIQUE), plan_id, status, period window, auto_renew, dunning
  fields; per-account overrides (`manually_assigned`, `custom_messages_per_month`, `custom_daily_limit`,
  `custom_price_ugx`, `custom_features`).
- **Payment** — amount, currency, method, status, provider, tx_ref (unique), plan_id, raw payload,
  refund fields.
- **Campaign** / **CampaignContact** / **Message** — a campaign, its resolved recipients, and each
  per-recipient send (status, retries) with denormalized per-campaign counters for fast reporting.
- **Contact** / contact lists — imported audience with merge fields.
- **RefreshToken** / **AuthEvent** — rotating sessions + append-only auth audit.
- **ManagedCampaign** — an admin-run job: `account_id`, optional linked `campaign_id`, `brief_text`,
  draft `copy_sms`/`copy_email_subject`/`copy_email_body`, pipeline `status`, `on_hold`, `cancelled`.
  (Assignment/approval columns were removed — the service is admin-only.)
- **Notification** / **NotificationPreference**, **Invoice**, **AuditLog** (append-only), CMS tables,
  and the archive schema.

---

## API surface

Representative, all under `/api/v1`:

- **Auth/account:** `POST /auth/register`, `/auth/signup/complete`, `/auth/verify-email`, `/auth/login`,
  `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `GET|PATCH /auth/me`,
  `POST /auth/change-password`, `POST /auth/delete-account`, `/auth/sessions*`, `/invitations*`.
- **Contacts:** `POST /contacts/import`, `GET /contacts`, list management.
- **Campaigns:** `POST /campaigns`, `GET /campaigns`, `GET /campaigns/{id}`, `/preview`, `/send`,
  `/schedule`, `/cancel`, `GET /campaigns/{id}/messages`, `GET /campaigns/{id}/progress` (SSE).
- **Reports:** `GET /reports/summary`, `GET /reports/campaigns/{id}/pdf`.
- **Deliveries:** `POST /webhooks/dlr/{provider}` (inbound DLR, unauthenticated — signature/secret,
  fail-closed in prod); `POST /webhooks/inbound/{provider}` (mobile-originated SMS; STOP → opt-out);
  **Suppressions:** `GET|POST /suppressions`, `DELETE /suppressions/{id}`.
- **Billing:** `GET /billing/subscription`, `/invoices`, `/invoices/{id}/pdf`, `/proration-preview`,
  `PATCH /billing/auto-renew`; **Payments:** `/payments/checkout`, `/payments/verify`,
  `/payments/webhooks/{provider}`.
- **Notifications:** `GET /notifications`, `/unread-count`, `/read`, `/read-all`,
  `GET|PATCH /notifications/preferences`.
- **Managed portal (client, read-only):** `GET /managed-portal/campaigns`.
- **Admin (superadmin):** `/admin/overview`, `/admin/accounts` (+`/{id}`, `/suspend`, `/activate`,
  `/impersonate`, `/impersonate-stop`, `/portal-access`, `/plan`), `/admin/campaigns`,
  `/admin/subscriptions`, `/admin/payments/*`, `/admin/plans`, `/admin/managed` (+`/{id}`, `/hold`,
  `/unhold`, `/cancel`, `/report`), `/admin/revenue`, `/admin/health`, `/admin/audit`,
  `/admin/archive/*`, `/admin/cms/*`.

Interactive schema: `https://api.bulkreach.ug/docs` (Basic-Auth gated in production; disabled entirely
when `ENVIRONMENT=production`).

---

## Quotas & enforcement

Effective limits resolve in order: an active **Subscription → Plan** (+ per-account overrides) → a
**trial** account's free allowance → a **Plan matched by name**. Enforcement is layered:

1. **Read layer** — the dashboard/composer show live usage from Redis counters.
2. **Hard gate** — `enforce_send` blocks a send that would exceed monthly/daily quota, the concurrency
   limit, or a feature gate (e.g. scheduling), returning `402` with a machine code.
3. **Fail-safe** — the dispatch engine re-checks before finalizing; quota reservations are floored at 0.

Trials are billed up-front (allowance decremented at send); paid plans meter as they dispatch. Custom
(`manually_assigned`) deals bypass the dunning ladder and survive refunds.

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
| Frontend    | Next.js 14 (App Router) · TypeScript · Tailwind · shadcn/ui · React Query |

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

Frontend http://localhost:3100 · API http://localhost:3101 · `/health/ready` on the API.

**Build gotcha:** always `NODE_ENV=production npm run build`; never build while `next dev` holds the
same `.next` (stop dev first). Restarting `uvicorn` without `--reload` can leave the old worker holding
the port — `pkill -f .venv/bin/uvicorn` before relaunching.

### Option B — full production-parity stack

```bash
cp .env.production.example .env.production          # fill in secrets (see "Secrets")
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Brings up pg + redis + clickhouse + minio + api + worker + web. The api container runs Alembic
migrations on start (`backend/entrypoint.prod.sh`). Web-facing services publish no host ports — the
shared Traefik edge routes them by Host over the external `web` network. `--env-file` is required
(Compose only auto-loads a file literally named `.env`). Full runbook:
**[infra/DEPLOY-TRAEFIK.md](infra/DEPLOY-TRAEFIK.md)**.

---

## Testing

```bash
# backend integration suite (in-process ASGI vs the dev datastores) — 130+ tests
cd backend && source .venv/bin/activate
python -m pytest

# frontend
cd frontend && npx tsc --noEmit
NODE_ENV=production npm run build               # prerenders every route

# end-to-end (Playwright) — both servers must be up; runs against localhost:3100
npx playwright test --workers=1                 # 5 tests; --headed to watch in a browser
```

E2E test accounts (dev): `super@bulkreach.ug` / `SuperPass123!`, `verify+m7@bulkreach.ug` /
`TestPass123!`. Run E2E single-worker and clear Redis `*login*` keys first, or the per-account login
rate-limiter will 429 parallel logins:

```bash
docker exec brtest-redis sh -c "redis-cli --scan --pattern '*login*' | xargs -r redis-cli del"
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
| `WEBHOOK_CALLBACK_SECRET` | Shared secret unsigned inbound-SMS/DLR callbacks must present (`?s=` / `X-Webhook-Secret`). Fail-closed in prod when unset. |
| `POSTGRES_PASSWORD`, `MINIO_ROOT_*` | Datastore creds (swap MinIO for real S3 keys in cloud). |
| Mailgun / Africa's Talking / Flutterwave | Delivery + payment fallbacks; most payment creds are set in the admin UI (encrypted), not env. |

See `.env.production.example` for the full list.

---

## Deploy / go-live

Full VPS runbook: **[infra/DEPLOY-TRAEFIK.md](infra/DEPLOY-TRAEFIK.md)** · operations (backups,
monitoring, restore drill): **[infra/OPERATIONS.md](infra/OPERATIONS.md)**.

1. **Provision** — deploy onto the shared-Traefik VPS at `/opt/bulkreach`. DNS: `bulkreach.ug`, `www`,
   `admin.bulkreach.ug`, `api.bulkreach.ug` → VPS IP (A records).
2. **Configure** `.env.production` (secrets above; `FRONTEND_URL=https://bulkreach.ug`,
   `BASE_URL`/`PAYMENTS_CALLBACK_BASE_URL=https://api.bulkreach.ug`, `TRUSTED_PROXY_COUNT=1`, the
   `ADMIN_BASICAUTH`/`DOCS_BASICAUTH` edge hashes, and `WEBHOOK_CALLBACK_SECRET`).
3. **Up:** `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`
   (migrations auto-run). Create the first superadmin (`backend/scripts/create_superadmin.py`).
4. **TLS:** terminated by the shared Traefik edge (Let's Encrypt via the `le` resolver); HTTP→HTTPS
   redirect is in the compose labels. No per-project certbot/nginx.
5. **Providers / KYC:** enter live credentials in `/admin/settings/payments` (Fernet-encrypted), route
   each method. Set each provider's webhook/IPN URL to
   `https://api.bulkreach.ug/api/v1/payments/webhooks/{provider}`, and the delivery callbacks with
   `?s=<WEBHOOK_CALLBACK_SECRET>`. Verify the Mailgun sending domain (SPF/DKIM); use an approved
   Africa's Talking sender ID.
6. **Smoke test** on the live host: signup → import → send → report; billing → small real payment →
   subscription active; superadmin suspend/activate + managed report + `/admin/health` green; `admin.`
   and `/docs` return 401 without Basic-Auth.
7. **Operations:** nightly `pg_dump` of both DBs + MinIO snapshot (prove a restore); S3 lifecycle for
   Glacier tiering; alert on `/admin/health` + worker liveness. Details in `infra/OPERATIONS.md`.

> **CI:** GitHub Actions is currently removed (the account is billing-locked). Gates run locally and
> deploy is manual — see `infra/OPERATIONS.md`. Re-add a workflow if Actions billing is restored.

---

## User guide — customer (self-service)

**Create your account.** Sign up at bulkreach.ug → **Details** (business name, email, password,
contact, phone) → **Consent** (accept Terms, Privacy, Data-Retention — required) → **Verify** (6-digit
emailed code; a "Dev code" shows on screen in non-production; expires in 15 min) → **Onboarding**
(industry/use-case, optional). You land on the dashboard with a **14-day, 500-message free trial**.

**Dashboard.** Usage stat cards, a quota usage bar, quick actions, and recent campaigns. Left sidebar:
Overview · Contacts · Campaigns · Reports · Billing · Settings. Top bar: profile, plan, notification bell.

**Import & export contacts.** Contacts → Import → upload a CSV (drag-drop) or paste rows. Columns are
auto-detected (name/phone/email + custom merge fields), validated, and de-duplicated (e.g. "4 valid · 2
duplicates · 0 errors"). Save into a named, reusable list. Each list has an **Export** action that
downloads it as CSV (phone, email, tags, and your original imported columns) — your data is yours to
take at any time.

**Create & send.** Campaigns → New (Composer): choose channel (SMS/Email/Both), pick a saved list,
write the message with merge tags (`Hi {{name}}` — letters/numbers/underscores only, and every tag must
exist in your data). SMS shows a **segment counter**; use the **live preview**; **Send now** or
**Schedule** (may require a paid plan). Watch **live progress** ("X of N delivered"); transient failures
retry automatically. A payment-required message means you hit a quota/concurrency/feature limit — see
Billing.

**Campaigns & reports.** Campaigns lists everything with status/channel; open one for per-recipient
detail, a branded **PDF report**, and an **Export CSV** of the full per-recipient delivery results
(status, provider, error, timestamps) for reconciliation. Reports shows account-wide analytics with a
PDF export. Your **report header** text (Settings → Profile) is printed at the top of every branded
campaign PDF.

**Appearance.** A **light/dark theme toggle** (sun/moon, top bar) applies across the whole app and
remembers your choice; on first visit it follows your operating-system preference with no flash.

**Billing.** Current plan, available plans, invoices, payment history. Upgrade and pay via card
(Flutterwave), Pesapal, MTN MoMo, or Airtel Money; mid-cycle upgrades are **prorated**. Invoices carry
Uganda **18% VAT**. Toggle **auto-renew** (owner/admin). A failed renewal starts a **dunning** grace
period (reminders day 0/3/7/14/30); unresolved → suspended at day 30; re-paying restores immediately.

**Settings (six tabs).** Profile (business details, timezone, logo, report header — owner/admin;
account email is fixed) · Security (change password; signs out other devices) · Team (invite by
email + role; revoke invites) · Sessions (see/revoke devices, "log out other devices") · Notifications
(per-category email toggles; billing/quota always reach the bell) · Danger (close account — owner only,
type account name + password).

**Roles.** Owner — full control incl. billing + closure. Admin — campaigns, contacts, team, settings.
Member — runs campaigns/contacts; no account-wide billing/notification changes.

---

## Managed-client portal

If BulkReach runs campaigns *for* you (managed service):

1. The operator issues you a portal login (email + a temporary password).
2. On first login you **must set a new password**.
3. In the portal you **see the campaigns being run for you and their progress** (read-only). The
   BulkReach team handles everything end-to-end — there is no copy-approval step for you to action.

---

## Superadmin (operator) guide

Console: **admin.bulkreach.ug** (an extra Basic-Auth prompt at the edge, then your superadmin login).
Superadmins are created via a server-side bootstrap script, never self-signup.

- **Overview** — live platform KPIs (accounts, revenue, activity feed), provider health, and the
  managed-queue pending count. KPI tiles and panels deep-link to their sections.
- **Accounts** — every tenant with plan, status, MRR, 30-day volume; search/filter. Open a detail page
  for subscription, recent campaigns/payments, user count. Actions: **Suspend/Activate** (suspension
  blocks all its users at login) · **Log in as (Impersonate)** — act as the owner for support; a
  30-min token is minted, start/stop audited, an amber banner + Exit shows while active (a
  superadmin-owned account cannot be impersonated) · **Grant portal access** (turn an owner into a
  managed-portal client) · **Assign / override plan** (custom deal: custom quota/limit/price/features;
  excluded from dunning, survives refunds; a normal checkout later resets to standard).
- **Plans & payments** — Settings → Plans (create/edit/hide; a plan with active subscribers can't be
  deleted). Settings → Payments (configure each provider with live creds, Fernet-encrypted, and route
  each method; set the webhook/IPN URLs).
- **Managed queue** — the admin-only console for operator-run campaigns. The queue (`/admin/managed`)
  is a filterable table (client · stage · channel · age · next step); a row opens the focused job
  workspace (`/admin/managed/[id]`). There you run everything solo: write the brief, draft the SMS/email
  copy, link the campaign that will dispatch, **actually send it**, and issue the branded report. A
  single primary action advances each state (**Start content → Send now → Mark as sent → Issue report
  → Close job**). **Send now really dispatches** the linked campaign — it materialises the recipient
  messages and enqueues them through the same engine the client composer uses (confirm-gated), moving
  the job to *Sending*; when delivery finishes, mark it *Sent* and issue the report. **Cancel** does not
  just flag the job — if its campaign is still in flight it stops that dispatch too. Hold/Cancel are
  always available; every action (send, cancel, report) is audited. New briefs start at
  `/admin/managed/new`. No client sign-off, no team assignment.
- **Other operations** — Campaigns/Subscriptions/Payments cross-account views (refund from Payments) ·
  CMS (marketing content) · Revenue (MRR/ARPU) · Health (Postgres/Redis/ClickHouse/MinIO/providers) ·
  Audit log (every privileged action) · Archive (retention, anonymisation, erasure, legal holds, access
  log, export). Platform Settings is a read-only view of deploy-time config with links to the runtime
  controls above.
- **Go-live** — see [Deploy / go-live](#deploy--go-live) and `infra/DEPLOY-TRAEFIK.md`.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Campaign stuck at "pending", never sends | The ARQ **worker** isn't running — start it (`arq app.workers.WorkerSettings`). |
| "Payment required" when sending | Quota/concurrency/feature limit hit — upgrade or wait for the monthly/daily reset. |
| Merge tag rejected | Tag has invalid characters or isn't a column in your contacts. Use `{{name}}` style, letters/numbers/underscores only. |
| Can't log in after suspension | The account is suspended/closed — contact the operator. |
| PDF report won't render an external logo | Only `https` logos on public hosts are embedded (SSRF protection). Use a public HTTPS image URL. |
| Reset link "expired" | Reset links last 1 hour and are single-use — request a fresh one. |
| Inbound STOP/DLR webhook rejected (401) in prod | The callback must present `WEBHOOK_CALLBACK_SECRET` (`?s=` or `X-Webhook-Secret`); it fails closed when unset. |
| E2E logins 429 | Run `--workers=1` and clear Redis `*login*` keys first (see [Testing](#testing)). |

---

## Status

All milestones **M0–M8 complete** (foundation, auth, contacts, campaigns/dispatch, reports +
multi-provider payments, admin portal + managed workflow, marketing + admin frontend, data-archive,
tests + hardening), plus a verified production deploy stack and two full audit passes with fixes.

The managed service is now **admin-only end-to-end** — client sign-off and team assignment were
removed (dormant columns dropped in migration `b2d4f6a8c1e0`). Gates are green: **119 backend pytest**,
frontend `tsc` + `next build`, **5 Playwright E2E**. Remaining work is operator/VPS (real secrets, DNS,
deploy, backups, monitoring) — see `infra/OPERATIONS.md`. Live tracker: [CONTEXT.md](./CONTEXT.md).
