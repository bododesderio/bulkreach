"""Payment provider abstraction — one adapter per gateway.

Every adapter is constructed from a DB-stored config (mode + decrypted
credentials) and implements a small, uniform surface the PaymentService drives:

    create_charge  → start a payment, return a redirect URL (or "pending" for
                     USSD-push flows with no redirect)
    verify         → authoritative server-side status poll (never trust client
                     or webhook status without this)
    parse_webhook  → extract (tx_ref, provider_tx_id, status) from a raw payload
    verify_webhook_signature → reject forged callbacks

Money is server-authoritative: adapters echo back the provider's amount/currency
so the service can assert they match the stored intent before crediting anything.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Mapping

# Uniform statuses across every provider.
PENDING = "pending"
SUCCESSFUL = "successful"
FAILED = "failed"
TIMEOUT = "timeout"


@dataclass(frozen=True)
class CredentialField:
    """Declares one credential input so the admin UI can render + we know which
    values are secret (encrypted at rest, masked on read)."""

    key: str
    label: str
    secret: bool = False
    required: bool = True
    placeholder: str = ""


@dataclass(frozen=True)
class Customer:
    email: str
    name: str = ""
    phone: str = ""


@dataclass
class ChargeResult:
    ok: bool
    status: str = PENDING  # pending|successful|failed
    redirect_url: str | None = None  # hosted checkout; None for USSD-push flows
    provider_tx_id: str | None = None
    raw: dict = field(default_factory=dict)
    error: str | None = None


@dataclass
class VerifyResult:
    status: str  # successful|failed|pending|timeout
    amount: float | None = None
    currency: str | None = None
    provider_tx_id: str | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class RefundResult:
    ok: bool
    provider_refund_id: str | None = None
    raw: dict = field(default_factory=dict)
    error: str | None = None


@dataclass
class WebhookResult:
    tx_ref: str | None
    status: str
    provider_tx_id: str | None = None
    amount: float | None = None
    currency: str | None = None
    raw: dict = field(default_factory=dict)
    # When True the service must re-poll verify() for authoritative status
    # (e.g. Pesapal IPN carries no status, only an order id).
    needs_verify: bool = False


class PaymentProvider(ABC):
    slug: str = ""
    display_name: str = ""
    supported_methods: tuple[str, ...] = ()
    credential_fields: tuple[CredentialField, ...] = ()

    def __init__(self, *, mode: str = "test", credentials: Mapping[str, str] | None = None):
        self.mode = mode if mode in ("test", "live") else "test"
        self.credentials: dict[str, str] = dict(credentials or {})

    @property
    def is_live(self) -> bool:
        return self.mode == "live"

    def cred(self, key: str, default: str = "") -> str:
        return self.credentials.get(key, default) or default

    @abstractmethod
    async def create_charge(
        self,
        *,
        tx_ref: str,
        amount: float,
        currency: str,
        method: str,
        customer: Customer,
        callback_url: str,
    ) -> ChargeResult: ...

    @abstractmethod
    async def verify(self, *, tx_ref: str, provider_tx_id: str | None) -> VerifyResult: ...

    def verify_webhook_signature(self, *, headers: Mapping[str, str], raw_body: bytes) -> bool:
        # Fail closed by default: a new provider must opt into how it authenticates
        # callbacks. Providers whose callbacks carry no signature (and are safe only
        # because the service re-verifies authoritatively via verify()) override this
        # explicitly with a documented rationale.
        return False

    async def refund(
        self, *, tx_ref: str, provider_tx_id: str | None, amount: float,
        currency: str, reason: str,
    ) -> "RefundResult":
        # Default: provider hasn't implemented refunds.
        return RefundResult(ok=False, error=f"{self.slug}: refunds not supported")

    @abstractmethod
    def parse_webhook(self, payload: dict) -> WebhookResult: ...
