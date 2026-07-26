"""In-process OAuth/bearer token cache with automatic refresh.

Providers are re-instantiated per request, so a token cached on the instance
wouldn't survive. This module-level cache keys tokens by (provider slug + mode +
a hash of the credentials) and refreshes a few seconds before expiry. A per-key
asyncio lock collapses concurrent refreshes into one network call.

Never log token values. The key hashes the secret so nothing sensitive is stored
as a lookup key.
"""
from __future__ import annotations

import asyncio
import hashlib
import time
from typing import Awaitable, Callable

# key -> (token, expires_at_monotonic)
_store: dict[str, tuple[str, float]] = {}
_locks: dict[str, asyncio.Lock] = {}


def make_key(slug: str, mode: str, *secret_parts: str) -> str:
    digest = hashlib.sha256("::".join(secret_parts).encode()).hexdigest()[:16]
    return f"{slug}:{mode}:{digest}"


def _lock(key: str) -> asyncio.Lock:
    lock = _locks.get(key)
    if lock is None:
        lock = _locks[key] = asyncio.Lock()
    return lock


async def get_token(
    key: str,
    fetch: Callable[[], Awaitable[tuple[str, float]]],
    *,
    skew: float = 30.0,
) -> str:
    """Return a cached token or fetch a fresh one.

    `fetch` returns (token, ttl_seconds). The token is treated as expired `skew`
    seconds early so it's never used right at the edge of its lifetime."""
    now = time.monotonic()
    cached = _store.get(key)
    if cached and cached[1] - skew > now:
        return cached[0]
    async with _lock(key):
        # Re-check: another coroutine may have refreshed while we waited.
        cached = _store.get(key)
        now = time.monotonic()
        if cached and cached[1] - skew > now:
            return cached[0]
        token, ttl = await fetch()
        if token:
            _store[key] = (token, time.monotonic() + max(ttl, 1.0))
        return token


def invalidate(key: str) -> None:
    _store.pop(key, None)
