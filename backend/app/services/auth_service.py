# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Auth business logic: registration with consent, login, password reset."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_reset_token,
    decode_token,
    hash_password,
    reset_fingerprint,
    verify_password,
)
from app.models.account import Account, User
from app.schemas.auth import RegisterRequest

TRIAL_MESSAGES = 500
TRIAL_DAYS = 14


async def register_account(
    db: AsyncSession, data: RegisterRequest, *, ip: str, user_agent: str
) -> tuple[Account, User]:
    if not (data.accept_terms and data.accept_privacy and data.accept_data_retention):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "You must accept the Terms of Service, Privacy Policy, and Data Retention Policy.",
        )

    existing = await db.scalar(select(User).where(User.email == data.email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")

    now = datetime.now(timezone.utc)
    account = Account(
        name=data.account_name,
        email=data.email,
        plan="trial",
        # Consent record — server-side, immutable (Section 23.3)
        accepted_terms_at=now,
        accepted_privacy_at=now,
        accepted_data_retention_at=now,
        terms_acceptance_ip=ip,
        terms_acceptance_user_agent=user_agent,
        trial_messages_remaining=TRIAL_MESSAGES,
        trial_expires_at=now + timedelta(days=TRIAL_DAYS),
    )
    db.add(account)
    await db.flush()

    user = User(
        account_id=account.id,
        email=data.email,
        hashed_password=hash_password(data.password),
        role="owner",
    )
    db.add(user)
    await db.flush()
    return account, user


# A valid bcrypt hash of a throwaway value. When the email is unknown we still run
# a full verify against this so login response time doesn't reveal whether an
# account exists (user-enumeration timing oracle).
_DUMMY_HASH = hash_password("bulkreach-login-timing-guard")


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == email))
    # Always run bcrypt (against the real hash when present, else the dummy) so both
    # branches cost the same; short-circuiting on `not user` would leak existence.
    password_ok = verify_password(password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not password_ok or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    # A suspended/deleted account blocks all of its users at login.
    account = await db.get(Account, user.account_id)
    if account is None or not account.is_active or account.status == "suspended" or account.deleted_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is suspended. Contact support.")
    user.last_login_at = datetime.now(timezone.utc)
    await db.flush()
    return user


def make_reset_token(user: User) -> str:
    return create_reset_token(str(user.id), user.hashed_password)


async def apply_password_reset(db: AsyncSession, token: str, new_password: str) -> None:
    payload = decode_token(token)
    if not payload or payload.get("type") != "reset":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token.")
    from uuid import UUID

    user = await db.get(User, UUID(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid reset token.")
    # Single-use: the token is bound to the password hash it was minted against.
    # A second use (or a link issued before another password change) no longer
    # matches and is rejected.
    if payload.get("pwf") != reset_fingerprint(user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "This reset link has already been used or has expired.")
    user.hashed_password = hash_password(new_password)
    # Recovery-from-compromise: revoke EVERY existing session (keep_id=None) so a
    # phished refresh-token family cannot survive the password reset.
    from app.services.auth_session import revoke_others

    await revoke_others(db, user, keep_id=None, reason="password_reset")
    await db.flush()
    try:
        from app.services.notifications import notify

        await notify(
            db, account_id=user.account_id, user_id=user.id, type="security.password_changed",
            level="warning", title="Your password was changed",
            body="Your BulkReach password was just reset. If this wasn't you, contact support immediately.",
            email_to=user.email, force_email=True,
        )
    except Exception:  # noqa: BLE001 — a security notice must not block the reset
        pass
