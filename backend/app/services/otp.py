"""Email verification OTP (Section 5.2). 6-digit codes, bcrypt-hashed, 15-min
expiry, max 5 verify attempts; issuing a new code invalidates prior ones."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.account import EmailVerificationToken

OTP_TTL_MINUTES = 15
MAX_ATTEMPTS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def issue(db: AsyncSession, user_id: UUID) -> str:
    """Invalidate any prior unconsumed codes, mint a new one, return the plaintext
    (to email / surface in dev). Only the hash is persisted."""
    prior = (await db.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.consumed_at.is_(None),
        )
    )).scalars().all()
    for t in prior:
        t.consumed_at = _now()
    code = generate_code()
    db.add(EmailVerificationToken(
        user_id=user_id, code_hash=hash_password(code),
        expires_at=_now() + timedelta(minutes=OTP_TTL_MINUTES),
    ))
    await db.flush()
    return code


async def verify(db: AsyncSession, user_id: UUID, code: str) -> tuple[bool, str]:
    """Returns (ok, reason). reason ∈ ok|no_code|expired|too_many|invalid."""
    tok = (await db.execute(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.consumed_at.is_(None),
        ).order_by(EmailVerificationToken.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    if tok is None:
        return False, "no_code"
    if tok.expires_at < _now():
        return False, "expired"
    if tok.attempts >= MAX_ATTEMPTS:
        return False, "too_many"
    tok.attempts += 1
    if not verify_password(code, tok.code_hash):
        await db.flush()
        return False, "invalid"
    tok.consumed_at = _now()
    await db.flush()
    return True, "ok"
