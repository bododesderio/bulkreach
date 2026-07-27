"""Mid-cycle proration for plan changes (Section 14).

When an account with an active subscription switches plans before the period ends,
the unused portion of what they already paid is credited against the new plan's
price. Credit = current_plan_price × (days_remaining / period_days), capped so the
charge never goes below zero. A downgrade (new ≤ credit) charges 0 now and simply
starts the new, cheaper period.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.billing import Plan, Subscription


@dataclass(frozen=True)
class Proration:
    base_price_ugx: int      # list price of the target plan
    credit_ugx: int          # credit for unused time on the current plan
    amount_due_ugx: int      # what to charge now (base - credit, floored at 0)
    days_remaining: int
    applies: bool            # False when there's nothing to prorate (fresh/renewal)


async def compute_proration(
    db: AsyncSession, account_id, target_plan: Plan, *, now: datetime | None = None
) -> Proration:
    now = now or datetime.now(timezone.utc)
    base = int(target_plan.price_ugx)
    none = Proration(base_price_ugx=base, credit_ugx=0, amount_due_ugx=base,
                     days_remaining=0, applies=False)

    sub = (
        await db.execute(select(Subscription).where(Subscription.account_id == account_id))
    ).scalar_one_or_none()
    if sub is None or sub.status != "active" or sub.current_period_end is None:
        return none
    # Same plan → not an upgrade path (renewal handles that).
    if sub.plan_id == target_plan.id:
        return none
    # Only upgrades are prorated with an immediate charge. A downgrade keeps the
    # current (more expensive) plan until the period ends, so nothing to charge now.
    current_plan = await db.get(Plan, sub.plan_id)
    if current_plan is not None and int(current_plan.price_ugx) >= base:
        return none

    period_end = sub.current_period_end
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=timezone.utc)
    remaining = (period_end - now).total_seconds()
    if remaining <= 0:
        return none

    period_days = max(1, settings.SUBSCRIPTION_PERIOD_DAYS)
    days_remaining = int(remaining // 86400)
    current_price = int(current_plan.price_ugx) if current_plan else 0
    # Fractional day precision for the credit; report whole days for display.
    credit = int(round(current_price * (remaining / 86400) / period_days))
    credit = max(0, min(credit, base))  # never credit more than the new plan costs
    amount_due = max(0, base - credit)
    return Proration(
        base_price_ugx=base,
        credit_ugx=credit,
        amount_due_ugx=amount_due,
        days_remaining=days_remaining,
        applies=credit > 0,
    )
