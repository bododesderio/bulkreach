"""Labelled simulator provider — dev/testing only, no real money moves.

Mirrors the dispatch simulator pattern: when no real gateway is configured (or
DISPATCH_FORCE_SIMULATOR-style dev), the whole checkout → redirect → verify loop
still works end-to-end. It redirects to our own callback URL with a marker and
reports success on verify. Never selectable as a live method in production UI.
"""
from __future__ import annotations

from app.services.payments.base import (
    SUCCESSFUL,
    ChargeResult,
    Customer,
    PaymentProvider,
    RefundResult,
    VerifyResult,
    WebhookResult,
)


class SimulatorProvider(PaymentProvider):
    slug = "simulator"
    display_name = "Simulator (dev)"
    supported_methods = ("mtn_momo", "airtel_money", "card")
    credential_fields = ()

    async def create_charge(
        self, *, tx_ref, amount, currency, method, customer, callback_url,
    ) -> ChargeResult:
        sep = "&" if "?" in callback_url else "?"
        link = f"{callback_url}{sep}tx_ref={tx_ref}&simulated=success"
        return ChargeResult(ok=True, status="pending", redirect_url=link, provider_tx_id=tx_ref)

    async def verify(self, *, tx_ref, provider_tx_id) -> VerifyResult:
        # amount None → service skips the amount-match assertion for the simulator.
        return VerifyResult(status=SUCCESSFUL, amount=None, currency="UGX", provider_tx_id=tx_ref)

    async def refund(self, *, tx_ref, provider_tx_id, amount, currency, reason) -> RefundResult:
        return RefundResult(ok=True, provider_refund_id=f"sim-refund-{tx_ref[-8:]}")

    def verify_webhook_signature(self, *, headers, raw_body: bytes) -> bool:
        return True  # dev-only provider; never reachable in production

    def parse_webhook(self, payload: dict) -> WebhookResult:
        return WebhookResult(
            tx_ref=payload.get("tx_ref"), status=SUCCESSFUL, needs_verify=True, raw=payload
        )
