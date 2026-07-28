"""Team invitations (Section 5.2): an owner/admin invites a teammate by email;
the invitee accepts via a tokenised link and joins the SAME account with the
invited role. Single-account membership — an email that already has a BulkReach
account cannot be invited (multi-account membership is a future extension)."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import AdminUser
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models.account import Account, InvitationToken, User
from app.schemas.auth import TokenResponse
from app.schemas.invitation import InviteAccept, InviteCreate, InviteOut, InvitePreview
from app.services.audit import record_audit
from app.services.email import send_email

router = APIRouter(prefix="/invitations", tags=["invitations"])

INVITE_TTL_HOURS = 72
REFRESH_COOKIE = "bulkreach_refresh"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _user_exists(db: AsyncSession, email: str) -> bool:
    return (await db.execute(
        select(User.id).where(User.email == email.lower())
    )).scalar_one_or_none() is not None


@router.post("", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: InviteCreate,
    admin: AdminUser,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InviteOut:
    email = body.email.lower()
    if await _user_exists(db, email):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "That email already has a BulkReach account.")
    # Superseded any prior pending invite to the same email for this account.
    prior = (await db.execute(
        select(InvitationToken).where(
            InvitationToken.account_id == admin.account_id,
            InvitationToken.email == email, InvitationToken.accepted.is_(False),
        )
    )).scalars().all()
    for p in prior:
        await db.delete(p)

    token = secrets.token_hex(32)  # 256-bit
    invite = InvitationToken(
        account_id=admin.account_id, email=email, role=body.role,
        token_hash=_hash(token), invited_by=admin.id, invited_by_email=admin.email,
        expires_at=_now() + timedelta(hours=INVITE_TTL_HOURS),
    )
    db.add(invite)
    await db.flush()

    account = await db.get(Account, admin.account_id)
    link = f"{settings.FRONTEND_URL}/invite/{token}"
    await send_email(
        to=email,
        subject=f"You're invited to join {account.name if account else 'a team'} on BulkReach",
        html=(
            f"<p>{admin.email} invited you to join "
            f"<strong>{account.name if account else 'their team'}</strong> on BulkReach "
            f"as {body.role}.</p><p><a href='{link}'>Accept the invitation →</a></p>"
            f"<p>This link expires in {INVITE_TTL_HOURS} hours.</p>"
        ),
    )
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action="invite.sent",
        resource_type="invitation", resource_id=str(invite.id),
        details={"email": email, "role": body.role},
    )
    return InviteOut(
        id=invite.id, email=invite.email, role=invite.role, expires_at=invite.expires_at,
        accepted=invite.accepted, created_at=invite.created_at,
        dev_link=None if settings.is_production else link,
    )


@router.get("", response_model=list[InviteOut])
async def list_invites(
    admin: AdminUser, db: Annotated[AsyncSession, Depends(get_db)],
) -> list[InviteOut]:
    rows = (await db.execute(
        select(InvitationToken).where(
            InvitationToken.account_id == admin.account_id,
            InvitationToken.accepted.is_(False),
            InvitationToken.expires_at > _now(),
        ).order_by(InvitationToken.created_at.desc())
    )).scalars().all()
    return [
        InviteOut(id=i.id, email=i.email, role=i.role, expires_at=i.expires_at,
                  accepted=i.accepted, created_at=i.created_at)
        for i in rows
    ]


@router.delete("/{invite_id}")
async def revoke_invite(
    invite_id: UUID, admin: AdminUser, db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    invite = await db.get(InvitationToken, invite_id)
    if invite is None or invite.account_id != admin.account_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invitation not found")
    await db.delete(invite)
    return {"status": "revoked"}


async def _load_valid(db: AsyncSession, token: str) -> InvitationToken | None:
    return (await db.execute(
        select(InvitationToken).where(InvitationToken.token_hash == _hash(token))
    )).scalar_one_or_none()


@router.get("/{token}", response_model=InvitePreview)
async def preview_invite(
    token: str, db: Annotated[AsyncSession, Depends(get_db)],
) -> InvitePreview:
    invite = await _load_valid(db, token)
    if invite is None:
        return InvitePreview(valid=False, reason="not_found")
    if invite.accepted:
        return InvitePreview(valid=False, reason="accepted")
    if invite.expires_at < _now():
        return InvitePreview(valid=False, reason="expired")
    account = await db.get(Account, invite.account_id)
    return InvitePreview(
        valid=True, company_name=account.name if account else None,
        email=invite.email, role=invite.role,
        existing_account=await _user_exists(db, invite.email),
    )


@router.post("/{token}/accept", response_model=TokenResponse,
             status_code=status.HTTP_201_CREATED)
async def accept_invite(
    token: str,
    body: InviteAccept,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    if not (body.accept_terms and body.accept_privacy and body.accept_data_retention):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "All required policies must be accepted.")
    invite = await _load_valid(db, token)
    if invite is None or invite.accepted or invite.expires_at < _now():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invitation is invalid or expired.")
    if await _user_exists(db, invite.email):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "That email already has a BulkReach account.")

    user = User(
        account_id=invite.account_id, email=invite.email,
        hashed_password=hash_password(body.password), role=invite.role,
        email_verified=True,  # the invite link proves email control
    )
    db.add(user)
    invite.accepted = True
    invite.accepted_at = _now()
    await db.flush()

    account = await db.get(Account, invite.account_id)
    if account and invite.invited_by_email:
        await send_email(
            to=invite.invited_by_email,
            subject=f"{invite.email} joined {account.name}",
            html=f"<p>{invite.email} accepted your invitation and joined {account.name} on BulkReach.</p>",
        )
    if account:
        from app.services.notifications import notify

        await notify(
            db, account_id=account.id, type="team.member_joined", level="info",
            title="A teammate joined your account",
            body=f"{invite.email} accepted their invitation and joined as {invite.role}.",
            link="/dashboard/settings", meta={"email": invite.email, "role": invite.role},
        )
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="invite.accepted",
        resource_type="invitation", resource_id=str(invite.id),
    )

    response.set_cookie(
        REFRESH_COOKIE, create_refresh_token(str(user.id)), httponly=True,
        secure=settings.is_production, samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, path="/api/v1/auth",
    )
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
