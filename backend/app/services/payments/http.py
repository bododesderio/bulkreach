"""Resilient HTTP for provider calls — retry with exponential backoff.

Payment gateways occasionally return transient 5xx / drop connections; a single
blip should not fail a checkout. GET/verify/status calls are safely retryable.
POST charge/refund calls carry OUR idempotency key (tx_ref / X-Reference-Id), so
a retried create is de-duplicated provider-side — but we only auto-retry POSTs on
connect/timeout errors (request never landed), never on a 5xx response (may have
landed), to avoid the small double-submit risk.
"""
from __future__ import annotations

import asyncio
import logging

import httpx

log = logging.getLogger("bulkreach.payments.http")

DEFAULT_TIMEOUT = httpx.Timeout(20.0)
_CONNECT_ERRORS = (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout,
                   httpx.PoolTimeout, httpx.NetworkError)


async def request_with_retry(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    retries: int = 3,
    base_delay: float = 0.5,
    retry_on_5xx: bool = True,
    **kwargs,
) -> httpx.Response:
    """Issue an HTTP request, retrying transient failures with exp backoff.

    retry_on_5xx=False for non-idempotent POSTs (charge/refund) so a 5xx that may
    have been applied isn't blindly re-sent."""
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            resp = await client.request(method, url, **kwargs)
        except _CONNECT_ERRORS as exc:
            last_exc = exc
            log.warning("payments http %s %s connect-retry %d/%d: %s",
                        method, _host(url), attempt + 1, retries, type(exc).__name__)
        else:
            if retry_on_5xx and resp.status_code >= 500 and attempt < retries - 1:
                log.warning("payments http %s %s 5xx-retry %d/%d",
                            method, _host(url), attempt + 1, retries)
            else:
                return resp
        if attempt < retries - 1:
            await asyncio.sleep(base_delay * (2 ** attempt))
    if last_exc is not None:
        raise last_exc
    # Exhausted retries on 5xx — return the last response for the caller to handle.
    return resp


def _host(url: str) -> str:
    try:
        return httpx.URL(url).host
    except Exception:  # noqa: BLE001
        return "?"
