"""ClickHouse analytics client (Section 20) — long-horizon delivery-event store
with a 7-year TTL. HTTP interface via clickhouse-connect (sync), wrapped in
threads for the async app.

All entry points are INFRA-GATED and fail soft: if ClickHouse is unreachable or
the driver is absent they return None/False/0 and log, so the archive subsystem
degrades gracefully rather than erroring when analytics storage isn't running."""
from __future__ import annotations

import asyncio
import logging

from app.core.config import settings

log = logging.getLogger("bulkreach.clickhouse")

_TABLE = "delivery_events"
_DDL = f"""
CREATE TABLE IF NOT EXISTS {_TABLE} (
    event_date   Date,
    sent_at      DateTime,
    account_id   UUID,
    campaign_id  UUID,
    channel      LowCardinality(String),
    status       LowCardinality(String),
    provider     LowCardinality(String),
    attempts     UInt8,
    recipient    String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (account_id, campaign_id, event_date)
TTL event_date + INTERVAL {settings.ARCHIVE_CLICKHOUSE_TTL_YEARS} YEAR
"""

_COLUMNS = ["event_date", "sent_at", "account_id", "campaign_id",
            "channel", "status", "provider", "attempts", "recipient"]


def _client():
    import clickhouse_connect  # lazy — optional dependency

    return clickhouse_connect.get_client(
        host=settings.CLICKHOUSE_HOST,
        port=settings.CLICKHOUSE_PORT,
        username=settings.CLICKHOUSE_USER,
        password=settings.CLICKHOUSE_PASSWORD,
        database=settings.CLICKHOUSE_DB,
        connect_timeout=3,
        send_receive_timeout=10,
    )


def _sync_ensure_schema() -> bool:
    c = _client()
    c.command(_DDL)
    return True


def _sync_insert(rows: list[list]) -> int:
    c = _client()
    c.command(_DDL)  # idempotent; guarantees the table exists
    c.insert(_TABLE, rows, column_names=_COLUMNS)
    return len(rows)


def _sync_count() -> int:
    c = _client()
    res = c.query(f"SELECT count() FROM {_TABLE}")
    return int(res.result_rows[0][0]) if res.result_rows else 0


def _sync_ping() -> bool:
    return bool(_client().ping())


async def ensure_schema() -> bool:
    try:
        return await asyncio.to_thread(_sync_ensure_schema)
    except Exception as exc:  # noqa: BLE001
        log.warning("clickhouse ensure_schema skipped (infra-gated): %s", exc)
        return False


async def insert_delivery_events(rows: list[list]) -> int:
    if not rows:
        return 0
    try:
        return await asyncio.to_thread(_sync_insert, rows)
    except Exception as exc:  # noqa: BLE001
        log.warning("clickhouse insert skipped (infra-gated): %s", exc)
        return 0


async def count_events() -> int | None:
    try:
        return await asyncio.to_thread(_sync_count)
    except Exception:  # noqa: BLE001
        return None


async def ping() -> bool:
    try:
        return await asyncio.to_thread(_sync_ping)
    except Exception:  # noqa: BLE001
        return False
