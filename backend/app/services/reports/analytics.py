"""Account-wide campaign analytics (Section 2.2).

Aggregates from the denormalised per-campaign counters (sms_sent/…/email_failed)
so a summary never scans the messages table.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
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

    campaigns = list(
        (
            await db.execute(
                select(Campaign).where(*where).order_by(Campaign.created_at.desc())
            )
        ).scalars()
    )

    ch = ChannelBreakdown()
    daily: dict[str, int] = {}
    recent: list[CampaignSummaryRow] = []

    for c in campaigns:
        ch.sms_sent += c.sms_sent
        ch.sms_failed += c.sms_failed
        ch.email_sent += c.email_sent
        ch.email_failed += c.email_failed

        delivered = c.sms_sent + c.email_sent
        failed = c.sms_failed + c.email_failed

        # Attribute a campaign's deliveries to its completion day (approximation
        # that avoids a per-message scan; good enough for the dashboard chart).
        if delivered and (c.completed_at or c.created_at):
            day = (c.completed_at or c.created_at).strftime("%Y-%m-%d")
            daily[day] = daily.get(day, 0) + delivered

        if len(recent) < 10:
            recent.append(
                CampaignSummaryRow(
                    id=c.id,
                    name=c.name,
                    type=c.type,
                    status=c.status,
                    delivered=delivered,
                    failed=failed,
                    delivery_rate=_rate(delivered, failed),
                    created_at=c.created_at,
                    completed_at=c.completed_at,
                )
            )

    delivered_total = ch.sms_sent + ch.email_sent
    failed_total = ch.sms_failed + ch.email_failed

    return ReportSummary(
        period=period,
        campaigns=len(campaigns),
        recipients=delivered_total + failed_total,
        delivered=delivered_total,
        failed=failed_total,
        delivery_rate=_rate(delivered_total, failed_total),
        channels=ch,
        daily=[DailyPoint(date=d, delivered=n) for d, n in sorted(daily.items())],
        recent=recent,
    )
