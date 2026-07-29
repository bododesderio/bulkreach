# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Admin account management (superadmin): list, detail, suspend/activate.

Suspend flips status→suspended + is_active=False (blocks the account's users at
auth); activate restores status→active + is_active=True. Both are audited."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.core.security import create_impersonation_token
from app.models.account import Account, User
from app.models.billing import Payment, Plan, Subscription
from app.models.campaign import Campaign
from app.schemas.admin import (
    AccountCampaignBrief,
    AdminAccountDetail,
    AdminAccountOut,
    AdminAccountsResponse,
    ImpersonateOut,
    ImpersonateStopBody,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/admin/accounts", tags=["admin:accounts"])


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "0.0.0.0")


async def _mrr_map(db: AsyncSession) -> dict[UUID, int]:
    rows = (await db.execute(
        select(Subscription.account_id, Plan.price_ugx)
        .join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.status == "active")
    )).all()
    return {acc: int(price or 0) for acc, price in rows}


async def _messages_map(db: AsyncSession, since: datetime) -> dict[UUID, int]:
    rows = (await db.execute(
        select(Campaign.account_id, func.coalesce(func.sum(Campaign.messages_sent), 0))
        .where(Campaign.created_at >= since)
        .group_by(Campaign.account_id)
    )).all()
    return {acc: int(m) for acc, m in rows}


def _out(a: Account, messages_month: int, mrr: int) -> AdminAccountOut:
    return AdminAccountOut(
        id=a.id, name=a.name, email=a.email, plan=a.plan, status=a.status,
        is_active=a.is_active, joined=a.created_at,
        messages_month=messages_month, mrr_ugx=mrr,
    )


@router.get("", response_model=AdminAccountsResponse)
async def list_accounts(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = None,
    q: str | None = None,
    limit: int = 200,
) -> AdminAccountsResponse:
    since = datetime.now(timezone.utc) - timedelta(days=30)
    mrr = await _mrr_map(db)
    msgs = await _messages_map(db, since)

    stmt = select(Account).where(Account.deleted_at.is_(None))
    if status_filter:
        stmt = stmt.where(Account.status == status_filter)
    if q:
        esc = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{esc}%"
        stmt = stmt.where(
            func.lower(Account.name).like(like, escape="\\")
            | func.lower(Account.email).like(like, escape="\\")
        )
    stmt = stmt.order_by(Account.created_at.desc()).limit(min(limit, 500))
    accounts = (await db.execute(stmt)).scalars().all()

    items = [_out(a, msgs.get(a.id, 0), mrr.get(a.id, 0)) for a in accounts]
    stats = {
        "total": len(items),
        "active": sum(1 for i in items if i.status == "active"),
        "trial": sum(1 for i in items if i.status == "trial"),
        "suspended": sum(1 for i in items if i.status == "suspended"),
        "mrr_ugx": sum(i.mrr_ugx for i in items),
    }
    return AdminAccountsResponse(items=items, stats=stats)


