"""Shared async Redis client and a sliding-window rate limiter (Section 13.4)."""
from __future__ import annotations

import time

from redis.asyncio import Redis, from_url

from app.core.config import settings

redis: Redis = from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)


async def sliding_window_allow(key: str, max_hits: int, window_seconds: int) -> bool:
    """Return True if the action is allowed, recording this hit.

    Uses a sorted set keyed by timestamp — the canonical Redis sliding window.
    """
    now = time.time()
    cutoff = now - window_seconds
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, cutoff)
    pipe.zadd(key, {f"{now}:{time.monotonic_ns()}": now})
    pipe.zcard(key)
    pipe.expire(key, window_seconds)
    _, _, count, _ = await pipe.execute()
    return count <= max_hits
