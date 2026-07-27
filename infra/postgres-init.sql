-- Runs once on first Postgres init (docker-entrypoint-initdb.d). The primary
-- DB (bulkreach) is created by POSTGRES_DB; the archive subsystem uses a second
-- database in the same instance (Section 18.2). Alembic then builds the schemas.
SELECT 'CREATE DATABASE bulkreach_archive OWNER bulkreach'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'bulkreach_archive')\gexec
