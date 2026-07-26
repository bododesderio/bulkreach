"""MTN MoMo Collections (direct) adapter — request-to-pay (customer pays us).

USSD-push flow (STK-style): no redirect. We generate an X-Reference-Id UUID (our
provider_tx_id) BEFORE the call, POST request-to-pay, then reconcile with
GET /requesttopay/{referenceId}. The OAuth token is cached + auto-refreshed.
Requires a provisioned API user/key + subscription key; live needs KYC/go-live.
Refunds require the separate Disbursements product (+ payer MSISDN) and are not
offered through this collections adapter.
"""
from __future__ import annotations

import base64
import uuid

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
from app.services.payments.http import DEFAULT_TIMEOUT, request_with_retry
from app.services.payments.token_cache import get_token, make_key

_HOSTS = {
    "test": "https://sandbox.momodeveloper.mtn.com",
    "live": "https://proxy.momoapi.mtn.com",
}


def _map_status(raw: str | None) -> str:
    s = (raw or "").upper()
    if s == "SUCCESSFUL":
        return SUCCESSFUL
    if s in ("FAILED", "REJECTED", "TIMEOUT"):
        return FAILED
    return PENDING


class MtnMomoProvider(PaymentProvider):
    slug = "mtn_momo"
    display_name = "MTN MoMo (Direct)"
    supported_methods = ("mtn_momo",)
    credential_fields = (
        CredentialField("subscription_key", "Collections Subscription Key", secret=True),
        CredentialField("api_user", "API User (UUID)", secret=False),
        CredentialField("api_key", "API Key", secret=True),
    )

    @property
    def _base(self) -> str:
        return _HOSTS["live" if self.is_live else "test"]

    @property
    def _target_env(self) -> str:
        return "mtnuganda" if self.is_live else "sandbox"

    async def _token(self, client: httpx.AsyncClient) -> str:
        key = make_key(self.slug, self.mode, self.cred("api_user"), self.cred("api_key"),
                       self.cred("subscription_key"))

        async def fetch() -> tuple[str, float]:
            basic = base64.b64encode(
                f"{self.cred('api_user')}:{self.cred('api_key')}".encode()
            ).decode()
            resp = await request_with_retry(
                client, "POST", f"{self._base}/collection/token/",
                headers={"Authorization": f"Basic {basic}",
                         "Ocp-Apim-Subscription-Key": self.cred("subscription_key")},
            )
            j = resp.json() or {}
            return j.get("access_token", ""), float(j.get("expires_in", 3600) or 3600)

        return await get_token(key, fetch)

    async def create_charge(
        self, *, tx_ref, amount, currency, method, customer, callback_url,
    ) -> ChargeResult:
        reference_id = str(uuid.uuid4())  # X-Reference-Id → our provider_tx_id
        body = {
            "amount": str(int(amount)),
            "currency": currency,
            "externalId": tx_ref,
            "payer": {"partyIdType": "MSISDN", "partyId": customer.phone.lstrip("+")},
            "payerMessage": "BulkReach payment",
            "payeeNote": "BulkReach",
        }
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                token = await self._token(client)
                if not token:
                    return ChargeResult(ok=False, status=FAILED, error="momo: auth failed")
                resp = await request_with_retry(
                    client, "POST", f"{self._base}/collection/v1_0/requesttopay",
                    json=body, retry_on_5xx=False,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Reference-Id": reference_id,
                        "X-Target-Environment": self._target_env,
                        "Ocp-Apim-Subscription-Key": self.cred("subscription_key"),
                        "Content-Type": "application/json",
                    },
                )
        except httpx.HTTPError as exc:
            return ChargeResult(ok=False, status=FAILED, error=f"momo: {exc}")
        if resp.status_code != 202:
            return ChargeResult(ok=False, status=FAILED, error=f"momo: HTTP {resp.status_code}")
        # No redirect — the customer approves the USSD prompt on their handset.
        return ChargeResult(ok=True, status=PENDING, redirect_url=None, provider_tx_id=reference_id)

    async def verify(self, *, tx_ref, provider_tx_id) -> VerifyResult:
        if not provider_tx_id:
            return VerifyResult(status=PENDING)
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
                token = await self._token(client)
                resp = await request_with_retry(
                    client, "GET", f"{self._base}/collection/v1_0/requesttopay/{provider_tx_id}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "X-Target-Environment": self._target_env,
                        "Ocp-Apim-Subscription-Key": self.cred("subscription_key"),
                    },
                )
            data = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            return VerifyResult(status=PENDING, raw={"error": str(exc)})
        return VerifyResult(
            status=_map_status(data.get("status")),
            amount=float(data["amount"]) if data.get("amount") else None,
            currency=data.get("currency"),
            provider_tx_id=provider_tx_id,
            raw=data,
        )

    def verify_webhook_signature(self, *, headers, raw_body: bytes) -> bool:
        # MoMo callbacks are reconciled via the request-to-pay status poll (verify),
        # keyed on our stored X-Reference-Id, so a forged callback only triggers a
        # harmless re-verify. TODO: validate X-Callback-Signature once configured.
        return True

    def parse_webhook(self, payload: dict) -> WebhookResult:
        return WebhookResult(
            tx_ref=payload.get("externalId"),
            status=_map_status(payload.get("status")),
            provider_tx_id=payload.get("referenceId"),
            amount=float(payload["amount"]) if payload.get("amount") else None,
            currency=payload.get("currency"),
            raw=payload,
            needs_verify=True,
        )
