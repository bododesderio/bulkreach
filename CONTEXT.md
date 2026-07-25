# Project Context
Last updated: 2026-07-25

## Current task
Building BulkReach (bulk SMS & email SaaS) from System Documentation v2.0 (40pp).
M0 + M1 complete & verified end-to-end. Next: M2 — Contacts + parsers + template engine.

## Running locally (this session — leave up for user to view)
- Backend API: http://localhost:8010  (port 8000 taken by another project's Django)
- Frontend:    http://localhost:3100  (ports 3000-3003 taken by other projects)
- Frontend proxies /api → backend 8010 (same-origin, no CORS).
- Restart backend: `cd backend && source .venv/bin/activate` + env vars below + `uvicorn app.main:app --port 8010`
- Restart frontend: `cd frontend && API_PROXY_URL=http://localhost:8010/api npx next dev -p 3100`
- [!] brtest-pg DB creds are **bulkreach / pw** (db bulkreach), NOT postgres/postgres.
      DATABASE_URL=postgresql+asyncpg://bulkreach:pw@localhost:55432/bulkreach
      ARCHIVE_DATABASE_URL=postgresql+asyncpg://bulkreach:pw@localhost:55432/bulkreach_archive
      Wrong creds → uvicorn still boots (health 200) but every DB query 500s (login etc).
- [!] Never run `NODE_ENV=production npm run build` while `next dev` is live on the same .next —
      it overwrites chunks and the running dev server serves 404s. Restart dev + `rm -rf .next` after a build.

## Browser (Playwright) verification — PASSED
- Landing renders (light/dark/mobile 375px). Signup→register 201→dashboard w/ live data.
  Session persists on reload. Dark-mode toggle. Logout→/login. Re-login 200→dashboard.
  Zero console errors, zero JS exceptions. Network: register=201, me=200, login=200.
- Screenshots in repo root: landing-light.png, dashboard-dark.png, landing-mobile-dark.png

## Test infra (verified working)
- Host ports 5432/5433/6379 are taken by OTHER projects. BulkReach uses throwaway
  containers for tests: `brtest-pg` (55432) + `brtest-redis` (63799). archive DB =
  `bulkreach_archive` on same pg container.
- Test env: DATABASE_URL=...localhost:55432/bulkreach, ARCHIVE_DATABASE_URL=...:55432/bulkreach_archive,
  REDIS_URL=redis://localhost:63799/0. Migrations applied, 4 plans seeded.

## Stack
FastAPI · Python 3.12 · SQLAlchemy2 async · PostgreSQL16 ×2 · ClickHouse24.3 ×2 ·
Redis7/ARQ · S3/MinIO+Glacier · Africa's Talking · Mailgun SMTP · Flutterwave ·
WeasyPrint · Next.js14 · TypeScript · Tailwind · shadcn/ui.

## Milestone tracker
- [x] M0 Foundation — infra, backend core, 13 live + 9 archive models, Alembic ×2, CH schema, FE scaffold + landing
- [x] M1 Auth & accounts — 7 routes, consent capture, RBAC, rate-limit, audit, 2 migrations, plans seed. E2E test PASS.
- [x] M2 Contacts — template engine ✅ + parser ✅ + 7 API routes ✅ + storage (S3/local) ✅ + contacts UI ✅.
      Browser-verified: CSV file upload (dropzone), paste import, column auto-detect, dedup, list mgmt. Zero console errors.
      (docx/pdf parsers written; runtime-test pending heavy deps.)
- [x] Dashboard shell — ClientLayout: left sidebar (Overview/Contacts/Campaigns/Reports/Settings + Log out last item),
      topbar with profile (name/plan/avatar), auth guard, mobile drawer. Settings/Reports/Campaigns section pages.
      Browser-verified: nav active state, profile, zero console errors. (`dashboard-shell.png`)
- [x] M3 Campaigns BACKEND — CRUD + preview + send/schedule/cancel + per-message delivery + SSE progress.
      Multi-provider dispatch: SMS (Africa's Talking, Twilio, Infobip, Vonage) + Email (Mailgun API/SMTP,
      SendGrid, Postmark, SES, generic SMTP), each functional when its keys are set; labelled simulator
      fallback in dev. messages table + retry w/ exponential backoff (≤3), ARQ worker + scheduled-poller cron.
      Verified: direct engine test (40 msgs, retry path) + full HTTP flow (upload→create→preview→send→SSE→messages).
      REMAINING M3: wire frontend composer Send button + SSE progress bar to these endpoints (frontend follow-up).
