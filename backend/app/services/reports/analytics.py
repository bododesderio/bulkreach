# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Account-wide campaign analytics (Section 2.2).

Aggregates from the denormalised per-campaign counters (sms_sent/…/email_failed)
so a summary never scans the messages table.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.schemas.report import (
    CampaignSummaryRow,
    ChannelBreakdown,
    DailyPoint,
    ReportSummary,
)

_PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90}


def _since(period: str) -> datetime | None:
    days = _PERIOD_DAYS.get(period)
    if days is None:
        return None  # "all"
    return datetime.now(timezone.utc) - timedelta(days=days)


def _rate(delivered: int, failed: int) -> float:
    done = delivered + failed
    return round(delivered / done * 100, 1) if done else 0.0


async def account_summary(
    db: AsyncSession, account_id: uuid.UUID, period: str = "30d"
) -> ReportSummary:
    period = period if period in _PERIOD_DAYS or period == "all" else "30d"
    since = _since(period)

    where = [Campaign.account_id == account_id]
    if since is not None:
        where.append(Campaign.created_at >= since)

    # 1) Channel totals + campaign count — one SQL aggregate over the denormalised
    #    per-campaign counters (no row hydration, no messages scan).
    n_campaigns, sms_sent, sms_failed, email_sent, email_failed = (await db.execute(
        select(
            func.count(Campaign.id),
            func.coalesce(func.sum(Campaign.sms_sent), 0),
            func.coalesce(func.sum(Campaign.sms_failed), 0),
            func.coalesce(func.sum(Campaign.email_sent), 0),
            func.coalesce(func.sum(Campaign.email_failed), 0),
        ).where(*where)
    )).one()
    ch = ChannelBreakdown(
        sms_sent=int(sms_sent), sms_failed=int(sms_failed),
        email_sent=int(email_sent), email_failed=int(email_failed),
    )

    # 2) Daily delivered series — grouped in SQL by the UTC completion day.
    delivered_expr = Campaign.sms_sent + Campaign.email_sent
    day_expr = func.to_char(
        func.timezone("UTC", func.coalesce(Campaign.completed_at, Campaign.created_at)),
        "YYYY-MM-DD",
    )
    daily_rows = (await db.execute(
        select(day_expr.label("day"), func.coalesce(func.sum(delivered_expr), 0))
        .where(*where, delivered_expr > 0)
        .group_by(day_expr).order_by(day_expr)
    )).all()

    # 3) Recent 10 — hydrate only the rows the table shows.
    recent_rows = (await db.execute(
        select(Campaign).where(*where).order_by(Campaign.created_at.desc()).limit(10)
    )).scalars()
    recent = [
        CampaignSummaryRow(
            id=c.id, name=c.name, type=c.type, status=c.status,
            delivered=c.sms_sent + c.email_sent,
            failed=c.sms_failed + c.email_failed,
            delivery_rate=_rate(c.sms_sent + c.email_sent, c.sms_failed + c.email_failed),
            created_at=c.created_at, completed_at=c.completed_at,
        )
        for c in recent_rows
    ]

    delivered_total = ch.sms_sent + ch.email_sent
    failed_total = ch.sms_failed + ch.email_failed

    return ReportSummary(
        period=period,
        campaigns=int(n_campaigns),
        recipients=delivered_total + failed_total,
        delivered=delivered_total,
        failed=failed_total,
        delivery_rate=_rate(delivered_total, failed_total),
        channels=ch,
        daily=[DailyPoint(date=d, delivered=int(n)) for d, n in daily_rows],
        recent=recent,
    )
