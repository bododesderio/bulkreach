"""Pesapal API 3.0 adapter (aggregator: MoMo + Airtel + card, East Africa).

Flow: RequestToken (5-min bearer) → SubmitOrderRequest (needs a registered IPN
id) → redirect customer to `redirect_url` → Pesapal hits our IPN + we call
GetTransactionStatus for the authoritative result. Pesapal IPNs carry no
signature and no status, only an order id, so every reconciliation goes through
GetTransactionStatus (needs_verify=True).
"""
from __future__ import annotations

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

_HOSTS = {
    "test": "https://cybqa.pesapal.com/pesapalv3",
    "live": "https://pay.pesapal.com/v3",
}
_TIMEOUT = httpx.Timeout(20.0)


def _map_status(desc: str | None, code: int | str | None = None) -> str:
    s = (desc or "").lower()
    if s == "completed" or str(code) == "1":
        return SUCCESSFUL
    if s in ("failed", "invalid", "reversed") or str(code) == "2":
        return FAILED
    return PENDING


class PesapalProvider(PaymentProvider):
    slug = "pesapal"
    display_name = "Pesapal"
    supported_methods = ("mtn_momo", "airtel_money", "card")
    credential_fields = (
        CredentialField("consumer_key", "Consumer Key", secret=True),
        CredentialField("consumer_secret", "Consumer Secret", secret=True),
        CredentialField(
            "ipn_id", "Registered IPN ID", secret=False, required=False,
            placeholder="auto-registered on first charge",
        ),
    )

    @property
    def _base(self) -> str:
        return _HOSTS["live" if self.is_live else "test"]

    async def _token(self, client: httpx.AsyncClient) -> str:
        resp = await client.post(
            f"{self._base}/api/Auth/RequestToken",
            json={
                "consumer_key": self.cred("consumer_key"),
                "consumer_secret": self.cred("consumer_secret"),
            },
            headers={"Accept": "application/json"},
        )
        return (resp.json() or {}).get("token", "")

    async def _ensure_ipn(self, client: httpx.AsyncClient, token: str, callback_url: str) -> str:
        ipn = self.cred("ipn_id")
        if ipn:
            return ipn
        resp = await client.post(
            f"{self._base}/api/URLSetup/RegisterIPN",
            json={"url": callback_url, "ipn_notification_type": "POST"},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        return (resp.json() or {}).get("ipn_id", "")

    async def create_charge(
        self, *, tx_ref, amount, currency, method, customer, callback_url,
    ) -> ChargeResult:
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                token = await self._token(client)
                if not token:
                    return ChargeResult(ok=False, status=FAILED, error="pesapal: auth failed")
                ipn_id = await self._ensure_ipn(client, token, callback_url)
                order = {
                    "id": tx_ref,
                    "currency": currency,
                    "amount": float(amount),
                    "description": "BulkReach payment",
                    "callback_url": callback_url,
                    "notification_id": ipn_id,
                    "billing_address": {
                        "email_address": customer.email,
                        "phone_number": customer.phone,
                        "first_name": customer.name or customer.email,
                    },
                }
                resp = await client.post(
                    f"{self._base}/api/Transactions/SubmitOrderRequest",
                    json=order,
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                )
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            return ChargeResult(ok=False, status=FAILED, error=f"pesapal: {exc}")
        redirect = data.get("redirect_url")
        order_id = data.get("order_tracking_id")
        if not redirect or not order_id:
            return ChargeResult(ok=False, status=FAILED, raw=data, error="pesapal: no redirect")
        return ChargeResult(
            ok=True, status=PENDING, redirect_url=redirect, provider_tx_id=order_id, raw=data
        )

    async def verify(self, *, tx_ref, provider_tx_id) -> VerifyResult:
        if not provider_tx_id:
            return VerifyResult(status=PENDING, raw={"error": "no order_tracking_id"})
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                token = await self._token(client)
                resp = await client.get(
                    f"{self._base}/api/Transactions/GetTransactionStatus",
                    params={"orderTrackingId": provider_tx_id},
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                )
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            return VerifyResult(status=PENDING, raw={"error": str(exc)})
        return VerifyResult(
            status=_map_status(data.get("payment_status_description"), data.get("status_code")),
            amount=data.get("amount"),
            currency=data.get("currency"),
            provider_tx_id=provider_tx_id,
            raw=data,
        )

    def verify_webhook_signature(self, *, headers, raw_body: bytes) -> bool:
        # Pesapal IPNs carry no signature by design. Safe because the service never
        # trusts the IPN body — it always fetches authoritative status via
        # GetTransactionStatus (verify), keyed on our stored order_tracking_id.
        return True

    def parse_webhook(self, payload: dict) -> WebhookResult:
        # IPN body: {OrderTrackingId, OrderMerchantReference, OrderNotificationType}
        return WebhookResult(
            tx_ref=payload.get("OrderMerchantReference") or payload.get("orderMerchantReference"),
            status=PENDING,
            provider_tx_id=payload.get("OrderTrackingId") or payload.get("orderTrackingId"),
            raw=payload,
            needs_verify=True,
        )
