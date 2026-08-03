<!--
  @author Bodo Desderio <rooiboktechltd@gmail.com>
  @copyright 2026 Rooibok Technologies. All rights reserved.
-->
# Project Context
Last updated: 2026-08-03

## Latest session — ✅ Second full audit (4 parallel agents) + live testing + fixes (2026-08-03)
Ran the whole stack locally (dev datastores on 55432/63799/3112, host uvicorn :3101 + Next dev :3100,
seeded 1721 accounts) and drove it in a real browser (Playwright). Live-verified the prior WIP
(clickable KPI/StatCards + managed stat-filter, commit `229dae5`), then fanned out 4 audit agents
(security, backend-correctness, frontend-UX, recent-changes review) and fixed the findings.

- **Backend (`7ed9a8d`)** — Security: webhook callback-secret gate (inbound-SMS + DLR fail **closed**
  in prod, simulator prod-gated, Mailgun fails closed w/o key) closing a forgeable opt-out-by-number
  hole; refuse impersonating a superadmin account; constant-time login + forgot-password (kills
  enumeration timing oracles); `/docs`+`/openapi` off in prod. Correctness: overview
  `managed_queue_pending` used a bogus terminal set (counted finished jobs as pending → 388 vs real
  247) now reuses `pipeline.TERMINAL`; dispatch recomputes campaign counters from the `messages`
  table at completion (retry no longer clobbers totals); inbound STOP normalises to E.164;
  `quota.release` floors at 0; new `(recipient, created_at)` index. +`test_m10_hardening.py`.
  **121 backend pytest green.**
- **Frontend (`33dbbf5`)** — Reports `.catch→null` blanked the page on a 500 → now DataState
  error+**Try again** (verified live: 500→retry→recover); campaign-detail error≠404 no longer
  falsely says "deleted"; profile tab no longer hangs on `/auth/me` failure; contact-list delete
  now confirms; admin campaigns dead "Details" toast → real "Account →" link; admin Settings fake
  "saved" no-op → honest read-only view + links to real runtime-config pages; managed board tiles
  derive from one predicate set (cancelled-item consistency); managed-portal humanises unknown stages.
  **tsc + lint + prod build green.**
- Verified-NOT-a-bug (audit false positive): notification billing/quota email toggles are
  intentionally clickable — the backend only force-locks *in-app*, not email.
- **Managed queue redesign (`79b7993`)** — split the one-screen 15-column kanban into a filterable
  **table** (`/admin/managed`) → focused **job workspace** (`/admin/managed/[id]`, stage stepper +
  Brief/Content/Send/Report sections, one clear primary action per state) → **new-brief** page
  (`/admin/managed/new`). Flow simplified per owner: **no client sign-off, no team assignment** — the
  admin runs each job solo. Backend states collapsed to 5 admin steps in `lib/managed.ts`; backend
  pipeline/approval/portal left intact but unused (forward jumps let the admin skip). Added backend
  `GET /admin/managed/{id}`. E2E test `268f94e` covers create→advance.
- **All pushed to origin/main** (5c76da4..268f94e). Gates green: **121 backend pytest**, frontend
  tsc + lint + prod build, **5/5 Playwright E2E** (run `--workers=1`; clear `*login*` Redis keys first
  or the per-account login limiter 429s the parallel workers). E2E creds: super@bulkreach.ug /
  SuperPass123!, verify+m7@bulkreach.ug / TestPass123! (set in dev DB this session).
- **Client sign-off removed from backend (`662e067`)** — deleted the public approval router
  (`managed_approval.py`), the admin `request-approval` endpoint, and the `/managed-approve/[token]`
  page; dropped orphaned schemas + robots entry. Approval endpoints now 404; client managed-portal
  (read-only visibility) kept.
- **Assignment stripped + dormant columns dropped (`bbd82ed`)** — removed account-manager assignment
  across model/API/schema/frontend/tests. Migration **b2d4f6a8c1e0** drops `managed_campaigns.`
  {account_manager_id, approved_at, approval_token_hash+index, approval_sent_at, approval_expires_at,
  change_request_note}; **reversible** (verified up/down/up), `status` + job states untouched.
  managed_campaigns now has only: campaign_id, account_id, brief_text, status, id, created_at,
  updated_at, copy_sms/subject/body, on_hold, cancelled. 119 backend pytest + 5 E2E green. The managed
  service is now fully admin-only end-to-end.