@router.get("/{account_id}", response_model=AdminAccountDetail)
async def account_detail(
    account_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminAccountDetail:
    account = await db.get(Account, account_id)
    if account is None or account.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    since = datetime.now(timezone.utc) - timedelta(days=30)
    mrr = (await _mrr_map(db)).get(account_id, 0)
    msgs = (await _messages_map(db, since)).get(account_id, 0)

    sub_row = (await db.execute(
        select(Subscription, Plan.name, Plan.price_ugx)
        .join(Plan, Plan.id == Subscription.plan_id, isouter=True)
        .where(Subscription.account_id == account_id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )).first()
    subscription = None
    if sub_row is not None:
        s, pname, pprice = sub_row
        subscription = {
            "plan_name": pname, "price_ugx": pprice, "status": s.status,
            "current_period_end": s.current_period_end.isoformat() if s.current_period_end else None,
        }

    campaigns = (await db.execute(
        select(Campaign).where(Campaign.account_id == account_id)
        .order_by(Campaign.created_at.desc()).limit(5)
    )).scalars().all()
    recent_campaigns = [
        AccountCampaignBrief(
            id=c.id, name=c.name, type=c.type, status=c.status,
            messages_sent=c.messages_sent, created_at=c.created_at,
        )
        for c in campaigns
    ]

    payments = (await db.execute(
        select(Payment).where(Payment.account_id == account_id)
        .order_by(Payment.created_at.desc()).limit(5)
    )).scalars().all()
    recent_payments = [
        {"tx_ref": p.tx_ref, "amount_ugx": p.amount_ugx, "method": p.method,
         "status": p.status, "created_at": p.created_at.isoformat()}
        for p in payments
    ]

    users_count = int((await db.execute(
        select(func.count()).select_from(User).where(User.account_id == account_id)
    )).scalar_one() or 0)

    return AdminAccountDetail(
        account=_out(account, msgs, mrr),
        subscription=subscription,
        recent_campaigns=recent_campaigns,
        recent_payments=recent_payments,
        users_count=users_count,
    )


async def _set_status(
    db: AsyncSession, admin: User, account_id: UUID, *, new_status: str,
    is_active: bool, action: str,
) -> AdminAccountOut:
    account = await db.get(Account, account_id)
    if account is None or account.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    account.status = new_status
    account.is_active = is_active
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action=action,
        resource_type="account", resource_id=str(account.id),
        details={"name": account.name, "status": new_status},
    )
    await db.commit()
    await db.refresh(account)

    # Tell the account holder their status changed. Suspension force-emails because
    # the user is locked out of the in-app feed (auth is blocked while suspended).
    try:
        from app.services.notifications import notify

        if new_status == "suspended":
            await notify(
                db, account_id=account.id, type="account.suspended", level="error",
                title="Your account has been suspended",
                body="Access to BulkReach has been suspended. Contact support to resolve this.",
                force_email=True, meta={"by": admin.email},
            )
        elif is_active and new_status == "active":
            await notify(
                db, account_id=account.id, type="account.reactivated", level="success",
                title="Your account has been reactivated",
                body="Welcome back — your BulkReach account is active again.",
                link="/dashboard", meta={"by": admin.email},
            )
        await db.commit()
    except Exception:  # noqa: BLE001 — an account-status change must not fail on a notice
        pass

    since = datetime.now(timezone.utc) - timedelta(days=30)
    mrr = (await _mrr_map(db)).get(account_id, 0)
    msgs = (await _messages_map(db, since)).get(account_id, 0)
    return _out(account, msgs, mrr)


@router.post("/{account_id}/suspend", response_model=AdminAccountOut)
async def suspend_account(
    account_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminAccountOut:
    return await _set_status(
        db, admin, account_id, new_status="suspended", is_active=False,
        action="account.suspend",
    )


@router.post("/{account_id}/activate", response_model=AdminAccountOut)
async def activate_account(
    account_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminAccountOut:
    return await _set_status(
        db, admin, account_id, new_status="active", is_active=True,
        action="account.activate",
    )


@router.post("/{account_id}/portal-access")
async def grant_portal_access(
    account_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Turn an account's owner into a managed-portal client: mark user_type
    managed_client, force a password change, and set a temporary password
    (returned only in non-production so the portal login can be tested)."""
    import secrets

    from app.core.config import settings
    from app.core.security import hash_password

    account = await db.get(Account, account_id)
    if account is None or account.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    owner = (await db.execute(
        select(User).where(User.account_id == account_id, User.role == "owner").limit(1)
    )).scalar_one_or_none()
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account has no owner user")

    temp = secrets.token_urlsafe(9)
    owner.user_type = "managed_client"
    owner.must_change_password = True
    owner.hashed_password = hash_password(temp)
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action="account.portal_access",
        resource_type="user", resource_id=str(owner.id), details={"account": account.name},
    )
    await db.commit()
    return {
        "email": owner.email,
        "temp_password": None if settings.is_production else temp,
    }


async def _account_owner(db: AsyncSession, account_id: UUID) -> User | None:
    """The account's owner, falling back to its earliest-created user."""
    owner = (await db.execute(
        select(User).where(User.account_id == account_id, User.role == "owner").limit(1)
    )).scalar_one_or_none()
    if owner is not None:
        return owner
    return (await db.execute(
        select(User).where(User.account_id == account_id)
        .order_by(User.created_at.asc()).limit(1)
    )).scalar_one_or_none()


@router.post("/{account_id}/impersonate", response_model=ImpersonateOut)
async def impersonate_account(
    account_id: UUID,
    request: Request,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImpersonateOut:
    """Mint a short-lived token that lets a superadmin act as an account's owner.

    Full access, audit-only: safety comes from the short TTL and the start/stop
    audit trail, not per-action blocks. The principal is the (non-superadmin)
    owner, so /admin/* stays blocked by role. A suspended account's token will
    not authenticate (auth blocks inactive accounts) — acceptable by design."""
    account = await db.get(Account, account_id)
    if account is None or account.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    owner = await _account_owner(db, account_id)
    if owner is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Account has no user to impersonate")

    token = create_impersonation_token(
        str(owner.id), imp=str(admin.id), imp_email=admin.email
    )
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email,
        action="admin.impersonate.start", resource_type="account",
        resource_id=str(account.id),
        details={"owner_id": str(owner.id), "owner_email": owner.email, "name": account.name},
        ip_address=_client_ip(request),
    )
    await db.commit()
    return ImpersonateOut(
        access_token=token,
        account_id=account.id,
        account_name=account.name,
        owner_email=owner.email,
        expires_in=settings.IMPERSONATION_TOKEN_MINUTES * 60,
    )


@router.post("/impersonate-stop")
async def impersonate_stop(
    body: ImpersonateStopBody,
    request: Request,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Record the end of an impersonation session. Called with the admin's REAL
    token (the frontend swaps back before calling), so `admin` is the superadmin."""
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email,
        action="admin.impersonate.stop", resource_type="account",
        resource_id=str(body.account_id) if body.account_id else None,
        ip_address=_client_ip(request),
    )
    await db.commit()
    return {"ok": True}
