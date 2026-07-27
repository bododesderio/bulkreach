"""Redis-backed message quota counters (Section K).

Two counters per account, incremented once per message actually dispatched:
  quota:monthly:{account_id}:{YYYY-MM}   → resets at the start of next EAT month
  quota:daily:{account_id}:{YYYY-MM-DD}  → resets at the next EAT midnight

Counts are the source of truth for "used this period"; plan limits live on the
Plan. All boundaries are East Africa Time (UTC+3), matching the business."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.redis import redis

EAT = timezone(timedelta(hours=3))


def _now() -> datetime:
    return datetime.now(EAT)


def _month_key(account_id: UUID | str) -> str:
    return f"quota:monthly:{account_id}:{_now():%Y-%m}"


def _day_key(account_id: UUID | str) -> str:
    return f"quota:daily:{account_id}:{_now():%Y-%m-%d}"


def month_reset_at() -> datetime:
    n = _now()
    return (n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            + timedelta(days=32)).replace(day=1)


def day_reset_at() -> datetime:
    n = _now()
    return n.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)


async def get_monthly_used(account_id: UUID | str) -> int:
    return int(await redis.get(_month_key(account_id)) or 0)


async def get_daily_used(account_id: UUID | str) -> int:
    return int(await redis.get(_day_key(account_id)) or 0)


async def consume(account_id: UUID | str, n: int) -> None:
    """Record `n` dispatched messages against both counters, (re)setting each
    key's TTL to the end of its period so stale counters expire on their own."""
    if n <= 0:
        return
    now = _now()
    mkey, dkey = _month_key(account_id), _day_key(account_id)
    month_ttl = int((month_reset_at() - now).total_seconds())
    day_ttl = int((day_reset_at() - now).total_seconds())
    pipe = redis.pipeline()
    pipe.incrby(mkey, n)
    pipe.expire(mkey, max(month_ttl, 60))
    pipe.incrby(dkey, n)
    pipe.expire(dkey, max(day_ttl, 60))
    await pipe.execute()