- [ ] M4 Reports (analytics + client success PDF) + Flutterwave payments/webhook
- [ ] M5 Admin portal + managed service workflow
- [ ] M6 Data Archive subsystem (ingestion, retention, anonymiser, glacier, export, access log)
- [x] M7 Frontend — design system + public marketing site + admin subsystem + auth restyle + admin liveliness DONE.
      `NODE_ENV=production npm run build` passes (29/29 routes prerender, TS zero-error). All 9 missing admin
      pages built (accounts/subscriptions/managed/revenue/payments/campaigns/audit-log/health/archive) + client
      campaign composer. ALL browser-verified, zero console errors. Screenshots in repo root: admin-revenue.png,
      admin-health.png, admin-payments.png, admin-accounts.png, admin-managed.png, admin-archive.png, composer-verify.png.
      Working period toggle confirmed (Quarter→UGX 23.9M). Client composer wired to LIVE contacts backend.
- [ ] M8 Tests + Playwright E2E + hardening

## Recent decisions
- 2026-07-24: `next build` MUST run with NODE_ENV=production. The shell exports NODE_ENV=development globally,
  which makes next build load React in mixed dev/prod mode → "Cannot read properties of null (reading 'useContext')"
  crash on all prerendered pages. Not a code bug. Use `NODE_ENV=production npm run build`.
- 2026-07-23: Two independent Alembic configs (alembic.ini live, alembic_archive.ini archive) — Section 18.2 separate DBs.
- 2026-07-23: bcrypt pinned 4.0.1 (4.1+ breaks passlib version read). Verified clean.
- 2026-07-23: Using uv for venv (system python3-venv unavailable).
- 2026-07-23: Build proceeds in verified milestones; no placeholders, honest checkpoints per user prompt.

## Known issues
- Full requirements (weasyprint/camelot/pandas) not yet installed in venv — only core web deps for M0 import check.
- Docker stack not yet brought up (no daemon verification this session).

