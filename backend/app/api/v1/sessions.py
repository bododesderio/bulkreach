# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Active-session management (Settings → Security): list this user's live
sessions, revoke one, or log out every other device. Each action is audited to
auth_events. The caller's own session is identified by the refresh cookie."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.schemas.auth import SessionOut
from app.services.auth_session import (
    REFRESH_COOKIE,
    hash_refresh,
    list_sessions,
    record_auth_event,
    revoke_others,
    revoke_session,
)

router = APIRouter(prefix="/auth", tags=["auth:sessions"])


def _current_hash(request: Request) -> str | None:
    raw = request.cookies.get(REFRESH_COOKIE)
    return hash_refresh(raw) if raw else None


@router.get("/sessions", response_model=list[SessionOut])
async def my_sessions(
    request: Request,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SessionOut]:
    current = _current_hash(request)
    rows = await list_sessions(db, user)
    return [
        SessionOut(
            id=r.id,
            ip_address=str(r.ip_address) if r.ip_address else None,
            user_agent=r.user_agent,
            last_used_at=r.last_used_at,
            created_at=r.created_at,
            current=(current is not None and r.token_hash == current),
        )
        for r in rows
    ]


@router.post("/sessions/{session_id}/revoke")
async def revoke_one(
    session_id: UUID,
    request: Request,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    ok = await revoke_session(db, session_id, user)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    await record_auth_event(
        db, account_id=user.account_id, user_id=user.id,
        event_type="session_revoked", request=request, refresh_token_id=session_id,
    )
    return {"ok": True}


@router.post("/sessions/revoke-others")
async def revoke_all_others(
    request: Request,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Log out every device except the one making this request."""
    current = _current_hash(request)
    keep_id: UUID | None = None
    if current is not None:
        for r in await list_sessions(db, user):
            if r.token_hash == current:
                keep_id = r.id
                break
    revoked = await revoke_others(db, user, keep_id)
    await record_auth_event(
        db, account_id=user.account_id, user_id=user.id,
        event_type="revoke_others", request=request, details={"count": revoked},
    )
    return {"revoked": revoked}
