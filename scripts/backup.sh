#!/usr/bin/env bash
# BulkReach nightly backup — Postgres (live + archive), ClickHouse, MinIO.
# Run from /opt/bulkreach on the VPS. Reads .env.production for creds.
# Cron (as the deploy user):
#   15 2 * * *  cd /opt/bulkreach && ./scripts/backup.sh >> /var/log/bulkreach-backup.log 2>&1
#
# Restores are the point of backups: test one monthly (see restore notes at the end).
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env.production; set +a

STAMP="$(date -u +%Y%m%d-%H%M%S)"
DEST="/opt/bulkreach-backups"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
PROJECT="bulkreach-prod"          # compose `name:`
mkdir -p "$DEST"

cid() { docker compose --env-file .env.production -f docker-compose.prod.yml ps -q "$1"; }

echo "[backup $STAMP] postgres (live + archive)…"
# pg_dumpall captures both bulkreach and bulkreach_archive (same instance) + roles.
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "$(cid postgres)" \
  pg_dumpall -U bulkreach | gzip > "$DEST/pg-$STAMP.sql.gz"

echo "[backup $STAMP] clickhouse…"
# Logical dump of the analytics DB (delivery_events etc.). For large tables,
# switch to `clickhouse-backup` or a FREEZE-based volume snapshot.
docker exec "$(cid clickhouse)" \
  clickhouse-client --query="SHOW TABLES FROM bulkreach" | while read -r t; do
    docker exec "$(cid clickhouse)" clickhouse-client \
      --query="SELECT * FROM bulkreach.$t FORMAT Native" | gzip \
      > "$DEST/ch-${t}-$STAMP.native.gz"
  done

echo "[backup $STAMP] minio (mirror the buckets)…"
# Uses the mc client sidecar. Mirrors all app buckets to a dated dir.
docker run --rm --network "${PROJECT}_internal" \
  -v "$DEST:/backup" --entrypoint sh minio/mc -c "
    mc alias set br http://minio:9000 '${MINIO_ROOT_USER}' '${MINIO_ROOT_PASSWORD}' >/dev/null &&
    mc mirror --overwrite --remove br/ /backup/minio-$STAMP/ || true
  "

echo "[backup $STAMP] pruning backups older than ${KEEP_DAYS}d…"
find "$DEST" -maxdepth 1 -name 'pg-*.sql.gz'   -mtime "+$KEEP_DAYS" -delete
find "$DEST" -maxdepth 1 -name 'ch-*.native.gz' -mtime "+$KEEP_DAYS" -delete
find "$DEST" -maxdepth 1 -type d -name 'minio-*' -mtime "+$KEEP_DAYS" -exec rm -rf {} +

# OFF-SITE (strongly recommended): push $DEST to real S3/B2 with lifecycle rules.
#   [ -n "${OFFSITE_S3_BUCKET:-}" ] && aws s3 sync "$DEST" "s3://$OFFSITE_S3_BUCKET/bulkreach/"

echo "[backup $STAMP] done. Newest artifacts:"
ls -lh "$DEST" | tail -n 5

# ── Restore (rehearse monthly) ────────────────────────────────────────────────
# Postgres:  gunzip -c pg-STAMP.sql.gz | docker exec -i $(cid postgres) psql -U bulkreach
# ClickHouse: gunzip -c ch-TABLE-STAMP.native.gz | \
#   docker exec -i $(cid clickhouse) clickhouse-client --query="INSERT INTO bulkreach.TABLE FORMAT Native"
# MinIO:     mc mirror /backup/minio-STAMP/ br/
