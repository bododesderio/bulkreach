"""Payment webhook signature verification (MoMo + Airtel).

Both providers use an opt-in signed callback: with no `webhook_secret` configured
the callback is accepted (the service credits nothing off it — it always re-verifies
via the status poll), but once a secret IS configured the HMAC becomes mandatory and
is enforced fail-closed.
"""
from __future__ import annotations

import hashlib
import hmac

from app.services.payments.airtel import AirtelProvider
from app.services.payments.mtn_momo import MtnMomoProvider

RAW = b'{"externalId":"tx_123","status":"SUCCESSFUL","amount":"5000"}'


def _sig(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# --- No secret configured → accepted (relies on mandatory server-side re-verify) ---

def test_momo_no_secret_accepts_unsigned():
    p = MtnMomoProvider(mode="test", credentials={"subscription_key": "k"})
    assert p.verify_webhook_signature(headers={}, raw_body=RAW) is True


def test_airtel_no_secret_accepts_unsigned():
    p = AirtelProvider(mode="test", credentials={"client_id": "c"})
    assert p.verify_webhook_signature(headers={}, raw_body=RAW) is True


# --- Secret configured → signature is mandatory and fail-closed ---

def test_momo_secret_valid_signature_passes():
    secret = "whsec_momo"
    p = MtnMomoProvider(mode="live", credentials={"webhook_secret": secret})
    headers = {"X-Callback-Signature": _sig(secret, RAW)}
    assert p.verify_webhook_signature(headers=headers, raw_body=RAW) is True


def test_momo_secret_prefixed_signature_passes():
    secret = "whsec_momo"
    p = MtnMomoProvider(mode="live", credentials={"webhook_secret": secret})
    headers = {"x-callback-signature": f"sha256={_sig(secret, RAW)}"}
    assert p.verify_webhook_signature(headers=headers, raw_body=RAW) is True


def test_momo_secret_missing_signature_rejected():
    p = MtnMomoProvider(mode="live", credentials={"webhook_secret": "whsec_momo"})
    assert p.verify_webhook_signature(headers={}, raw_body=RAW) is False


def test_momo_secret_wrong_signature_rejected():
    p = MtnMomoProvider(mode="live", credentials={"webhook_secret": "whsec_momo"})
    headers = {"X-Callback-Signature": _sig("attacker", RAW)}
    assert p.verify_webhook_signature(headers=headers, raw_body=RAW) is False


def test_momo_secret_tampered_body_rejected():
    secret = "whsec_momo"
    p = MtnMomoProvider(mode="live", credentials={"webhook_secret": secret})
    headers = {"X-Callback-Signature": _sig(secret, RAW)}  # signed the original body
    assert p.verify_webhook_signature(headers=headers, raw_body=RAW + b"x") is False


def test_airtel_secret_valid_signature_passes():
    secret = "whsec_airtel"
    p = AirtelProvider(mode="live", credentials={"webhook_secret": secret})
    headers = {"x-signature": _sig(secret, RAW)}
    assert p.verify_webhook_signature(headers=headers, raw_body=RAW) is True


def test_airtel_secret_wrong_signature_rejected():
    p = AirtelProvider(mode="live", credentials={"webhook_secret": "whsec_airtel"})
    headers = {"x-signature": _sig("attacker", RAW)}
    assert p.verify_webhook_signature(headers=headers, raw_body=RAW) is False


# --- Hardening (from security review) ---

def test_non_ascii_signature_fails_closed_not_500():
    """A hostile non-ASCII header must fail closed, not raise (would be a 500)."""
    p = MtnMomoProvider(mode="live", credentials={"webhook_secret": "whsec_momo"})
    assert p.verify_webhook_signature(headers={"X-Callback-Signature": "é" * 8},
                                      raw_body=RAW) is False


def test_empty_secret_is_treated_as_unconfigured():
    p = MtnMomoProvider(mode="live", credentials={"webhook_secret": ""})
    assert p.verify_webhook_signature(headers={}, raw_body=RAW) is True


def test_whitespace_only_secret_is_treated_as_unconfigured():
    p = AirtelProvider(mode="live", credentials={"webhook_secret": "   "})
    assert p.verify_webhook_signature(headers={}, raw_body=RAW) is True