- Deferred (documented, lower value / larger): full DataState sweep across remaining pages, the 5
  bespoke-modal → shared `<Modal>` accessibility migration, per-session access-token revocation
  (needs a `token_version` column + migration), refresh-grace-window idempotency, assorted LOW a11y
  nits. localStorage-token XSS exposure noted (architectural).

## Current state — ✅ ALL 6 audit phases complete; single `main`; green (2026-08-01)
The full audit master plan (was docs/AUDIT-2026-07-31.md, now removed) is closed. All product docs
were consolidated into README.md (2026-08-03) and the docs/ folder deleted. Repo is a **single
`main` branch** (no feature branches, local or remote); commit directly to `main` going forward.

Phases (all merged to `main`):
- **1** scale-hardening · **2** DLR + suppression · **3** security — merged earlier.
- **4** frontend polish (#3) — shared `components/ui` (Card/Modal/DataState/StatusBadge + `lib/status`),
  mock purge (admin overview live), React Query sweep (~25 pages, `lib/hooks`), unified `AppShell` +
  admin mobile drawer (`store/ui`), `next-themes` removed. Browser-verified. [[bulkreach-phase4-frontend]]
- **5** ops readiness (#5) — `/health/ready`, Sentry (be+fe, gated), worker heartbeat, secret
  fail-closed, backup script, monitoring compose, `infra/OPERATIONS.md`. [[bulkreach-phase5-ops]]
- **6** domain exceptions (#6) — `app/domain/exceptions.py`; the worker now pauses+notifies a
  scheduled campaign that hits the quota gate instead of silently dropping it. [[bulkreach-phase6-domain]]
- **fix** worker healthcheck (#4, `arq --check`).

Verified green: backend **112 pytest**; frontend `npm ci` + `tsc` + prod `next build`; **prod Docker
stack** (`docker compose -f docker-compose.prod.yml`) builds from `main` and runs all 7 containers
healthy (`/health/ready` → ready, worker healthy). Stack currently **stopped** (start with
`docker compose --env-file .env.production -f docker-compose.prod.yml start`).

⚠️ **GitHub Actions removed** (commit `4be0647`): the account is **billing-locked**, so every CI run
failed at job-setup and emailed a failure notice. No `.github/workflows` — gates run locally, deploy
is manual (infra/OPERATIONS.md §2). Re-add a workflow only if Actions billing is restored. (The
separate `bododesderio/ForUs` repo also emails failures — remove its workflows there.)

Local-only: `.env.production` (gitignored) holds generated dev-grade secrets for local builds — NOT
real prod secrets. Real secrets + DNS + VPS deploy remain operator tasks in infra/OPERATIONS.md.

## Prior task — ✅ Full audit (10 lenses + live E2E) + hardening + docs (2026-07-31)
Ran a ten-lens senior-engineer audit as 7 parallel agents (architecture/tech-lead, performance,
security, frontend, devops, bug-hunt, live Playwright) against a running seeded stack. Deliverables
were `AUDIT-2026-07-31.md` (unified ranked findings + fixed-vs-planned + 6-phase master plan),
`PRODUCT.md`, `USER-MANUAL.md` — **all since consolidated into README.md and the docs/ folder removed
(2026-08-03)**. Deploy drafts (CI/backup/monitoring) in `infra/deploy-drafts/`.
Top corroborated findings: SSE DB-connection leak (Critical, 2 agents), quota TOCTOU (2 agents),
`manually_assigned` survives settlement (a bug in the prior plan-controls slice).
**Applied + verified fixes** (commits 1d4aa2d backend, a451246 frontend, 029a548 docs — pushed):
SSE session release, settlement normalizes manually_assigned, daily-quota block-partial, SSRF-safe
PDF url_fetcher, password-reset revokes sessions, signup/forgot rate limits, billing/notif role
guards, hot-path index migration (e9a3c5b7d1f2); FE admin-layout auth guard, 3 legal-consent pages,
error/not-found boundaries, amber impersonation banner, email lowercase, autocomplete, removed fake
admin badges. **99 backend tests pass** (+5), tsc clean. Live "stalled dispatch" was env-only (worker
wasn't running — dispatch is correct). NOT-yet-done work was the phased plan in the (now-removed) audit doc
(Phase 1 scale-hardening: quota atomic reserve, bulk-insert recipients, admin query scoping, API-key
fast lookup, auth cache; Phase 2 DLR/suppression; Phase 3 sec: jose→PyJWT, XSS, impersonation audit;
Phase 4 FE: React Query/dark-mode/shared ui; Phase 5 ops: CI/backups/Sentry). See [[bulkreach-audit-masterplan]].
**Phase 1 scale-hardening ✅ mostly DONE (aa4510a, 61c2a16 — pushed):** quota reserve-and-refund
(atomic INCRBY, closes monthly TOCTOU; obsolete Layer-3 pause removed), bulk-insert recipients,
account-scoped admin aggregates, SQL account_summary, cancel-inside-batch-loop. 100 backend tests.
Deferred by design: fast API-key lookup (feature unwired — 0 rows; note left in dependencies.py) +
auth-principal cache (conflicts with immediate-suspend invariant). Still open: trial-decrement
atomicity (bug M-1), list-map scoping (perf M1).
**Phase 2 DLR ingestion ✅ DONE (9765645 — pushed):** delivery-report webhooks
(/webhooks/dlr/{provider}: africastalking/mailgun[HMAC]/sendgrid/simulator) → real delivered/
bounced/undelivered/complained message states + campaign delivered/bounced counters (migration
f1a4c6e8b2d3); auto-suppression on hard bounce/complaint; per-account suppression list enforced in
materialise_and_queue + mgmt router; DLR-aware compute_stats. 108 tests. Remaining polish: inbound
STOP, frontend delivery UI. Next: Phase 3 security (jose→PyJWT, XSS) or Phase 5 ops (CI/backups).
**Phase 3 security ✅ mostly DONE (7cba573 backend, c1b24a9 frontend — pushed):** python-jose→PyJWT
(CVE-2024-33663/4; venv installed pyjwt 2.13, jose uninstalled), single-use reset token (pwf
fingerprint), impersonation audit-stamping (ContextVar → impersonated_by on every audit entry),
MoMo/Airtel unsigned webhook fail-closed in prod, archive log client_ip, upload filename sanitise,
DOMPurify managed-approve XSS. 109 tests, tsc clean. Deferred: access-token localStorage→in-memory
(C8), server-side impersonation read-only, aud/iss pin (C11). Next: Phase 5 ops (CI/backups/Sentry).

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
- GitHub Actions billing-locked (account) → CI workflow removed; gates are local, deploy manual.
  (Also affects the separate `bododesderio/ForUs` repo — remove its workflows there.)
- `.env.production` is local-only generated secrets, not real prod values.

## Next steps (2026-08-01)
All 6 audit phases done + merged to `main`; prod Docker stack builds & runs healthy. Post-phase polish
also done: `next lint` clean, DLR delivered/bounced in the campaign UI, inbound-SMS STOP/START opt-out+
opt-in, all inline status maps on StatusBadge, dead `paused_quota_exceeded` removed.

Only remaining is **operator/VPS** (infra/OPERATIONS.md): resolve GitHub billing; set real
`.env.production` secrets + DNS; deploy to the VPS; install the nightly backup cron + rehearse a
restore; bring up monitoring; add swap.

Deliberately NOT doing (decided 2026-08-01): managed-portal keeps its bespoke chrome (the nav-rail
AppShell would look out of place on a 3-route client portal); the ~40 function-local import cycles
are left as-is (pure hygiene, real regression risk, no functional gain).

Rebuild/run the local stack:
  docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
Local gates: `cd backend && source .venv/bin/activate && pytest tests/ -q` · `cd frontend && npm ci && npm run typecheck && NODE_ENV=production npm run build`
