# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""DB-backed refresh-token rotation, reuse (theft) detection, and the auth-event log.

Each browser session is one `RefreshToken` row keyed by the sha256 of a 256-bit
opaque cookie value. `/auth/refresh` rotates: the presented row is revoked and a
fresh row is minted in the same `family_id`. Presenting an already-revoked token
(replay) means the cookie leaked → the whole family is revoked and a
`refresh_reuse` event is logged. The cookie is the single source of session
identity; access tokens stay short-lived so a revoked session dies quickly.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Request, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.net import client_ip as _client_ip
from app.core.security import sha256_hex
from app.models.account import Account, User
from app.models.auth import AuthEvent, RefreshToken

REFRESH_COOKIE = "bulkreach_refresh"
COOKIE_PATH = "/api/v1/auth"


class SessionError(Exception):
    """Refresh could not be honoured. `status_code` maps to the HTTP response."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _now() -> datetime:
    return datetime.now(timezone.utc)


def hash_refresh(raw: str) -> str:
    return sha256_hex(raw)


def _user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    ua = request.headers.get("user-agent")
    return ua[:400] if ua else None


# ── cookie ──────────────────────────────────────────────────────────────────
def set_refresh_cookie(response: Response, raw: str) -> None:
    # CSRF stance: SameSite=Lax means the cookie is withheld from cross-site POSTs,
    # so a forged form/fetch to /auth/refresh or /auth/logout carries no cookie and
    # fails. Path-scoping to /api/v1/auth keeps it off every other endpoint, and
    # HttpOnly keeps it out of JS (the access token, not this cookie, authorises API
    # calls). No separate CSRF token is needed for these two cookie-only routes.
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path=COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)


# ── auth events (append-only) ───────────────────────────────────────────────
async def record_auth_event(
    db: AsyncSession,
    *,
    account_id: UUID | None,
    user_id: UUID | None,
    event_type: str,
    request: Request | None = None,
    refresh_token_id: UUID | None = None,
    details: dict | None = None,
) -> None:
    db.add(
        AuthEvent(
            account_id=account_id,
            user_id=user_id,
            event_type=event_type,
            refresh_token_id=refresh_token_id,
            ip_address=_client_ip(request),
            user_agent=_user_agent(request),
            details=details or {},
        )
    )
    await db.flush()


# ── sessions ────────────────────────────────────────────────────────────────
async def issue_session(
    db: AsyncSession,
    user: User,
    request: Request | None = None,
    *,
    family_id: UUID | None = None,
    emit_login_event: bool = True,
) -> tuple[str, RefreshToken]:
    """Mint a new refresh row + return the raw opaque token for the cookie."""
    raw = secrets.token_hex(32)  # 256-bit
    now = _now()
    row = RefreshToken(
        user_id=user.id,
        account_id=user.account_id,
        token_hash=hash_refresh(raw),
        family_id=family_id or _new_family_id(),
        ip_address=_client_ip(request),
        user_agent=_user_agent(request),
        last_used_at=now,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(row)
    await db.flush()  # populate row.id
    if emit_login_event:
        await record_auth_event(
            db, account_id=user.account_id, user_id=user.id,
            event_type="login", request=request, refresh_token_id=row.id,
        )
    return raw, row


def _new_family_id() -> UUID:
    import uuid

    return uuid.uuid4()


async def rotate(
    db: AsyncSession, raw: str | None, request: Request | None = None
) -> tuple[str, RefreshToken]:
    """Validate + rotate a presented refresh token. Raises SessionError on any
    failure; on replay of a revoked token, revokes the whole family first."""
    if not raw:
        raise SessionError(401, "Invalid refresh token.")
    # FOR UPDATE serialises concurrent refreshes on the same row so two tabs
    # can't both read revoked_at IS NULL and each mint a token / burn the family.
    row = (await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh(raw)).with_for_update()
    )).scalar_one_or_none()
    if row is None:
        raise SessionError(401, "Invalid refresh token.")

    reissue_only = False
    if row.revoked_at is not None:
        # A token revoked by rotation, presented again within the grace window, is
        # the losing half of a concurrent two-tab refresh — benign. Re-issue in the
        # same family without re-revoking. Anything else (reason != rotated, or past
        # the window) is a genuine replay of a leaked cookie → burn the family.
        grace = timedelta(seconds=settings.REFRESH_ROTATION_GRACE_SECONDS)
        if row.revoked_reason == "rotated" and _now() - row.revoked_at <= grace:
            reissue_only = True
        else:
            await _revoke_family(db, row.family_id, reason="reuse")
            await record_auth_event(
                db, account_id=row.account_id, user_id=row.user_id,
                event_type="refresh_reuse", request=request, refresh_token_id=row.id,
                details={"family_id": str(row.family_id)},
            )
            raise SessionError(401, "Invalid refresh token.")

    if row.expires_at <= _now():
        raise SessionError(401, "Invalid refresh token.")

    # A refresh must not outlive a suspended/deleted user or account.
    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise SessionError(401, "Invalid refresh token.")
    account = await db.get(Account, user.account_id)
    if account is None or not account.is_active or account.status == "suspended" or account.deleted_at is not None:
        raise SessionError(403, "This account is suspended.")

    # Rotate: revoke the presented row (unless the grace path already saw it
    # revoked), then mint a fresh one in the same family.
    if not reissue_only:
        row.revoked_at = _now()
        row.revoked_reason = "rotated"
    new_raw, new_row = await issue_session(
        db, user, request, family_id=row.family_id, emit_login_event=False
    )
    await record_auth_event(
        db, account_id=user.account_id, user_id=user.id,
        event_type="refresh", request=request, refresh_token_id=new_row.id,
    )
    return new_raw, new_row


async def _revoke_family(db: AsyncSession, family_id: UUID, *, reason: str) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason=reason)
    )


async def revoke_by_raw(
    db: AsyncSession, raw: str | None, *, reason: str, request: Request | None = None
) -> RefreshToken | None:
    """Revoke the session identified by a cookie value (logout). Idempotent."""
    if not raw:
        return None
    row = (await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh(raw))
    )).scalar_one_or_none()
    if row is None:
        return None
    if row.revoked_at is None:
        row.revoked_at = _now()
        row.revoked_reason = reason
        await db.flush()
    return row


async def list_sessions(db: AsyncSession, user: User) -> list[RefreshToken]:
    """Live (non-revoked, non-expired) sessions for the user, newest first."""
    rows = (await db.execute(
        select(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > _now(),
        )
        .order_by(RefreshToken.last_used_at.desc().nullslast(), RefreshToken.created_at.desc())
    )).scalars().all()
    return list(rows)


async def revoke_session(
    db: AsyncSession, session_id: UUID, user: User, *, reason: str = "user_revoked"
) -> bool:
    """Revoke one of the user's own sessions. Returns True if a live row was hit."""
    row = await db.get(RefreshToken, session_id)
    if row is None or row.user_id != user.id or row.revoked_at is not None:
        return False
    row.revoked_at = _now()
    row.revoked_reason = reason
    await db.flush()
    return True


async def revoke_others(
    db: AsyncSession, user: User, keep_id: UUID | None, *, reason: str = "revoke_others"
) -> int:
    """Revoke all the user's live sessions except `keep_id`. Returns the count."""
    stmt = (
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=_now(), revoked_reason=reason)
    )
    if keep_id is not None:
        stmt = stmt.where(RefreshToken.id != keep_id)
    result = await db.execute(stmt)
    return int(result.rowcount or 0)
