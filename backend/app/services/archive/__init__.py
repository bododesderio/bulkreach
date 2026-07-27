"""Archive subsystem service (Sections 19-23): governance over the separate
archive database — ingestion, retention/purge, anonymisation, erasure, legal
holds, append-only access log, stats and export.

ClickHouse 7-year TTL analytics and real AWS Glacier storage-class transitions
are infra-gated: those code paths degrade to a logged no-op when the services
are not configured. Everything backed by the archive Postgres DB is real and
exercised."""
from app.services.archive.service import archive_service

__all__ = ["archive_service"]
