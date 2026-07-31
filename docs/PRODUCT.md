# BulkReach — Product Documentation
**Author:** Bodo Desderio, Rooibok Technologies · **Last updated:** 2026-07-31

---

## 1. What BulkReach is

BulkReach is a **bulk SMS & email marketing platform (SaaS)** built for the East African
market (base currency **UGX**, Uganda VAT-aware). It lets a business upload its contacts, compose
a personalized message once, and dispatch it to thousands of recipients over SMS and/or email —
then see how it performed. It also offers a **managed service**: the BulkReach team runs campaigns
on a client's behalf through a superadmin console and a light client-approval portal.

There are two ways a customer uses BulkReach:

- **Self-service** — a company signs up, buys a plan (or uses the free trial), and runs its own
  campaigns from the dashboard.
- **Managed service** — the BulkReach operator (superadmin) drafts and runs campaigns for a
  client; the client reviews and approves copy through a single-use approval link and a portal.

### Who uses it
| Role | Who | Where |
|------|-----|-------|
| **Owner / Admin / Member** | A customer company's users (multi-user accounts, RBAC) | `bulkreach.ug/dashboard` |
| **Managed client** | A hands-off client of the managed service | `bulkreach.ug` managed portal |
| **Superadmin** | The BulkReach operator/platform staff | `admin.bulkreach.ug` |

---

## 2. Core capabilities

- **Contacts** — CSV upload (drag-drop) or paste-import with column auto-detection, validation,
  and de-duplication; contact lists per account.
- **Campaigns & Composer** — create SMS, email, or both-channel campaigns; personalize with
  `{{merge_tags}}`; live preview; SMS segment counting; send now or schedule; per-recipient
  delivery tracking; live progress over Server-Sent Events; retry with exponential backoff.
- **Multi-provider dispatch** — SMS via Africa's Talking (primary), Twilio, Infobip, Vonage;
  Email via Mailgun (API/SMTP), SendGrid, Postmark, SES, or generic SMTP. Each is used when its
  keys are configured; a labelled simulator is the dev fallback.
- **Reports** — per-account analytics (sent/delivered/failed by channel, over time) and a branded
  per-campaign success **PDF** (WeasyPrint).
- **Plans, quota & billing** — four plans (Starter/Growth/Business/Managed); monthly message
  quota + daily limits + concurrency + feature gates enforced in three layers (Redis counters);
  invoices/receipts with gapless numbering + Uganda 18% VAT + mid-cycle proration; auto-renewal
  and a failed-payment **dunning ladder** (day 0→30 → suspend).
- **Payments** — multi-provider, admin-configurable: Flutterwave (card, inline), Pesapal, MTN
  MoMo, Airtel Money. Server-authoritative amounts, verified settlement, refunds.
- **Per-client plan controls** — superadmins can manually place an account on a plan with custom
  quota/price/feature overrides (custom deals) that survive settlement/dunning appropriately.
- **Notifications** — in-app bell + email, per-category preferences; critical billing/security
  notices force-email.
- **Managed pipeline** — a 15-state kanban workflow for operator-run campaigns, with a public
  single-use client-approval page.
- **CMS & SEO** — admin-managed marketing content (features, testimonials, FAQs, page copy);
  metadata, sitemap, robots, JSON-LD, dynamic OG images.
- **Data governance / archive** — ingest, 7-year retention, anonymisation, GDPR-style erasure,
  legal holds, access logging, export (ClickHouse + S3/Glacier paths, infra-gated).
- **Auth & sessions** — email+password with OTP verification, multi-step signup, team invites,
  DB-backed rotating refresh sessions with theft detection, active-session management, 15-minute
  access tokens (RS256), superadmin **impersonation** ("log in as").

---

## 3. Architecture

```
                         ┌─────────────────────────────────────────┐
  Browser ──HTTPS──►  Shared Traefik edge (TLS via Let's Encrypt)   │
                         │   bulkreach.ug / www  → web:3100          │
                         │   admin.bulkreach.ug  → web:3100 (BasicA) │
                         │   api.bulkreach.ug    → api:3101 (/docs BA)│
                         └───────────────┬──────────────────────────┘
                                         │  (Next proxies /api → api, same-origin)
        ┌────────────────────────────────┼───────────────────────────────┐
        ▼                                ▼                                 ▼
   web (Next.js 14)                 api (FastAPI)                     worker (ARQ)
   App Router SPA               /api/v1/* routers            dispatch + cron jobs
        │                            │                                    │
        └──────────── internal network (no host ports) ──────────────────┘
                 Postgres (live + archive) · Redis · ClickHouse · MinIO/S3
```

- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Lucide. Route groups:
  marketing (public), `dashboard` (client), `admin` (superadmin), managed portal. All API calls
  funnel through `lib/api.ts` (bearer token + silent refresh on 401 + impersonation-token overlay).
- **Backend:** FastAPI + SQLAlchemy 2 (async), all routes under `/api/v1`. A single ARQ worker
  runs campaign dispatch and cron jobs (scheduled-send promotion every 30s, payment reconcile,
  daily renewal + dunning, nightly archive).
- **Data:** PostgreSQL 16 (a **live** DB + a separate **archive** DB), Redis 7 (quota counters,
  progress, rate limits, ARQ queue), ClickHouse 24.3 (analytics, feature-gated), MinIO/S3 (files).
- **Auth:** JWT access tokens (15 min, RS256 with HS256 fallback) + a DB-backed **rotating
  refresh cookie** (opaque + sha256, per-family reuse/theft detection, grace window). Roles:
  `owner`/`admin`/`member` per account + platform `superadmin`.
