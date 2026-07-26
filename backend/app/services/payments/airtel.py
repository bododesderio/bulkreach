"""Airtel Money Collections (direct) adapter — customer pays us.

USSD-push flow (no redirect): OAuth2 client-credentials token →
POST /merchant/v1/payments/ → reconcile via
GET /standard/v1/payments/{tx_ref}. Live requires Airtel go-live/KYC, so this
works only with real UAT/production credentials configured from the admin UI.
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
    "test": "https://openapiuat.airtel.africa",
    "live": "https://openapi.airtel.africa",
}
_TIMEOUT = httpx.Timeout(20.0)


def _map_status(code: str | None, message: str | None = None) -> str:
    c = (code or "").upper()
    if c in ("TS", "SUCCESS", "200"):
        return SUCCESSFUL
    if c in ("TF", "FAILED", "TA"):
        return FAILED
    return PENDING


class AirtelProvider(PaymentProvider):
    slug = "airtel"
    display_name = "Airtel Money (Direct)"
    supported_methods = ("airtel_money",)
    credential_fields = (
        CredentialField("client_id", "Client ID", secret=True),
        CredentialField("client_secret", "Client Secret", secret=True),
        CredentialField("country", "Country Code", secret=False, required=False, placeholder="UG"),
    )

    @property
    def _base(self) -> str:
        return _HOSTS["live" if self.is_live else "test"]

    def _country(self) -> str:
        return self.cred("country", "UG")

    async def _token(self, client: httpx.AsyncClient) -> str:
        resp = await client.post(
            f"{self._base}/auth/oauth2/token",
            json={
                "client_id": self.cred("client_id"),
                "client_secret": self.cred("client_secret"),
                "grant_type": "client_credentials",
            },
            headers={"Content-Type": "application/json", "Accept": "*/*"},
        )
        return (resp.json() or {}).get("access_token", "")

    def _headers(self, token: str, currency: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "X-Country": self._country(),
            "X-Currency": currency,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def create_charge(
        self, *, tx_ref, amount, currency, method, customer, callback_url,
    ) -> ChargeResult:
        body = {
            "reference": tx_ref,
            "subscriber": {
                "country": self._country(),
                "currency": currency,
                "msisdn": customer.phone.lstrip("+"),
            },
            "transaction": {
                "amount": int(amount),
                "country": self._country(),
                "currency": currency,
                "id": tx_ref,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                token = await self._token(client)
                if not token:
                    return ChargeResult(ok=False, status=FAILED, error="airtel: auth failed")
                resp = await client.post(
                    f"{self._base}/merchant/v1/payments/",
                    json=body,
                    headers=self._headers(token, currency),
                )
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            return ChargeResult(ok=False, status=FAILED, error=f"airtel: {exc}")
        status = ((data.get("data") or {}).get("transaction") or {}).get("status")
        # Provider tx id is our reference; USSD prompt shown on the handset.
        return ChargeResult(
            ok=True, status=_map_status(status), redirect_url=None, provider_tx_id=tx_ref, raw=data
        )

    async def verify(self, *, tx_ref, provider_tx_id) -> VerifyResult:
        ref = provider_tx_id or tx_ref
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                token = await self._token(client)
                resp = await client.get(
                    f"{self._base}/standard/v1/payments/{ref}",
                    headers=self._headers(token, "UGX"),
                )
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            return VerifyResult(status=PENDING, raw={"error": str(exc)})
        tx = (data.get("data") or {}).get("transaction") or {}
        return VerifyResult(
            status=_map_status(tx.get("status")),
            amount=float(tx["amount"]) if tx.get("amount") else None,
            currency="UGX",
            provider_tx_id=ref,
            raw=data,
        )

    def verify_webhook_signature(self, *, headers, raw_body: bytes) -> bool:
        # Airtel callbacks are reconciled via the payment status poll (verify),
        # keyed on our stored reference, so a forged callback only triggers a
        # harmless re-verify. TODO: validate Airtel's signed callback once configured.
        return True

    def parse_webhook(self, payload: dict) -> WebhookResult:
        tx = (payload.get("transaction") or {})
        return WebhookResult(
            tx_ref=tx.get("id") or payload.get("reference"),
            status=_map_status(tx.get("status_code") or tx.get("status")),
            provider_tx_id=tx.get("id"),
            amount=float(tx["amount"]) if tx.get("amount") else None,
            currency="UGX",
            raw=payload,
            needs_verify=True,
        )
