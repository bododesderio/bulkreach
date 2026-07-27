"""Admin dashboard overview (superadmin): platform KPIs + revenue-by-plan +
activity feed. All figures are live aggregates over the operational DB."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin._util import pct_change, period_bounds
from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import Account, AuditLog
from app.models.billing import Payment, Plan, Subscription
from app.models.campaign import Campaign, ManagedCampaign
from app.schemas.admin import (
    ActivityItem,
    OverviewKPIs,
    OverviewResponse,
    RevenueByPlan,
)

router = APIRouter(prefix="/admin", tags=["admin:overview"])

_MANAGED_TERMINAL = ("complete", "report_issued")

# Map audit action prefixes → activity-feed kind for the ticker.
_KIND = {
    "account.login": "system",
    "account.": "signup",
    "payment.": "payment",
    "plan.": "system",
    "managed.": "managed",
    "campaign.": "campaign",
}


def _activity_kind(action: str) -> str:
    for prefix, kind in _KIND.items():
        if action.startswith(prefix):
            return kind
    return "system"


@router.get("/overview", response_model=OverviewResponse)
async def overview(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = "month",
) -> OverviewResponse:
    start, prev_start = period_bounds(period)

    async def _count(stmt) -> int:
        return int((await db.execute(stmt)).scalar_one() or 0)

    total_clients = await _count(
        select(func.count()).select_from(Account).where(Account.deleted_at.is_(None))
    )
    new_clients = await _count(
        select(func.count()).select_from(Account).where(
            Account.deleted_at.is_(None), Account.created_at >= start
        )
    )
    prev_new = await _count(
        select(func.count()).select_from(Account).where(
            Account.deleted_at.is_(None),
            Account.created_at >= prev_start,
            Account.created_at < start,
        )
    )

    revenue = await _count(
        select(func.coalesce(func.sum(Payment.amount_ugx), 0)).where(
            Payment.status == "successful", Payment.created_at >= start
        )
    )
    prev_revenue = await _count(
        select(func.coalesce(func.sum(Payment.amount_ugx), 0)).where(
            Payment.status == "successful",
            Payment.created_at >= prev_start,
            Payment.created_at < start,
        )
    )

    messages = await _count(
        select(func.coalesce(func.sum(Campaign.messages_sent), 0)).where(
            Campaign.created_at >= start
        )
    )
    prev_messages = await _count(
        select(func.coalesce(func.sum(Campaign.messages_sent), 0)).where(
            Campaign.created_at >= prev_start, Campaign.created_at < start
        )
    )

    managed_pending = await _count(
        select(func.count()).select_from(ManagedCampaign).where(
            ManagedCampaign.status.not_in(_MANAGED_TERMINAL)
        )
    )

    # Revenue by plan — active subscriptions grouped by plan.
    plan_rows = (await db.execute(
        select(Plan.name, func.count(Subscription.id), func.coalesce(func.sum(Plan.price_ugx), 0))
        .join(Subscription, Subscription.plan_id == Plan.id)
        .where(Subscription.status == "active")
        .group_by(Plan.name)
        .order_by(func.sum(Plan.price_ugx).desc())
    )).all()
    revenue_by_plan = [
        RevenueByPlan(name=name, accounts=cnt, mrr_ugx=int(mrr))
        for name, cnt, mrr in plan_rows
    ]

    # Activity feed — most recent audit entries, humanised.
    audit_rows = (await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(12)
    )).scalars().all()
    activity = [
        ActivityItem(
            id=str(a.id),
            kind=_activity_kind(a.action),
            text=f"{a.action.replace('.', ' ').replace('_', ' ')}"
            + (f" · {a.resource_type}" if a.resource_type else ""),
            meta=a.actor_email or "system",
            when=a.created_at,
        )
        for a in audit_rows
    ]

    return OverviewResponse(
        period=period,
        kpis=OverviewKPIs(
            total_clients=total_clients,
            new_clients=new_clients,
            revenue_ugx=revenue,
            revenue_change_pct=pct_change(revenue, prev_revenue),
            messages=messages,
            messages_change_pct=pct_change(messages, prev_messages),
            managed_queue_pending=managed_pending,
        ),
        revenue_by_plan=revenue_by_plan,
        activity=activity,
    )
