"""Live campaign progress in Redis — written by the dispatch engine, streamed
to the client over SSE (GET /campaigns/{id}/progress). Section 3.3 / 6.x."""
from __future__ import annotations

import json
import time
from uuid import UUID

from app.core.redis import redis

_TTL_SECONDS = 60 * 60 * 6  # keep progress readable for 6h after completion


def _key(campaign_id: UUID | str) -> str:
    return f"campaign:{campaign_id}:progress"


async def write(
    campaign_id: UUID | str,
    *,
    status: str,
    total: int,
    sent: int,
    failed: int,
    sms_sent: int = 0,
    sms_failed: int = 0,
    email_sent: int = 0,
    email_failed: int = 0,
) -> dict:
    processed = sent + failed
    pct = round(processed / total * 100, 1) if total else 100.0
    payload = {
        "status": status,
        "total": total,
        "sent": sent,
        "failed": failed,
        "pending": max(0, total - processed),
        "sms_sent": sms_sent,
        "sms_failed": sms_failed,
        "email_sent": email_sent,
        "email_failed": email_failed,
        "pct": pct,
        "updated_at": time.time(),
    }
    await redis.set(_key(campaign_id), json.dumps(payload), ex=_TTL_SECONDS)
    return payload


async def read(campaign_id: UUID | str) -> dict | None:
    raw = await redis.get(_key(campaign_id))
    return json.loads(raw) if raw else None


async def clear(campaign_id: UUID | str) -> None:
    await redis.delete(_key(campaign_id))