## Next steps — RESUME HERE (2026-07-25)
M3 Campaigns BACKEND complete & verified. Frontend campaign lifecycle DONE:
1. ✅ DONE (PR #1, branch feat/campaigns-list-detail): composer Send wired to POST /campaigns → /send
   with live SSE progress (fetch-reader, not EventSource — Bearer auth); campaigns list (GET /campaigns,
   auto-refresh while live) + detail [id] (KPI stats, live progress, per-message delivery table).
   Shared code in frontend/lib/campaigns.ts. Client-side merge-tag validation mirrors backend.
   Initial repo commit also pushed to main (c84a933).
2. NEXT → M4 Reports (analytics + client-success PDF via WeasyPrint — NOT yet installed) + Flutterwave payments/webhook.
3. M5 Admin backend (replace admin seed data with real superadmin API), M6 Archive subsystem, M8 tests.

Note: merge PR #1 before starting M4 (or keep building on the branch).

## M3 Campaigns backend — how to run / verify
- Endpoints (all under /api/v1/campaigns, JWT-auth): GET /providers, POST "" (create draft),
  GET "" (list), GET/PATCH/DELETE /{id}, POST /{id}/preview|send|schedule|cancel,
  GET /{id}/messages, GET /{id}/progress (SSE text/event-stream).
- Providers configured via env; "auto" picks first configured. SMS_PROVIDER/EMAIL_PROVIDER +
  per-provider keys in app/core/config.py. When none configured (dev) → labelled SIMULATOR.
- Dev dispatch env: DISPATCH_INLINE=true runs dispatch in-process (no separate worker needed);
  DISPATCH_FORCE_SIMULATOR=true forces simulator; SIMULATOR_FAILURE_RATE tunes retry exercise.
- Production dispatch: leave DISPATCH_INLINE unset and run the ARQ worker:
  `PYTHONPATH=. arq app.workers.WorkerSettings` (same env as the API). Cron promotes scheduled campaigns.
- Migration b2c4e6f80a12 (messages table) applied to brtest-pg. Deps added: arq, aiosmtplib (uv pip).
- New files: app/services/dispatch/{base,sms_providers,email_providers,progress,engine}.py,
  app/services/campaign_service.py, app/schemas/campaign.py, app/api/v1/campaigns.py, app/workers/__init__.py,
  app/models/campaign.py (Message model). Test: scratchpad/test_m3.py (all checks pass).

## Admin liveliness build — what shipped (2026-07-25)
- lib/seed-data.ts expanded (+230 lines): seedAccounts, seedSubscriptions, seedPayments, seedPaymentMethods,
  seedRevenueSeries, seedRevenueTotals (period-keyed), seedAdminCampaigns, seedAuditLog, seedHealthServices,
  seedHealthIncidents, seedThroughputSeries, seedManagedPipeline, seedArchive*, seedActivity, seedKPIsByPeriod.
- New shared primitives (components/admin/): CountUp, AnimatedSparkline (pathLength draw-in), StatCard,
  DataTable<T> (staggered rows), StatusPill/StatusDot (pulse), AreaTrend + Donut (recharts), LiveTicker,
  DemoBadge. Topbar now supports controlled period (period/onPeriodChange/showPeriod).
- 9 admin pages built by 3 parallel frontend-builder agents against scratchpad/ADMIN_SPEC.md.
- Client pages enriched: /dashboard/campaigns (livelier honest empty state), /dashboard/reports (sample
  report preview), NEW /dashboard/campaigns/new (working composer: live audience, merge-tag insert, live
  preview, SMS segments; Send disabled til M3).
- RSC gotcha fixed: pages passing a fn prop (format) to a client chart (AreaTrend/Donut) MUST be 'use client'.

## Older next steps (superseded — kept for reference)
User asked: "continue wiring everything and make pages more lively esp admin." Audit done, ready to build.

### Findings (frontend/)
- Admin sidebar (components/admin/Sidebar.tsx) links to 9 sections; only 2 pages exist
  (app/admin/page.tsx, app/admin/settings/page.tsx). These 8 routes 404 → BUILD THEM:
  /admin/accounts, /admin/subscriptions, /admin/managed, /admin/revenue, /admin/payments,
  /admin/campaigns, /admin/audit-log, /admin/health, /admin/archive (archive is 'special' teal link).
- Admin uses SEED DATA only (lib/seed-data.ts, 189 lines) — no superadmin backend exists yet (M5).
  Keep it seed-driven but make it feel alive. Be honest it's seed data.
- Client stubs to enrich: app/dashboard/campaigns/page.tsx + reports/page.tsx = empty-state only.
  (contacts + dashboard overview ARE wired to live backend.)
- Backend has ONLY auth + contacts routes (/api/v1/auth/*, /api/v1/contacts/*). No campaigns/
  admin/payments/reports endpoints → full live wiring = M3/M4/M5 backend work, not doable frontend-only.
- Installed & ready: framer-motion ^11, recharts ^2.14, tailwindcss-animate. Reveal.tsx = CSS fade-up
  (animate-fade-up + hover-lift utilities in globals.css). Topbar period toggle has state but doesn't filter.
- Admin components to reuse: KPICard, Sparkline (static SVG polyline), RevenueBars, QueueList,
  HealthList, ClientsTable, Reveal/RevealGroup/RevealItem. lib/api.ts = api()/apiUpload() client.

### Plan for tomorrow
1. Expand lib/seed-data.ts: full datasets for accounts, subscriptions, payments, revenue time-series,
   campaigns, audit log, expanded health. Add helpers for filtering by period.
2. Build the 8 missing admin pages (rich tables + recharts charts + Reveal stagger). Parallel agents OK.
3. LIVELINESS pass (esp admin): animated count-up KPI numbers, sparkline draw-in animation,
   pulsing "live/operational" dots, a live activity ticker/feed, hover lift, working period toggle
   that re-filters, animated recharts. Use framer-motion.
4. Client side: make campaigns/reports pages livelier + interactive (still empty-state honest since
   no backend, but animated + a real /dashboard/campaigns/new composer shell if time).
5. Rebuild with NODE_ENV=production, browser-verify each new admin page (0 console errors), screenshot.

### Servers (may need restart tomorrow)
- Frontend: `cd frontend && API_PROXY_URL=http://localhost:8010/api npx next dev -p 3100`
- Backend: containers brtest-pg (55432) + brtest-redis (63799) — `docker start brtest-pg brtest-redis`;
  then from backend/ w/ .venv active + env (DATABASE_URL/ARCHIVE_DATABASE_URL/REDIS_URL/SECRET_KEY):
  `PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8010`. Routes under /api/v1, health at /health.
- Test account created this session: verify+m7@bulkreach.ug / TestPass123! (Trial plan, owner).

## Older next steps
- M3 Campaigns (composer /dashboard/campaigns/new, dispatch SMS+email, ARQ worker, retry, SSE progress).
