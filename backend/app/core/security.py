# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Password hashing, API-key hashing, and JWT issue/verify.

Per Section 13.1: JWT (python-jose) — RS256 when a keypair is configured, HS256
fallback otherwise. Access tokens are short-lived (15 min); sessions live via the
DB-backed rotating refresh cookie (see `app.services.auth_session`), not a JWT.
API keys are bcrypt-hashed and shown once at creation.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# --- Passwords ---
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# --- API keys (Section 13.1: bcrypt-hashed, raw shown once) ---
def generate_api_key() -> tuple[str, str]:
    """Return (raw_key, bcrypt_hash). Raw is shown to the user exactly once."""
    raw = "brk_" + secrets.token_urlsafe(32)
    return raw, pwd_context.hash(raw)


def verify_api_key(raw: str, hashed: str) -> bool:
    return pwd_context.verify(raw, hashed)


# --- JWT ---
def _signing_key_alg() -> tuple[str, str]:
    """(key, algorithm) for signing. RS256 with the private key when configured,
    else HS256 with the symmetric SECRET_KEY (dev/test default)."""
    if settings.use_rs256:
        return settings.JWT_PRIVATE_KEY, "RS256"
    return settings.SECRET_KEY, settings.JWT_ALGORITHM


def _verify_key_alg() -> tuple[str, str]:
    """(key, algorithm) for verification — the public key under RS256."""
    if settings.use_rs256:
        return settings.JWT_PUBLIC_KEY, "RS256"
    return settings.SECRET_KEY, settings.JWT_ALGORITHM


def _create_token(subject: str, expires: timedelta, token_type: str, **claims: Any) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires,
        **claims,
    }
    key, alg = _signing_key_alg()
    return jwt.encode(payload, key, algorithm=alg)


def create_access_token(subject: str, **claims: Any) -> str:
    return _create_token(
        subject,
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "access",
        **claims,
    )


def create_impersonation_token(subject: str, **claims: Any) -> str:
    """Short-lived access token a superadmin uses to act as an account's owner.
    Carries an `imp`/`imp_email` claim identifying the real actor for audit."""
    return _create_token(
        subject,
        timedelta(minutes=settings.IMPERSONATION_TOKEN_MINUTES),
        "access",
        **claims,
    )


def create_reset_token(subject: str) -> str:
    """Short-lived (1h) password-reset token."""
    return _create_token(subject, timedelta(hours=1), "reset")


def decode_token(token: str) -> dict[str, Any] | None:
    key, alg = _verify_key_alg()
    try:
        return jwt.decode(token, key, algorithms=[alg])
    except JWTError:
        return None


# --- SHA-256 (contact anonymisation & file checksums, Sections 19.2 / 23.4) ---
def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
