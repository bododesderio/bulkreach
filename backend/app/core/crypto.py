"""Symmetric encryption for provider secrets stored at rest.

Payment-provider API keys / secret keys / webhook secrets are configured from the
admin UI and persisted in Postgres. They must never sit in the DB in plaintext.
We encrypt each secret value with Fernet (AES-128-CBC + HMAC-SHA256) using a key
derived from SECRET_KEY, so no additional env var is required in dev. In
production set PAYMENTS_ENCRYPTION_KEY to a dedicated urlsafe-base64 32-byte key
and rotate it independently of the app secret.

Never log decrypted values. Callers mask secrets before returning them to any UI.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _derive_key() -> bytes:
    explicit = getattr(settings, "PAYMENTS_ENCRYPTION_KEY", "") or ""
    if explicit:
        # Accept a ready Fernet key or any string (hashed to 32 bytes).
        try:
            Fernet(explicit.encode())
            return explicit.encode()
        except (ValueError, TypeError):
            digest = hashlib.sha256(explicit.encode()).digest()
            return base64.urlsafe_b64encode(digest)
    # Production must use a dedicated key, decoupled from the app/JWT secret, so a
    # SECRET_KEY leak doesn't expose stored provider credentials and rotating the
    # app secret doesn't silently orphan them. Fail closed at startup if unset.
    if settings.is_production:
        raise RuntimeError(
            "PAYMENTS_ENCRYPTION_KEY must be set in production "
            "(a dedicated urlsafe-base64 32-byte Fernet key)."
        )
    digest = hashlib.sha256(f"bulkreach-payments::{settings.SECRET_KEY}".encode()).digest()
    return base64.urlsafe_b64encode(digest)


_fernet = Fernet(_derive_key())

# Sentinel prefix so we can tell encrypted values apart from legacy plaintext.
_PREFIX = "enc::"


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret string. Empty input returns empty (nothing to store)."""
    if not plaintext:
        return ""
    token = _fernet.encrypt(plaintext.encode())
    return _PREFIX + token.decode()


def decrypt_secret(stored: str) -> str:
    """Decrypt a stored secret. Returns '' for empty; passes through plaintext
    that predates encryption (defensive — should not occur in normal flow)."""
    if not stored:
        return ""
    if not stored.startswith(_PREFIX):
        return stored
    try:
        return _fernet.decrypt(stored[len(_PREFIX):].encode()).decode()
    except InvalidToken:
        return ""


def mask_secret(plaintext: str) -> str:
    """Render a secret for display: keep last 4 chars, mask the rest.
    Never returns the full value. Empty stays empty."""
    if not plaintext:
        return ""
    if len(plaintext) <= 4:
        return "••••"
    return "••••" + plaintext[-4:]
