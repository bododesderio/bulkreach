"""Admin account management (superadmin): list, detail, suspend/activate.

Suspend flips status→suspended + is_active=False (blocks the account's users at
auth); activate restores status→active + is_active=True. Both are audited."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import Account, User
from app.models.billing import Payment, Plan, Subscription
from app.models.campaign import Campaign
from app.schemas.admin import (
    AccountCampaignBrief,
    AdminAccountDetail,
    AdminAccountOut,
    AdminAccountsResponse,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/admin/accounts", tags=["admin:accounts"])


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
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Account.name).like(like) | func.lower(Account.email).like(like))
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
