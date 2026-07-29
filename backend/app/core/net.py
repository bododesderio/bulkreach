# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Trusted client-IP derivation.

`X-Forwarded-For` is client-controlled: anything to the left of the entries our
own reverse proxies appended is attacker-supplied and must never be trusted for
rate-limiting or audit. We trust exactly `TRUSTED_PROXY_COUNT` hops — the number
of reverse proxies we run in front of the app (e.g. one nginx → 1). The real
client is then the `n`-th entry from the right of XFF; anything shorter than the
trusted-hop count means the header was forged, so we fall back to the TCP peer.

Set `TRUSTED_PROXY_COUNT=0` when the app is reached directly (dev) — XFF is then
ignored entirely and the TCP peer is authoritative.
"""
from __future__ import annotations

from fastapi import Request

from app.core.config import settings


def client_ip(request: Request | None) -> str | None:
    """The real client IP, honouring only `TRUSTED_PROXY_COUNT` proxy hops."""
    if request is None:
        return None
    peer = request.client.host if request.client else None
    n = settings.TRUSTED_PROXY_COUNT
    if n <= 0:
        return peer  # no trusted proxy → the TCP peer is the client; ignore XFF
    parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    if len(parts) >= n:
        return parts[-n]  # the n-th from the right was appended by our outermost proxy
    return peer  # header shorter than the trusted-hop count → forged; don't trust it
