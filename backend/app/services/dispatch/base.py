"""Dispatch provider contracts + shared HTTP client (Section 2.3, 3.3).

Every SMS/email provider implements the same tiny async interface so the engine
stays provider-agnostic. Providers are *functional the moment their keys are set*;
until then `configured` is False and the engine selects the labelled simulator
(non-prod) so the whole pipeline is verifiable without real credentials.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import httpx

_client: httpx.AsyncClient | None = None


def http() -> httpx.AsyncClient:
    """Lazily-created shared async HTTP client, reused across sends."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0))
    return _client


async def close_http() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


@dataclass(slots=True)
class SendResult:
    ok: bool
    provider: str
    provider_message_id: str | None = None
    error: str | None = None
    retriable: bool = True  # transient send failures retry; render errors do not


@runtime_checkable
class SmsProvider(Protocol):
    name: str

    @property
    def configured(self) -> bool: ...

    async def send(self, *, to: str, body: str, sender_id: str | None = None) -> SendResult: ...


@runtime_checkable
class EmailProvider(Protocol):
    name: str

    @property
    def configured(self) -> bool: ...

    async def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        plain: str | None,
        from_email: str,
        from_name: str,
    ) -> SendResult: ...
