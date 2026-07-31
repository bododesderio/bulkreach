# Project Context
Last updated: 2026-07-31

## Current task — ✅ Full audit (10 lenses + live E2E) + hardening + docs (2026-07-31)
Ran a ten-lens senior-engineer audit as 7 parallel agents (architecture/tech-lead, performance,
security, frontend, devops, bug-hunt, live Playwright) against a running seeded stack. Deliverables
in **docs/**: `AUDIT-2026-07-31.md` (unified ranked findings + fixed-vs-planned + 6-phase master
plan), `PRODUCT.md`, `USER-MANUAL.md`. Deploy drafts (CI/backup/monitoring) in `infra/deploy-drafts/`.
Top corroborated findings: SSE DB-connection leak (Critical, 2 agents), quota TOCTOU (2 agents),
`manually_assigned` survives settlement (a bug in the prior plan-controls slice).
**Applied + verified fixes** (commits 1d4aa2d backend, a451246 frontend, 029a548 docs — pushed):
SSE session release, settlement normalizes manually_assigned, daily-quota block-partial, SSRF-safe
PDF url_fetcher, password-reset revokes sessions, signup/forgot rate limits, billing/notif role
guards, hot-path index migration (e9a3c5b7d1f2); FE admin-layout auth guard, 3 legal-consent pages,
error/not-found boundaries, amber impersonation banner, email lowercase, autocomplete, removed fake
admin badges. **99 backend tests pass** (+5), tsc clean. Live "stalled dispatch" was env-only (worker
wasn't running — dispatch is correct). NOT-yet-done work is the phased plan in AUDIT-2026-07-31.md
(Phase 1 scale-hardening: quota atomic reserve, bulk-insert recipients, admin query scoping, API-key
fast lookup, auth cache; Phase 2 DLR/suppression; Phase 3 sec: jose→PyJWT, XSS, impersonation audit;
Phase 4 FE: React Query/dark-mode/shared ui; Phase 5 ops: CI/backups/Sentry). See [[bulkreach-audit-masterplan]].
**Phase 1 scale-hardening ✅ mostly DONE (aa4510a, 61c2a16 — pushed):** quota reserve-and-refund
(atomic INCRBY, closes monthly TOCTOU; obsolete Layer-3 pause removed), bulk-insert recipients,
account-scoped admin aggregates, SQL account_summary, cancel-inside-batch-loop. 100 backend tests.
Deferred by design: fast API-key lookup (feature unwired — 0 rows; note left in dependencies.py) +
auth-principal cache (conflicts with immediate-suspend invariant). Still open: trial-decrement
atomicity (bug M-1), list-map scoping (perf M1). Next: Phase 2 (DLR ingestion) or 3/5.

## Prior task — ✅ Gap-closing slice: profile settings + plan controls + Traefik (2026-07-31)
Four threads shipped this session:
- **Feature A — deep profile settings.** Account `timezone` column (migration `c7e1a2f3d4b5`);
  `PATCH /auth/me` (partial profile edit, owner/admin only), `POST /auth/change-password`
  (verifies current, revokes other sessions), `POST /auth/delete-account` (owner-only soft
  close: status=closed + revoke all sessions, password + name confirm). Settings page rebuilt
  into 6 tabs (Profile · Security · Team · Sessions · Notifications · Danger).
- **Feature B — per-client plan controls.** Subscription override columns (migration
  `d8f2b3c4e5a6`): `manually_assigned`, `custom_messages_per_month`, `custom_daily_limit`,
  `custom_price_ugx`, `custom_features`. `enforce.resolve_limits` layers overrides over the
  shared Plan; `POST /admin/accounts/{id}/plan` (audited manual assign); settlement/dunning
  guarded so custom deals aren't clobbered (refund skip + renewal-sweep excludes manual subs).
  New admin account **detail page** `/admin/accounts/[id]` + "Manage" links.
- **Traefik routing.** `docker-compose.prod.yml` rebuilt for the shared-Traefik edge (dropped
  nginx): `bulkreach.ug`+`www` → web:3100, `admin.bulkreach.ug` → web:3100 (Basic-Auth gated),
  `api.bulkreach.ug` → api:3101 (`/docs` gated). External `web` network, `le` resolver, HTTP→HTTPS
  redirect, `TRUSTED_PROXY_COUNT=1`. Runbook `infra/DEPLOY-TRAEFIK.md` (VPS `195.110.59.36`;
  `.ug` DNS is NOT on Hostinger → A-records added manually at registrar). nginx.conf removed.
- **Authorship debt — RESOLVED (was stale).** Verified: `.env.production` was NEVER committed
  (untracked, gitignored); origin history is clean of Claude trailers; HEAD == origin/main. No
  force-push needed. Local-only secrets can be rotated at will (never exposed).

Tests: **94 backend pass** (added `tests/test_m9_profile_plan.py`, 6 tests; `pytest.ini` now
collects `test_m9_*`). Frontend `tsc --noEmit` clean. All source signed as Bodo.

## Prior task — ✅ Session infra DONE + pushed (2026-07-29, commit 3c5d20f)
Session-infra slice shipped: DB-backed rotating refresh sessions (opaque+sha256, family reuse/theft
detection) + append-only auth_events + RS256 (HS256 fallback) + 15-min access token + Settings "Active
sessions" UI + frontend silent-refresh interceptor. Migration b4d6f8a02c15. **All 4 security-audit
findings fixed:** (1) rotation race → `rotate()` uses `SELECT ... FOR UPDATE` + a grace window
(`REFRESH_ROTATION_GRACE_SECONDS`) so a concurrent two-tab replay re-issues instead of burning the family;
(2) XFF spoof → new `app/core/net.py` `client_ip()` trusting only `TRUSTED_PROXY_COUNT` hops + per-account
login limiter; (3) dead `create_refresh_token` removed; (4) CSRF stance documented on the cookie helper.
**88 backend tests pass.** Signed as Bodo, pushed (7 commits, fast-forward). Detail in
[[bulkreach-session-infra-wip]].

✅ **Authorship debt — RESOLVED (2026-07-31).** Re-verified against the live remote: 56 commits,
zero `Claude`/`Anthropic`/`Co-authored-by` trailers across every ref, all authored by Bodo, and
`HEAD == origin/main`. The Jul-29 filter-branch rewrite completed and was pushed; no force-push
outstanding. `.env.production` was never committed (untracked + gitignored) — no secret in history.

## Older current task (2026-07-28 end of day)
Gap-closing roadmap, recent slices:
- ✅ Managed 15-state pipeline — backend phase 1 (84a353b) + kanban/client-approval UI phase 2 (3ab45cb).
  Browser-verified (approve + request-changes + single-use token burn). See [[bulkreach-managed-pipeline]].
- ✅ SEO system (e2a043e) — metadata/sitemap/robots/JSON-LD + dynamic OG image. Browser+build verified.
  Gotcha: a parent `opengraph-image.tsx` is shadowed by per-page `openGraph` → reference OG_IMAGE
  explicitly. See [[bulkreach-seo-slice]].
- ✅ **Superadmin impersonation ("log in as") — DONE 2026-07-29.** Design: impersonation ONLY (no separate
  /admin/composer; admin uses the client composer), full-access/audit-only (30-min TTL + start/stop audit;
  principal = account owner so /admin/* stays role-blocked). Backend: `POST /admin/accounts/{id}/impersonate`
  (mints short-TTL token, audits `admin.impersonate.start`) + `POST /admin/accounts/impersonate-stop` (audits
  `.stop`, called with the admin's REAL token). Frontend: `lib/api.ts` imp-token overlay (single choke point —
  getToken prefers imp token) + auth-store start/stopImpersonation + accounts "Log in as" button + dashboard
  amber impersonation banner with Exit (managed_client→portal bounce skipped while impersonating). 4 new
  pytest (81/81 suite green), tsc clean, browser-verified E2E (log in as → dashboard as client → banner →
  Exit clears imp token, restores admin). See [[bulkreach-impersonation-wip]].

## Authorship (2026-07-28)
~/.claude/CLAUDE.md mandates: all commits/PRs/code authored as Bodo Desderio, NEVER "Claude"/
"Co-Authored-By: Claude"; run the `sign` skill before committing. The formerly-dirty local commits
(seo/managed phase 1+2) were scrubbed via `git filter-branch origin/main..HEAD` before the 2026-07-29
push. Older commits already on origin still carry the trailer — force-push rewrite pending user go-ahead.

## Older current-task note
Managed 15-state pipeline — Phase 1 (backend) DONE (77 tests). Next: Phase 2 (admin kanban rebuild +
public /managed-approve/[token] page), then browser-verify. [BOTH PHASES NOW DONE — see above.]

## Queued deployment task (NOT started) — Traefik/VPS routing
Route web-facing services onto the shared-Traefik VPS, one subdomain per service (landing/api/admin/
django-admin/docs), per-host HTTPS, optional Basic Auth on staff hosts, Django admin relocated off
/admin/. USE THE `traefik-routing` skill. STEP 0 first: read docker-compose*.yml (prod overlay) +
nginx edge conf + Django settings/urls/MIDDLEWARE; report shared Traefik `web` network name + ACME
resolver, Host→service→port map, DNS state. Fill in: TLD, VPS_IP, DNS_PROVIDER (Hostinger MCP?),
GATED_HOSTS. Deliver prod-overlay labels, DNS A-records, htpasswd gates (gitignored), .env.example
host vars, and a copy-paste VPS runbook. (BulkReach is FastAPI-only — no Django admin — verify during
STEP 0.) Honor skill gotchas: force-recreate edge on bind-mount change, htpasswd 644, etc.

Building BulkReach (bulk SMS & email SaaS). Full project overview + run/deploy/test/secrets now live in
**[README.md](./README.md)** (single consolidated doc; GO-LIVE.md + SECRETS.md folded in and removed).
All screenshots + Playwright/test artifacts deleted (regenerated fresh by the final Playwright pass).
ALL MILESTONES M0–M8 COMPLETE + prod deploy stack. Post-build gap-closing in progress (see
[[bulkreach-gap-closing]]): ✅ quota enforcement, ✅ auth design system, ✅ client dashboard reorganised
like the admin dashboard (stat cards + live quota usage bar + quick actions + recent campaigns),
✅ multi-step signup (2b), ✅ team invites (2c), ✅ managed-portal (2d: separate login + forced
password activation + guarded campaign portal). **Slice 2 complete.** ✅ Slice 3 billing:
invoices/receipts (gapless BR-INV-YYYY-NNNNNN numbering + WeasyPrint PDF), Uganda 18% VAT
(inclusive, backed out), mid-cycle proration on upgrade, auto-renewal + dunning ladder cron
(day 0/3/7/14/30 → suspend at 30). Next = notifications system, then CMS / managed 15-state
pipeline / cross-account admin composer.
Post-launch follow-ups (not blockers): ClickHouse 7yr-TTL + AWS Glacier need real infra (code paths
present, infra-gated); managed "issue report" → WeasyPrint PDF (M4a tie-in); admin users-list endpoint
for a manager picker; consider an isolated per-test DB schema. Next real step = productionise (Docker
stack up, real provider creds/KYC, deploy).

## Running locally (port lane 3100 — one project, one lane; see ~/.claude/PORTS.md)
- Frontend:    http://localhost:3100  (base+0)
- Backend API: http://localhost:3101  (base+1, FastAPI as primary API)
- Archive PG:  localhost:3110         (base+10, project-private Postgres)
- Shared services stay on well-known ports: Postgres 5432 (DB=bulkreach), Redis 6379.
- Frontend proxies /api → backend 3101 (same-origin, no CORS).
- Restart backend: `cd backend && source .venv/bin/activate` + env vars below + `uvicorn app.main:app --port 3101`
- Restart frontend: `cd frontend && API_PROXY_URL=http://localhost:3101/api npx next dev -p 3100`
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
- [~] M4 Reports (analytics + client success PDF) ✅ DONE (M4a). Payments ✅ DONE (multi-provider):
      provider registry + method routing — Flutterwave v3 + Pesapal 3.0 (real APIs) + MTN MoMo & Airtel
      direct + dev simulator. Admin-configurable (encrypted keys, test/live, method→provider) at
      /admin/settings/payments. Client checkout + USSD/redirect + history at /dashboard/billing.
      PaymentService state machine (server-authoritative amount, FOR-UPDATE + UNIQUE upsert, idempotent
      webhooks, fail-closed signature+amount). Security-audited & fixed. Logos in public/logos/payments.
      REMAINING M4: wire /admin/payments + /admin/subscriptions LISTS to real Payment/Subscription data
      (currently seed); rate-limit webhook/checkout routes; managed-service billing (invoices/receipts = M5/H).
- [x] M5 Admin portal + managed service workflow — 7 live superadmin APIs (overview/accounts/campaigns/
      audit-log/managed/health/revenue) replacing seed data; managed lifecycle briefed→report_issued with
      forward-only guards; account suspend/activate; real health checks. Browser-verified, 34/34 build. (3c7066d, c4725a2)
- [x] M6 Data Archive subsystem — ingestion (live→archive, idempotent, contact dedup), retention/purge
      (legal-hold aware), anonymiser (sha256), erasure workflow (DPA/GDPR), legal holds, append-only
      access log, retention rules, real export (storage), ARQ cron. ClickHouse 7yr-TTL + AWS Glacier
      infra-gated (honest no-ops). Live /admin/archive. Browser-verified, 34/34 build. (8487965, 8549ac8)
- [x] M7 Frontend — design system + public marketing site + admin subsystem + auth restyle + admin liveliness DONE.
      `NODE_ENV=production npm run build` passes (29/29 routes prerender, TS zero-error). All 9 missing admin
      pages built (accounts/subscriptions/managed/revenue/payments/campaigns/audit-log/health/archive) + client
      campaign composer. ALL browser-verified, zero console errors. Screenshots in repo root: admin-revenue.png,
      admin-health.png, admin-payments.png, admin-accounts.png, admin-managed.png, admin-archive.png, composer-verify.png.
      Working period toggle confirmed (Quarter→UGX 23.9M). Client composer wired to LIVE contacts backend.
- [x] M8 Tests + Playwright E2E + hardening — 23-test pytest suite (in-process ASGI vs brtest) across
      auth/payments/admin/archive; 4 Playwright E2E (checkout + admin); full security-audit hardening pass
      incl. CRITICAL fix (account suspend now blocks login/refresh/token use). All green. (e011caa, af25fe7)

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

## Next steps — RESUME HERE (2026-07-26 end of day)
Branch feat/m4a-reports. All payments work committed & pushed EXCEPT the custom checkout FRONTEND.

DONE & committed today (2026-07-26):
- Multi-provider payments (Flutterwave/Pesapal/MTN MoMo/Airtel) + admin config UI + client checkout (4aaf42f)
- Production hardening: token refresh cache, retry/backoff, refunds, stale reconciler (ARQ cron),
  webhook+checkout rate limits, admin /payments + /subscriptions lists + refund (2f2c087)
- Superadmin Plan Manager API — CRUD plans, drives pricing/checkout live (42b5aaa)
- Mode-driven checkout backend: CheckoutIntent mode = inline|ussd_push|redirect|simulated (2e4c147)
- Pesapal proven against REAL API (auth ok; user's creds are PRODUCTION not sandbox — rotate them).
  Browser-verified: admin payments config, client checkout (simulated), refund flow, admin lists.

✅ DONE & committed 2026-07-27 (M4 payments frontend fully complete):
- Custom checkout FRONTEND (7c74778): /dashboard/billing/checkout branches on CheckoutIntent mode
  (simulated poll / ussd_push STK / Flutterwave Inline card overlay / redirect); billing dashboard
  wired to live plans+history. Browser-verified simulated MTN MoMo E2E (checkout→success, sub activated).
- Plan Manager UI (0797838): /admin/settings/plans full CRUD wired to /admin/plans superadmin API +
  sidebar "Plans" link. Browser-verified create/edit/delete (subs-guard). Prod build 34/34 routes, tsc clean.

✅ M5 admin portal + managed-service workflow DONE 2026-07-27 (3c7066d backend, c4725a2 frontend):
7 live superadmin APIs replaced admin seed data; interactive managed workflow (briefed→report_issued);
account suspend/activate; real Postgres/Redis/provider health. All browser-verified, zero console errors.
See [[bulkreach-m5-admin]] memory (incl. date_trunc GROUP-BY gotcha + admin auth-store hydration fix).

✅ M6 Data Archive DONE 2026-07-27 (8487965 backend, 8549ac8 frontend): ingestion/retention/anonymiser/
erasure/legal-holds/access-log/export + live /admin/archive, browser-verified. ClickHouse 7yr-TTL + AWS
Glacier are infra-gated honest no-ops (no CH/MinIO container locally). See [[bulkreach-m6-archive]].

✅ M8 DONE 2026-07-27 (e011caa tests+hardening, af25fe7 E2E) — ALL milestones complete. See
[[bulkreach-m8-tests]]. Backend: 23 pytest (in-process ASGI vs brtest) — `cd backend && source .venv/bin/
activate && python -m pytest tests/test_m8_*.py` (clear rl:login first if login 429s). Frontend E2E: both
servers up, then `cd frontend && npm run test:e2e` (4 tests). Security audit hardening applied — biggest:
account suspend now truly blocks login/refresh/token use (was a no-op).

✅ Follow-up done 2026-07-27 (9be302b): managed "Issue report" now generates + emails the branded
WeasyPrint client PDF (reuses M4a renderer), stores it, records a client_success Report, and exposes
GET /admin/managed/{id}/report/download + a UI Download button + campaign-link picker. 25/25 backend tests.

GAP-CLOSING (post-build, vs Auth/Subscription/Payment mega-prompt — dependency order, see [[bulkreach-gap-closing]]):
✅ Slice 1 (quota enforcement, 73baefa), 2a (auth design system, 27e7b3e), 2b (multi-step signup +
   email OTP + onboarding — backend 34a186c, frontend a91d705) all DONE. Client dashboard reorganised
   like admin + usage bar. Suite 34/34, build 37 routes. Full Playwright pass green (public+client+admin).
   ✅ 2c team invites DONE (backend 16a9a5d, frontend e149dd2): invitation_tokens + invite/preview/accept
   endpoints + /invite/[token] page + team settings UI. Browser-verified. Suite 38/38.
   NEXT slices: 2d managed-portal; 3 invoices/proration/auto-renew/VAT; then notifications, CMS,
   managed 15-state pipeline. See [[bulkreach-gap-closing]].
✅ Deploy artifacts DONE (cb51154): prod Dockerfiles + docker-compose.prod + nginx + GO-LIVE; boot-verified.

✅ Follow-up done 2026-07-27 (5694f42): GET /admin/users staff directory + managed manager picker
(assign any staff, not just self). Seeded 2nd staff: ops@bulkreach.ug / OpsPass123! (superadmin) in brtest.

✅ Full Docker stack DONE 2026-07-27 (95f9c1b): docker-compose.dev.yml (pg/redis/clickhouse/minio).
ClickHouse analytics (delivery_events, real 7yr TTL) + MinIO exports now RUN FOR REAL — ingest pushes
events (verified 14), exports write real S3 objects, /admin/health lights both up, glacier_transition
flips storage_class. Start infra: `docker compose -f docker-compose.dev.yml up -d`. See [[bulkreach-m6-archive]].

NEXT (productionisation): deploy — production Dockerfiles (api/worker/web) + docker-compose.prod +
nginx/TLS + env/secrets checklist; real provider creds + KYC (MoMo/Airtel/Flutterwave/Pesapal); then
ship to a VPS. True AWS Glacier object-tiering needs an AWS S3 lifecycle policy (MinIO has no Glacier tier).

Servers left up: backend :3101 (bg), frontend :3100 (bg), brtest-pg 55432 + brtest-redis 63799.
Test superadmin: super@bulkreach.ug / SuperPass123!. Test DB has leftover tagged plans (Growth-xxxx) — cosmetic.

## Older next steps (M3, superseded — kept for reference)
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
- Frontend: `cd frontend && API_PROXY_URL=http://localhost:3101/api npx next dev -p 3100`
- Backend: containers brtest-pg (55432) + brtest-redis (63799) — `docker start brtest-pg brtest-redis`;
  then from backend/ w/ .venv active + env (DATABASE_URL/ARCHIVE_DATABASE_URL/REDIS_URL/SECRET_KEY):
  `PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8010`. Routes under /api/v1, health at /health.
- Test account created this session: verify+m7@bulkreach.ug / TestPass123! (Trial plan, owner).

## Older next steps
- M3 Campaigns (composer /dashboard/campaigns/new, dispatch SMS+email, ARQ worker, retry, SSE progress).
