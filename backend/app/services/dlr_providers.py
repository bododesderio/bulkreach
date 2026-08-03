# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Provider-specific delivery-report (DLR) parsers.

Each parser turns a raw inbound webhook body into a normalised list of delivery
events `{provider_message_id, outcome, recipient, raw}` where outcome ∈
DELIVERY_OUTCOMES. Intermediate statuses (buffered/queued) yield no event. Where a
provider signs its callbacks (Mailgun), the signature is verified and a bad one is
rejected; where it doesn't (Africa's Talking uses a secret callback URL + the edge
rate-limit), events are accepted unsigned — mirroring the payment-webhook stance."""
from __future__ import annotations

import hashlib
import hmac
import json
import time

from app.core.config import settings

# Reject Mailgun callbacks whose signed timestamp is older/newer than this (replay).
_MAILGUN_MAX_SKEW_SECONDS = 300

# Africa's Talking SMS delivery-report statuses → our outcomes (terminal only).
_AT_MAP = {
    "delivered": "delivered",
    "success": "delivered",
    "failed": "undelivered",
    "rejected": "undelivered",
}
# Mailgun event → outcome.
_MG_MAP = {"delivered": "delivered", "complained": "complained"}
# SendGrid event → outcome.
_SG_MAP = {
    "delivered": "delivered",
    "bounce": "bounced",
    "dropped": "bounced",
    "spamreport": "complained",
    "deferred": "undelivered",
}


def verify_callback_secret(provider: str, presented: str | None) -> bool:
    """Outer gate for webhook callbacks (inbound SMS + DLR).

    - `simulator`/`test`: allowed only outside production (never in prod).
    - A configured `WEBHOOK_CALLBACK_SECRET`: the caller must present it
      (query `?s=` / `X-Webhook-Secret` header), compared in constant time.
    - No secret configured: allowed only outside production — fail-closed in
      prod so an unconfigured deployment can't be spoofed.

    Providers that sign their bodies (Mailgun) are *additionally* verified in
    `parse()`; this secret is the primary gate for unsigned providers."""
    provider = (provider or "").lower()
    if provider in ("simulator", "test"):
        return not settings.is_production
    secret = settings.WEBHOOK_CALLBACK_SECRET
    if not secret:
        return not settings.is_production
    return bool(presented) and hmac.compare_digest(str(presented), secret)


def _verify_mailgun(payload: dict) -> bool:
    """HMAC-SHA256(timestamp+token) with the Mailgun signing key. If no key is
    configured, accept only outside production — in prod a missing key must
    fail closed rather than wave forged events through."""
    key = settings.MAILGUN_API_KEY
    sig = (payload or {}).get("signature") or {}
    token, timestamp, signature = sig.get("token"), sig.get("timestamp"), sig.get("signature")
    if not key:
        return not settings.is_production
    if not (token and timestamp and signature):
        return False
    # Reject stale callbacks so a captured, validly-signed event can't be replayed
    # indefinitely (forged delivered/complained → skewed stats + suppression).
    try:
        if abs(time.time() - float(timestamp)) > _MAILGUN_MAX_SKEW_SECONDS:
            return False
    except (TypeError, ValueError):
        return False
    expected = hmac.new(
        key.encode(), f"{timestamp}{token}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def parse_inbound(
    provider: str, raw_body: bytes, payload: dict | None, form: dict | None
) -> tuple[bool, list[dict]]:
    """Normalise an inbound-SMS (mobile-originated) webhook into
    `[{from, text, raw}]`. Used for STOP/opt-out handling. Unsigned (secret
    callback URL + edge rate-limit), mirroring the DLR stance."""
    provider = (provider or "").lower()

    if provider in ("simulator", "test"):
        p = payload or {}
        frm, text = p.get("from"), p.get("text")
        if frm and text is not None:
            return True, [{"from": str(frm), "text": str(text), "raw": p}]
        return True, []

    if provider in ("africastalking", "at"):
        # AT posts form-encoded: from, to, text, date, id, linkId.
        d = form or payload or {}
        frm, text = d.get("from"), d.get("text")
        if frm and text is not None:
            return True, [{"from": str(frm), "text": str(text),
                           "raw": {"to": d.get("to"), "linkId": d.get("linkId")}}]
        return True, []

    return True, []


def parse(provider: str, raw_body: bytes, payload: dict | None, form: dict | None) -> tuple[bool, list[dict]]:
    """Return (verified, events). `verified` False means reject the webhook."""
    provider = (provider or "").lower()

    if provider in ("simulator", "test"):
        p = payload or {}
        pmid, outcome = p.get("provider_message_id"), p.get("outcome")
        if pmid and outcome:
            return True, [{"provider_message_id": str(pmid), "outcome": outcome,
                           "recipient": p.get("recipient"), "raw": p}]
        return True, []

    if provider in ("africastalking", "at"):
        # AT posts form-encoded: id, status, phoneNumber, failureReason.
        d = form or payload or {}
        outcome = _AT_MAP.get(str(d.get("status", "")).strip().lower())
        pmid = d.get("id")
        if outcome and pmid:
            return True, [{"provider_message_id": str(pmid), "outcome": outcome,
                           "recipient": d.get("phoneNumber"),
                           "raw": {"failureReason": d.get("failureReason")}}]
        return True, []

    if provider == "mailgun":
        p = payload or {}
        if not _verify_mailgun(p):
            return False, []
        ev = p.get("event-data") or {}
        event = str(ev.get("event", "")).lower()
        if event == "failed":
            outcome = "bounced" if str(ev.get("severity", "")).lower() == "permanent" else "undelivered"
        else:
            outcome = _MG_MAP.get(event)
        pmid = ((ev.get("message") or {}).get("headers") or {}).get("message-id")
        if outcome and pmid:
            return True, [{"provider_message_id": str(pmid), "outcome": outcome,
                           "recipient": ev.get("recipient"),
                           "raw": {"reason": (ev.get("delivery-status") or {}).get("message")}}]
        return True, []

    if provider == "sendgrid":
        # SendGrid posts a JSON array of events.
        events = payload if isinstance(payload, list) else None
        if events is None:
            try:
                events = json.loads(raw_body or b"[]")
            except Exception:  # noqa: BLE001
                events = []
        out: list[dict] = []
        for ev in events or []:
            outcome = _SG_MAP.get(str(ev.get("event", "")).lower())
            pmid = ev.get("sg_message_id") or ev.get("smtp-id")
            if outcome and pmid:
                out.append({"provider_message_id": str(pmid), "outcome": outcome,
                            "recipient": ev.get("email"), "raw": {"reason": ev.get("reason")}})
        return True, out

    return True, []
