#!/usr/bin/env sh
# Release step: apply migrations to the live and archive databases, then hand
# off to the service command (api or worker). Only the api needs migrations,
# but running them is idempotent and safe for either role. Set RUN_MIGRATIONS=0
# to skip (e.g. on the worker once the api has migrated).
set -e

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "[entrypoint] alembic upgrade head (live)…"
  alembic upgrade head
  echo "[entrypoint] alembic upgrade head (archive)…"
  alembic -c alembic_archive.ini upgrade head
else
  echo "[entrypoint] RUN_MIGRATIONS=0 — skipping migrations"
fi

echo "[entrypoint] starting: $*"
exec "$@"
