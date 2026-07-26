"""Flutterwave v3 adapter (aggregator: MoMo + Airtel + card).

Flow: create a Standard charge → redirect customer to the hosted `data.link` →
customer pays → we reconcile with GET /transactions/{id}/verify. Webhooks are
authenticated by the `verif-hash` header equalling the dashboard secret hash.
Same base URL for test/live; the mode is expressed purely by which secret key is
configured, so we don't branch on host.
"""
from __future__ import annotations

import hmac
from typing import Mapping

import httpx

from app.services.payments.base import (
    FAILED,
    PENDING,
    SUCCESSFUL,
    ChargeResult,
    CredentialField,
    Customer,
    PaymentProvider,
    VerifyResult,
    WebhookResult,
)

_BASE = "https://api.flutterwave.com/v3"
_TIMEOUT = httpx.Timeout(20.0)

# Flutterwave payment_options per BulkReach method.
_METHOD_OPTIONS = {
    "mtn_momo": "mobilemoneyuganda",
    "airtel_money": "mobilemoneyuganda",
    "card": "card",
}


def _map_status(raw: str | None) -> str:
    s = (raw or "").lower()
    if s in ("successful", "success", "completed"):
        return SUCCESSFUL
    if s in ("failed", "cancelled", "error"):
        return FAILED
    return PENDING


class FlutterwaveProvider(PaymentProvider):
    slug = "flutterwave"
    display_name = "Flutterwave"
    supported_methods = ("mtn_momo", "airtel_money", "card")
    credential_fields = (
        CredentialField("public_key", "Public Key", secret=False, placeholder="FLWPUBK…"),
        CredentialField("secret_key", "Secret Key", secret=True, placeholder="FLWSECK…"),
        CredentialField(
            "webhook_secret", "Webhook Secret Hash", secret=True,
            required=False, placeholder="Settings → Webhooks",
        ),
    )

    def _auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.cred('secret_key')}"}

    async def create_charge(
        self, *, tx_ref, amount, currency, method, customer, callback_url,
    ) -> ChargeResult:
        payload = {
            "tx_ref": tx_ref,
            "amount": str(amount),
            "currency": currency,
            "redirect_url": callback_url,
            "payment_options": _METHOD_OPTIONS.get(method, "card"),
            "customer": {
                "email": customer.email,
                "phonenumber": customer.phone,
                "name": customer.name or customer.email,
            },
            "customizations": {"title": "BulkReach", "description": "BulkReach payment"},
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(f"{_BASE}/payments", json=payload, headers=self._auth())
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            return ChargeResult(ok=False, status=FAILED, error=f"flutterwave: {exc}")
        if resp.status_code >= 300 or data.get("status") != "success":
            return ChargeResult(ok=False, status=FAILED, raw=data, error=data.get("message"))
        link = (data.get("data") or {}).get("link")
        return ChargeResult(ok=bool(link), status=PENDING, redirect_url=link, raw=data)

    async def verify(self, *, tx_ref, provider_tx_id) -> VerifyResult:
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                if provider_tx_id:
                    resp = await client.get(
                        f"{_BASE}/transactions/{provider_tx_id}/verify", headers=self._auth()
                    )
                else:
                    resp = await client.get(
                        f"{_BASE}/transactions/verify_by_reference",
                        params={"tx_ref": tx_ref}, headers=self._auth(),
                    )
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            return VerifyResult(status=PENDING, raw={"error": str(exc)})
        d = data.get("data") or {}
        return VerifyResult(
            status=_map_status(d.get("status")),
            amount=d.get("amount"),
            currency=d.get("currency"),
            provider_tx_id=str(d.get("id")) if d.get("id") is not None else provider_tx_id,
            raw=data,
        )

    def verify_webhook_signature(self, *, headers: Mapping[str, str], raw_body: bytes) -> bool:
        secret = self.cred("webhook_secret")
        if not secret:
            return False  # fail closed — a webhook secret must be configured
        received = headers.get("verif-hash") or headers.get("Verif-Hash") or ""
        return hmac.compare_digest(received, secret)

    def parse_webhook(self, payload: dict) -> WebhookResult:
        d = payload.get("data") or payload
        return WebhookResult(
            tx_ref=d.get("tx_ref"),
            status=_map_status(d.get("status")),
            provider_tx_id=str(d.get("id")) if d.get("id") is not None else None,
            amount=d.get("amount"),
            currency=d.get("currency"),
            raw=payload,
            needs_verify=True,  # always re-verify server-side before crediting
        )
