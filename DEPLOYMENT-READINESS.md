<!--
  @author Bodo Desderio <rooiboktechltd@gmail.com>
  @copyright 2026 Rooibok Technologies. All rights reserved.
-->
# BulkReach — Deployment Readiness Report

_Last updated: 2026-08-04_

A full-system audit (5 parallel review passes over authorization/tenant isolation,
user flows, deployment, performance, and UX) was run against a green baseline, and
every launch-blocking and high-value finding was fixed. This report records the
verdict, what changed, and the operator tasks that remain.

## Verdict

**GO for launch, pending operator tasks.** The application code is production-grade:
tenant isolation is airtight (no cross-tenant data access or privilege escalation),
webhooks/payments fail closed, quota is atomic, and dispatch is resilient. The two
original blockers — dead password-recovery UI and a prod compose that never fed send
credentials to the containers — are fixed. What remains is standard operator setup
(real secrets, DNS, provider keys, first deploy).

## Baseline (all green)

| Gate | Result |
|---|---|
| Backend suite | **134 pytest passing** |
| Frontend types | `tsc --noEmit` clean |
| Frontend lint | `next lint` clean |
| Production build | `NODE_ENV=production npm run build` — **50/50 routes** prerender |

## What was fixed this pass (7 commits)

### Launch blockers
- **Password recovery** — `/forgot-password` and `/reset-password` pages were missing
  (the backend was complete; login linked to a 404). Both pages now exist and are
  verified; a locked-out user can recover their account.
- **Production could not send** — `docker-compose.prod.yml` never injected the
  email/SMS/webhook/observability env into the `api`/`worker` containers, so every
  message would have failed. Added `env_file: [.env.production]` to both, and
  documented `WEBHOOK_CALLBACK_SECRET` (which fails closed in prod → DLR + STOP
  opt-outs were being rejected).

### Security / correctness
- `POST /payments/checkout` is now owner/admin-only (a `member` could previously
  start a charge / plan change).
- CORS allows the apex **and** `www` origin; PDF endpoints degrade to 503 (not 500)
  when native libs are absent.
- Admin accounts KPI totals are now platform-wide (a grouped COUNT) instead of the
  loaded page count — the "total clients" figure was wrong beyond 500.

### Performance (hot paths)
- Admin campaign list no longer GROUP-BYs the entire `campaign_contacts` table on
  every view — it counts recipients only for the page of campaigns shown.
- `campaign_service.estimate()` is a single `COUNT(*) FILTER` aggregate instead of
  hydrating up to 20k contact rows on every draft detail view (test-locked).

### UX / accessibility
- Composer **Send now** now confirms recipient count + channel before an irreversible
  bulk dispatch.
- Contacts + composer no longer mask API errors as a fake "empty" state — a failed
  load shows an error + retry.
- Dark-mode alert contrast fixed (theme-aware `--warning-fg` token) — critical
  banners were invisible on dark.
- Campaign **scheduling UI** added (backend existed and the site advertised it, but
  there was no way to do it).
- Keyboard focus rings on the legacy button classes; Topbar title is an `<h1>`;
  the decorative "remember me" checkbox (sessions always last 30 days) replaced with
  an honest note.
- Public marketing site + auth pages forced to their fixed light-brand look so the
  app's dark mode never half-inverts them; fabricated "98.4% delivery rate"
  relabelled as a target.

## Deferred (documented, not launch-blocking)

Scale optimizations that carry refactor risk on the critical send path and are
unnecessary at launch volume:
- Per-batch short-lived DB sessions in the dispatch engine (raises the worker
  concurrency ceiling).
- Streaming CSV export (the in-memory build is fine for typical campaign sizes).
- Full cursor pagination for admin lists (the list is capped at 500; the KPI totals
  are already correct).

Lower-value polish: `settings/content` tab error states; mobile row-action overflow
menus; migrating the client dashboard fully onto the shared `components/ui` library;
`create_index` → `CONCURRENTLY` (harmless on the empty launch DB); structured logging
with request-id correlation.

## Operator tasks before going live

These are environment setup, not code (see `infra/OPERATIONS.md` and
`infra/DEPLOY-TRAEFIK.md`):

1. Populate `.env.production` — `SECRET_KEY`, `PAYMENTS_ENCRYPTION_KEY`, `ANON_PEPPER`,
   `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `ADMIN_BASICAUTH`, `DOCS_BASICAUTH`,
   the email/SMS provider keys, and `WEBHOOK_CALLBACK_SECRET` (`openssl rand -hex 32`).
2. DNS A-records for `bulkreach.ug` / `www` / `api` / `admin`; ensure the shared
   Traefik `web` network + `le` ACME resolver exist. Redirect `www`→apex at the edge.
3. Configure payment providers in `/admin/settings/payments` (stored Fernet-encrypted).
4. Point the provider DLR/inbound callback URLs at
   `…/webhooks/…?s=<WEBHOOK_CALLBACK_SECRET>`.
5. Create the superadmin (`scripts/create_superadmin.py`) and seed plans
   (`scripts/seed_plans.py`).
6. Deploy: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build`.
7. Install the nightly backup cron and rehearse one restore drill.
8. Optional: set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `KUMA_PUSH_URL`.
