"""Admin revenue analytics (superadmin): MRR, collected, outstanding, ARPU,
6-month collected series, and payment-method split. Live over payments/subs."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin._util import period_bounds
from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.billing import Payment, Plan, Subscription
from app.schemas.admin import (
    MethodSplit,
    RevenuePoint,
    RevenueResponse,
    RevenueTotals,
)

router = APIRouter(prefix="/admin/revenue", tags=["admin:revenue"])

_METHOD_LABEL = {"mtn_momo": "MTN MoMo", "airtel_money": "Airtel Money", "card": "Card"}
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@router.get("", response_model=RevenueResponse)
async def revenue(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = "month",
) -> RevenueResponse:
    start, _ = period_bounds(period)

    async def _scalar(stmt) -> int:
        return int((await db.execute(stmt)).scalar_one() or 0)

    # MRR — active subscriptions' plan prices.
    mrr = await _scalar(
        select(func.coalesce(func.sum(Plan.price_ugx), 0))
        .select_from(Subscription).join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.status == "active")
    )
    active_accounts = await _scalar(
        select(func.count(func.distinct(Subscription.account_id)))
        .where(Subscription.status == "active")
    )
    collected = await _scalar(
        select(func.coalesce(func.sum(Payment.amount_ugx), 0))
        .where(Payment.status == "successful", Payment.created_at >= start)
    )
    outstanding = await _scalar(
        select(func.coalesce(func.sum(Plan.price_ugx), 0))
        .select_from(Subscription).join(Plan, Plan.id == Subscription.plan_id)
        .where(Subscription.status == "past_due")
    )
    arpu = int(mrr / active_accounts) if active_accounts > 0 else 0

    totals = RevenueTotals(
        mrr_ugx=mrr, collected_ugx=collected, outstanding_ugx=outstanding, arpu_ugx=arpu,
    )

    # 6-month collected series (month bucket via date_trunc).
    six_ago = datetime.now(timezone.utc).replace(day=1) - timedelta(days=155)
    # Group/order by the SELECT alias so date_trunc's format literal is bound
    # once (binding it twice yields distinct params Postgres won't match).
    month_rows = (await db.execute(
        select(
            func.date_trunc("month", Payment.created_at).label("m"),
            func.coalesce(func.sum(Payment.amount_ugx), 0),
        )
        .where(Payment.status == "successful", Payment.created_at >= six_ago)
        .group_by("m")
        .order_by("m")
    )).all()
    series = [
        RevenuePoint(month=_MONTHS[m.month - 1], revenue=int(v))
        for m, v in month_rows if m is not None
    ]

    # Payment-method split over successful payments in the period.
    method_rows = (await db.execute(
        select(Payment.method, func.coalesce(func.sum(Payment.amount_ugx), 0))
        .where(Payment.status == "successful", Payment.created_at >= start)
        .group_by(Payment.method)
    )).all()
    total_val = sum(int(v) for _, v in method_rows) or 1
    method_split = [
        MethodSplit(
            method=_METHOD_LABEL.get(m or "", (m or "Unknown").title()),
            share_pct=round(int(v) / total_val * 100, 1),
            value_ugx=int(v),
        )
        for m, v in sorted(method_rows, key=lambda r: r[1], reverse=True)
    ]

    return RevenueResponse(
        period=period, totals=totals, series=series, method_split=method_split,
    )