- **Payments:** a strict state machine `created → pending → successful|failed|timeout`, amount
  server-authoritative + proration-aware, idempotent `ON CONFLICT` subscription upsert, webhook
  signature-verify-then-re-verify. Provider credentials are Fernet-encrypted at rest.

### Deployment
Single shared-Traefik VPS (`195.110.59.36`). Compose stack: `postgres, redis, clickhouse, minio,
api, worker, web`. No host ports on web-facing services — Traefik routes by Host over the external
`web` network; TLS via the `le` ACME resolver. Migrations run on the `api` container at boot.
Full runbook: `infra/DEPLOY-TRAEFIK.md`. Operational drafts (CI, backups, monitoring):
`infra/deploy-drafts/`.

---

## 4. Data model (essentials)

- **Account** — the tenant. name, email, plan, status (`active`/`trial`/`suspended`/`closed`),
  logo_url, report_header, contact_name, phone, industry, **timezone**, marketing_opt_in, trial
  allowance, consent record (immutable), soft-delete (`is_active`, `deleted_at`).
- **User** — belongs to an Account; email, hashed_password, role, user_type
  (`self_service`/`managed_client`), email_verified, must_change_password.
- **Plan** — name, price_ugx, messages_per_month (−1 = unlimited), batch_size, `features` JSONB
  (`gates`: daily_limit, simultaneous_limit, scheduling, allowed_formats), presentation fields.
- **Subscription** — one per account (UNIQUE), plan_id, status, period window, auto_renew, dunning
  fields; **per-account overrides** (`manually_assigned`, `custom_messages_per_month`,
  `custom_daily_limit`, `custom_price_ugx`, `custom_features`).
- **Payment** — amount, currency, method, status, provider, tx_ref (unique), plan_id, raw payload,
  refund fields.
- **Campaign** / **CampaignContact** / **Message** — a campaign, its resolved recipients, and each
  per-recipient send (status, retries) with denormalized per-campaign counters for fast reporting.
- **Contact** / contact lists — imported audience with merge fields.
- **RefreshToken** / **AuthEvent** — rotating sessions + append-only auth audit.
- **Notification** / **NotificationPreference**, **Invoice**, **ManagedCampaign** (15-state),
  **AuditLog** (append-only), CMS tables, and the archive schema.

---

## 5. API surface (representative, all under `/api/v1`)

- **Auth/account:** `POST /auth/register`, `/auth/signup/complete`, `/auth/verify-email`,
  `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`,
  `GET|PATCH /auth/me`, `POST /auth/change-password`, `POST /auth/delete-account`,
  `/auth/sessions*`, `/invitations*`.
- **Contacts:** `POST /contacts/import`, `GET /contacts`, list management.
- **Campaigns:** `POST /campaigns`, `GET /campaigns`, `GET /campaigns/{id}`, `/preview`,
  `/send`, `/schedule`, `/cancel`, `GET /campaigns/{id}/messages`, `GET /campaigns/{id}/progress` (SSE).
- **Reports:** `GET /reports/summary`, `GET /reports/campaigns/{id}/pdf`.
- **Billing:** `GET /billing/subscription`, `/invoices`, `/invoices/{id}/pdf`, `/proration-preview`,
  `PATCH /billing/auto-renew`; **Payments:** `/payments/checkout`, `/payments/verify`,
  `/payments/webhooks/{provider}`.
- **Notifications:** `GET /notifications`, `/unread-count`, `/read`, `/read-all`,
  `GET|PATCH /notifications/preferences`.
- **Admin (superadmin):** `/admin/overview`, `/admin/accounts` (+`/{id}`, `/suspend`, `/activate`,
  `/impersonate`, `/impersonate-stop`, `/portal-access`, **`/plan`**), `/admin/campaigns`,
  `/admin/subscriptions`, `/admin/payments/*`, `/admin/plans`, `/admin/managed*`, `/admin/revenue`,
  `/admin/health`, `/admin/audit`, `/admin/archive/*`, `/admin/cms/*`.

Interactive schema: `https://api.bulkreach.ug/docs` (Basic-Auth gated in production).

---

## 6. Quotas & enforcement (how limits work)

Effective limits resolve in order: an active **Subscription → Plan** (+ per-account overrides) →
a **trial** account's free allowance → a **Plan matched by name**. Enforcement is layered:
1. **Read layer** — the dashboard/composer show live usage from Redis counters.
2. **Hard gate** — `enforce_send` blocks a send that would exceed monthly/daily quota, the
   concurrency limit, or a feature gate (e.g. scheduling), returning `402` with a machine code.
3. **Fail-safe** — the dispatch engine re-checks before finalizing.

Trials are billed up-front (allowance decremented at send); paid plans meter as they dispatch.
Custom (`manually_assigned`) deals bypass the dunning ladder and survive refunds.

---

## 7. Environments & configuration

- **Ports (dev):** frontend `3100`, API `3101`, project-private archive PG `3110`. Shared
  Postgres 5432 / Redis 6379. Frontend proxies `/api` → API (same-origin).
- **Key env:** `SECRET_KEY`, `PAYMENTS_ENCRYPTION_KEY` (Fernet, fail-closed in prod),
  `ANON_PEPPER` (set explicitly), `DATABASE_URL`/`ARCHIVE_DATABASE_URL`, `REDIS_URL`,
  `FRONTEND_URL`, `BASE_URL`, `TRUSTED_PROXY_COUNT`, provider keys (mostly entered in the admin
  UI, encrypted), `ADMIN_BASICAUTH`/`DOCS_BASICAUTH` (edge gates).
- **Testing:** in-process ASGI suite against throwaway Postgres (55432) + Redis (63799);
  **99 tests** at time of writing. Frontend: `tsc --noEmit` + `next build`.

See `README.md` for run/deploy/secrets and `docs/AUDIT-2026-07-31.md` for the audit + roadmap.
