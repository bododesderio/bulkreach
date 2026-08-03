# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
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


async def reserve(account_id: UUID | str, n: int) -> tuple[int, int]:
    """Atomically add `n` to both counters (with TTL) and return the NEW
    (monthly_used, daily_used). Reserving up-front — instead of a read-then-check —
    closes the TOCTOU where concurrent sends each read a stale `used` and overspend.
    The caller validates the returned totals against the plan limits and calls
    `release` to roll the reservation back on rejection or for messages that don't
    ultimately send."""
    if n <= 0:
        return await get_monthly_used(account_id), await get_daily_used(account_id)
    now = _now()
    mkey, dkey = _month_key(account_id), _day_key(account_id)
    month_ttl = int((month_reset_at() - now).total_seconds())
    day_ttl = int((day_reset_at() - now).total_seconds())
    pipe = redis.pipeline()
    pipe.incrby(mkey, n)
    pipe.expire(mkey, max(month_ttl, 60))
    pipe.incrby(dkey, n)
    pipe.expire(dkey, max(day_ttl, 60))
    res = await pipe.execute()
    return int(res[0]), int(res[2])


# Decrement each key by n, clamping at 0 so an over-release (double refund, or a
# refund after a manual consume) can never drive a counter negative — a negative
# `used` would corrupt quota_state / threshold math. KEEPTTL preserves the reset.
_RELEASE_LUA = """
for i = 1, #KEYS do
  local v = redis.call('DECRBY', KEYS[i], ARGV[1])
  if v < 0 then redis.call('SET', KEYS[i], 0, 'KEEPTTL') end
end
return 1
"""


async def release(account_id: UUID | str, n: int) -> None:
    """Roll back a reservation of `n` messages on both counters, floored at 0."""
    if n <= 0:
        return
    await redis.eval(_RELEASE_LUA, 2, _month_key(account_id), _day_key(account_id), n)
