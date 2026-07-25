"""SMS providers — pluggable, functional as soon as their keys are configured.

Add a provider by implementing SmsProvider and registering it in _REGISTRY.
Selection: settings.SMS_PROVIDER ("auto" picks the first configured by priority).
"""
from __future__ import annotations

import logging
import random
import uuid

from app.core.config import settings

from .base import SendResult, SmsProvider, http

logger = logging.getLogger("bulkreach.dispatch.sms")


class AfricasTalkingSms:
    name = "africas_talking"

    @property
    def configured(self) -> bool:
        return bool(settings.AT_API_KEY and settings.AT_USERNAME)

    async def send(self, *, to: str, body: str, sender_id: str | None = None) -> SendResult:
        data = {
            "username": settings.AT_USERNAME,
            "to": to,
            "message": body,
            "from": sender_id or settings.AT_SENDER_ID,
        }
        try:
            resp = await http().post(
                f"{settings.AT_API_BASE}/version1/messaging",
                data=data,
                headers={
                    "apiKey": settings.AT_API_KEY,
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            resp.raise_for_status()
            recipients = resp.json().get("SMSMessageData", {}).get("Recipients", [])
            if recipients and recipients[0].get("status") == "Success":
                return SendResult(True, self.name, recipients[0].get("messageId"))
            reason = recipients[0].get("status") if recipients else "no_recipient_accepted"
            return SendResult(False, self.name, error=str(reason))
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class TwilioSms:
    name = "twilio"

    @property
    def configured(self) -> bool:
        return bool(
            settings.TWILIO_ACCOUNT_SID
            and settings.TWILIO_AUTH_TOKEN
            and (settings.TWILIO_FROM_NUMBER or settings.TWILIO_MESSAGING_SERVICE_SID)
        )

    async def send(self, *, to: str, body: str, sender_id: str | None = None) -> SendResult:
        data = {"To": to, "Body": body}
        if settings.TWILIO_MESSAGING_SERVICE_SID:
            data["MessagingServiceSid"] = settings.TWILIO_MESSAGING_SERVICE_SID
        else:
            data["From"] = settings.TWILIO_FROM_NUMBER
        try:
            resp = await http().post(
                f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json",
                data=data,
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            )
            body_json = resp.json()
            if resp.status_code < 400 and body_json.get("status") not in ("failed", "undelivered"):
                return SendResult(True, self.name, body_json.get("sid"))
            return SendResult(False, self.name, error=str(body_json.get("message") or body_json.get("status")))
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class InfobipSms:
    name = "infobip"

    @property
    def configured(self) -> bool:
        return bool(settings.INFOBIP_BASE_URL and settings.INFOBIP_API_KEY)

    async def send(self, *, to: str, body: str, sender_id: str | None = None) -> SendResult:
        payload = {
            "messages": [
                {
                    "from": sender_id or settings.INFOBIP_SENDER,
                    "destinations": [{"to": to}],
                    "text": body,
                }
            ]
        }
        try:
            resp = await http().post(
                f"{settings.INFOBIP_BASE_URL.rstrip('/')}/sms/2/text/advanced",
                json=payload,
                headers={
                    "Authorization": f"App {settings.INFOBIP_API_KEY}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            resp.raise_for_status()
            msgs = resp.json().get("messages", [])
            group = (msgs[0].get("status", {}).get("groupName") if msgs else "") or ""
            if msgs and group not in ("REJECTED", "UNDELIVERABLE"):
                return SendResult(True, self.name, msgs[0].get("messageId"))
            return SendResult(False, self.name, error=group or "rejected")
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class VonageSms:
    name = "vonage"

    @property
    def configured(self) -> bool:
        return bool(settings.VONAGE_API_KEY and settings.VONAGE_API_SECRET)

    async def send(self, *, to: str, body: str, sender_id: str | None = None) -> SendResult:
        data = {
            "api_key": settings.VONAGE_API_KEY,
            "api_secret": settings.VONAGE_API_SECRET,
            "to": to.lstrip("+"),
            "from": sender_id or settings.VONAGE_FROM,
            "text": body,
        }
        try:
            resp = await http().post("https://rest.nexmo.com/sms/json", data=data)
            resp.raise_for_status()
            msgs = resp.json().get("messages", [])
            if msgs and msgs[0].get("status") == "0":
                return SendResult(True, self.name, msgs[0].get("message-id"))
            reason = msgs[0].get("error-text") if msgs else "no_message"
            return SendResult(False, self.name, error=str(reason))
        except Exception as exc:  # noqa: BLE001
            return SendResult(False, self.name, error=f"{type(exc).__name__}: {exc}")


class SmsSimulator:
    """Labelled dev simulator — NEVER sends a real SMS. Marks delivery with a
    synthetic id and fails a configurable fraction so retry logic is exercised."""

    name = "simulator"

    @property
    def configured(self) -> bool:
        return True

    async def send(self, *, to: str, body: str, sender_id: str | None = None) -> SendResult:
        logger.info("[SIMULATED SMS] to=%s from=%s len=%d", to, sender_id, len(body))
        if random.random() < settings.SIMULATOR_FAILURE_RATE:
            return SendResult(False, self.name, error="simulated_transient_failure")
        return SendResult(True, self.name, f"sim-sms-{uuid.uuid4().hex[:16]}")


class _UnconfiguredSms:
    name = "unconfigured"

    @property
    def configured(self) -> bool:
        return False

    async def send(self, *, to: str, body: str, sender_id: str | None = None) -> SendResult:
        return SendResult(False, "unconfigured", error="sms_provider_not_configured")


_REGISTRY: dict[str, type] = {
    "africas_talking": AfricasTalkingSms,
    "twilio": TwilioSms,
    "infobip": InfobipSms,
    "vonage": VonageSms,
    "simulator": SmsSimulator,
}
_PRIORITY = ["africas_talking", "twilio", "infobip", "vonage"]


def available_sms_providers() -> dict[str, bool]:
    """Map provider name -> configured? (for an admin/settings surface)."""
    return {name: _REGISTRY[name]().configured for name in _PRIORITY}


def get_sms_provider() -> SmsProvider:
    if settings.DISPATCH_FORCE_SIMULATOR:
        return SmsSimulator()
    choice = settings.SMS_PROVIDER
    if choice == "simulator":
        return SmsSimulator()
    if choice != "auto":
        provider = _REGISTRY[choice]()
        if provider.configured:
            return provider
        logger.warning("SMS provider '%s' selected but not configured.", choice)
    else:
        for name in _PRIORITY:
            provider = _REGISTRY[name]()
            if provider.configured:
                return provider
    # Nothing configured: simulator in dev, hard-fail marker in prod.
    if settings.is_production:
        logger.error("No SMS provider configured in production — messages will fail.")
        return _UnconfiguredSms()
    logger.warning("No SMS provider configured — using labelled SIMULATOR (non-prod).")
    return SmsSimulator()
