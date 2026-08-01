# BulkReach — operations runbook

Day-2 operations for the production stack on the shared-Traefik VPS
(`195.110.59.36`, `srv1806304.hstgr.cloud`). For first-time edge/DNS/Basic-Auth
setup see [`DEPLOY-TRAEFIK.md`](./DEPLOY-TRAEFIK.md). This document covers deploy,
CI, backups, monitoring, health checks, and host hardening.

All commands run from `/opt/bulkreach` on the VPS as the `deploy` user unless noted.

## 1. First deploy / redeploy

```bash
cd /opt/bulkreach
git fetch --all --prune
git checkout -B main origin/main         # correct branch + upstream (see DEPLOY-TRAEFIK gotchas)
git reset --hard origin/main
git log --oneline -1                     # confirm the new commit actually landed

cp .env.production.example .env.production   # first time only — then fill in secrets
# Required in .env.production: SECRET_KEY, PAYMENTS_ENCRYPTION_KEY, POSTGRES_PASSWORD,
# MINIO_ROOT_USER/PASSWORD, ADMIN_BASICAUTH, DOCS_BASICAUTH (see DEPLOY-TRAEFIK §3).

# Build one service at a time — the small VPS OOMs if api/worker/web build together.
for svc in api worker web; do
  docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build "$svc"
done
# Bring up any datastores that aren't already running.
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker image prune -f
```

`--env-file` is mandatory — compose only auto-loads a file literally named `.env`.
The `api` container runs Alembic migrations on start (`backend/entrypoint.prod.sh`);
`worker` has `RUN_MIGRATIONS=0` so migrations run exactly once.

Verify:

```bash
curl -fsS https://api.bulkreach.ug/health         # liveness  → 200
curl -fsS https://api.bulkreach.ug/health/ready    # readiness → 200 (503 if a datastore is down)
curl -sS -o /dev/null -w "web → %{http_code}\n" https://bulkreach.ug/
```

## 2. CI / deploy

There is **no GitHub Actions workflow** — it was removed because GitHub Actions
is billing-locked on this account (every run failed and spammed "run failed"
emails). Run the same gates locally before pushing, and deploy manually:

```bash
# gates (mirror what a CI would run)
cd backend  && source .venv/bin/activate && python -m pytest tests/ -q      # 112 tests
cd frontend && npm ci && npm run typecheck && NODE_ENV=production npm run build

# deploy (from the VPS, /opt/bulkreach)
git fetch --all --prune && git reset --hard origin/main
for svc in api worker web; do
  docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build "$svc"
done
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
curl -fsS https://api.bulkreach.ug/health/ready     # smoke test
```

If Actions billing is restored later, a CI workflow can be re-added under
`.github/workflows/`; keep the same gate commands above.

## 3. Backups

`scripts/backup.sh` dumps Postgres (live + archive via `pg_dumpall`), ClickHouse
(per-table `Native` dumps), and MinIO (bucket mirror) to `/opt/bulkreach-backups`,
then prunes anything older than `BACKUP_KEEP_DAYS` (default **14 days**).

Nightly cron (as the `deploy` user):

```cron
15 2 * * *  cd /opt/bulkreach && ./scripts/backup.sh >> /var/log/bulkreach-backup.log 2>&1
```

Artifacts per run (`STAMP` = UTC `YYYYMMDD-HHMMSS`):

- `pg-STAMP.sql.gz` — all Postgres DBs + roles
- `ch-TABLE-STAMP.native.gz` — one file per ClickHouse table
- `minio-STAMP/` — mirror of all MinIO buckets

Off-site copy is strongly recommended: set `OFFSITE_S3_BUCKET` and uncomment the
`aws s3 sync` line in the script to push `/opt/bulkreach-backups` to real S3/B2 with
lifecycle rules.

### Monthly restore drill

Backups you never restore are not backups. Rehearse monthly against a scratch target
(`cid` resolves a running container id; run the helper or substitute container ids):

```bash
cid() { docker compose --env-file .env.production -f docker-compose.prod.yml ps -q "$1"; }

# Postgres — restores every DB + roles.
gunzip -c pg-STAMP.sql.gz | docker exec -i "$(cid postgres)" psql -U bulkreach

# ClickHouse — one table at a time.
gunzip -c ch-TABLE-STAMP.native.gz | \
  docker exec -i "$(cid clickhouse)" clickhouse-client \
    --query="INSERT INTO bulkreach.TABLE FORMAT Native"

# MinIO — mirror the dated dir back into the buckets.
docker run --rm --network bulkreach-prod_internal \
  -v /opt/bulkreach-backups:/backup --entrypoint sh minio/mc -c "
    mc alias set br http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null &&
    mc mirror /backup/minio-STAMP/ br/
  "
```

Confirm row counts / object counts after each restore, then discard the scratch data.

## 4. Monitoring

Uptime-Kuma runs as a single ~256 MB container routed through the **same** shared
Traefik edge on `status.bulkreach.ug` (Basic-Auth gated, reusing the
`bulkreach-admin-auth` middleware). Its data persists in the `kuma` volume.

Bring it up (from `/opt/bulkreach`):

```bash
docker compose --env-file .env.production -f infra/monitoring/docker-compose.monitoring.yml up -d
```

Add an A record `status → 195.110.59.36`, then configure inside the UI:

| Monitor | Target | Type |
| --- | --- | --- |
| API readiness | `https://api.bulkreach.ug/health/ready` | HTTP keyword `ok`, 60s |
| Web | `https://bulkreach.ug/` | HTTP 200, 60s |
| Worker heartbeat | Kuma **Push** monitor — an ARQ cron curls the push URL each minute | push |

The ARQ worker has no HTTP port, so a push heartbeat is the best signal that crons
actually run — if the beat stops, Kuma alerts. Set notifications (email/Telegram) to
fire after 2 consecutive failures. The public status page lives at
`https://status.bulkreach.ug`.

## 5. Health endpoints

| Endpoint | Meaning | Use |
| --- | --- | --- |
| `GET /health` | **liveness** — process is up | container/orchestrator restarts |
| `GET /health/ready` | **readiness** — pings Postgres + Redis; **503** if either is down | CI smoke test, Uptime-Kuma, load-balancer gating |

Use `/health/ready` (not `/health`) anywhere you need to know the app can actually
serve traffic — a live process with a dead datastore returns 503 on `/ready`.

## 6. VPS host hardening

The VPS is small (2 vCPU). Every service already has a `mem_limit` in
`docker-compose.prod.yml` (postgres 1g, clickhouse 1536m, api 768m, minio 512m,
redis 256m, worker 512m, web 512m) so no single container can starve the host. Note
that `mem_limit` does **not** cap the build step — that is why deploys build one
service at a time.

Add swap so a build spike or memory pressure can't OOM-kill running containers:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # persist across reboot
sudo sysctl -w vm.swappiness=10                              # prefer RAM, swap only under pressure
```

Verify with `free -h` and `swapon --show`.
