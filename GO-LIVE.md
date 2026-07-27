# BulkReach — Go-Live Runbook

End-to-end steps to take the built platform to production. Assumes a Linux VPS
with Docker + Docker Compose and a domain you control.

## 1. Provision
- [ ] VPS (≥2 vCPU / 4 GB for the app + Postgres + ClickHouse; more if ClickHouse grows).
- [ ] DNS A record: `app.bulkreach.ug` → VPS IP.
- [ ] Open ports 80/443 only; keep datastore ports internal (the prod compose does this).

## 2. Configure
- [ ] `cp .env.production.example .env.production` and fill every value.
- [ ] Generate `SECRET_KEY`, `PAYMENTS_ENCRYPTION_KEY`, `ANON_PEPPER` (see `SECRETS.md`).
- [ ] Set `FRONTEND_URL` and `PAYMENTS_CALLBACK_BASE_URL` to the real HTTPS host.

## 3. Bring up
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
(`--env-file` is required — Compose only auto-loads a file named `.env`.)
- The `api` container runs Alembic migrations (live + archive) on start via `entrypoint.prod.sh`.
- Verify: `curl -f http://localhost:8080/api/v1/../health` (through nginx) and the web root.
- Create the first superadmin (one-off, inside the api container or via a seed script).

## 4. TLS
- [ ] Put a TLS terminator in front of nginx: Caddy/Traefik, or certbot + a 443 server
      block (mirror `infra/nginx.conf`, add `ssl_certificate*`, redirect 80→443, add HSTS).
- [ ] Or terminate TLS at Cloudflare and proxy to `:8080`.

## 5. Providers — KYC / live keys
Payments are entered by a superadmin in `/admin/settings/payments` (stored
Fernet-encrypted), then a method is routed to each provider.
- [ ] **Flutterwave**: complete business KYC → live Secret/Public keys + webhook hash;
      set webhook URL to `${PAYMENTS_CALLBACK_BASE_URL}/api/v1/payments/webhooks/flutterwave`.
- [ ] **Pesapal**: production consumer key/secret (the sandbox creds won't work live);
      register IPN URL.
- [ ] **MTN MoMo / Airtel Money**: complete the collections product KYC / go-live;
      switch each provider from test→live in the admin UI once approved.
- [ ] **Africa's Talking**: production username + API key, approved sender ID.
- [ ] **Mailgun**: verify the sending domain (SPF/DKIM), set SMTP creds.

## 6. Smoke test (through the live host)
- [ ] Sign up → dashboard loads with live data.
- [ ] Import contacts (CSV) → create + send a small campaign → SSE progress → report.
- [ ] Billing: choose a plan → complete a real (small) payment → history + subscription active.
- [ ] Superadmin: `/admin` KPIs, suspend/activate an account (confirm suspended user is logged out),
      managed workflow → issue report → PDF downloads, `/admin/health` all green.

## 7. Operations
- [ ] **Backups**: nightly `pg_dump` of `bulkreach` + `bulkreach_archive`; snapshot the MinIO/S3 bucket.
- [ ] **Restore drill**: prove a backup restores before you rely on it.
- [ ] **Archive lifecycle**: the worker runs nightly ingest (02:00) + retention (03:00);
      for real AWS Glacier tiering, attach an S3 lifecycle policy on the archive bucket.
- [ ] **Monitoring**: alert on the `/admin/health` degraded/down states and worker liveness.
- [ ] **Log/PII**: confirm audit + archive access logs are shipping; retention rules set per policy.
