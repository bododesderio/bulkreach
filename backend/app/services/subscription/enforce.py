# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""The subscription hard gate (Section K, Layer 2) + the quota-state read the
dashboard/composer use (Layer 1). Layer 3 (per-dispatch fail-safe) calls
`monthly_exhausted` from the engine.

Effective plan resolution, in order: an active Subscription's Plan → a trial
account's free allowance → a Plan matched by the account's plan name. No match
and not a trial ⇒ the account has no active plan and cannot send."""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.billing import Plan, Subscription
from app.models.campaign import Campaign
from app.services.subscription import quota


def _402(code: str, **detail):
    return HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail={"code": code, **detail})


class Limits:
    def __init__(
        self,
        plan: Plan | None,
        *,
        is_trial: bool,
        trial_remaining: int = 0,
        sub: "Subscription | None" = None,
    ):
        # Per-account overrides (admin plan controls) win over the shared Plan.
        # `custom_features` is shallow-merged over the plan's feature gates.
        gates = dict((plan.features or {}).get("gates", {})) if plan else {}
        if sub is not None and sub.custom_features:
            gates.update((sub.custom_features or {}).get("gates", sub.custom_features))
        self.plan_name = "Trial" if is_trial else (plan.name if plan else None)
        self.is_trial = is_trial
        self.trial_remaining = trial_remaining
        # -1 (or None) monthly means unlimited.
        if is_trial:
            raw_monthly = trial_remaining
        elif sub is not None and sub.custom_messages_per_month is not None:
            raw_monthly = sub.custom_messages_per_month
        else:
            raw_monthly = plan.messages_per_month if plan else 0
        self.monthly_limit = None if (raw_monthly is not None and raw_monthly < 0) else raw_monthly
        if sub is not None and sub.custom_daily_limit is not None:
            self.daily_limit = sub.custom_daily_limit
        else:
            self.daily_limit = gates.get("daily_limit")  # None = no daily cap
        self.simultaneous_limit = int(gates.get("simultaneous_limit", 3))
        self.scheduling = bool(gates.get("scheduling", True))
        self.allowed_formats = gates.get("allowed_formats")  # None = all


async def resolve_limits(db: AsyncSession, account: Account) -> Limits | None:
    sub = (await db.execute(
        select(Subscription).where(
            Subscription.account_id == account.id, Subscription.status == "active"
        ).limit(1)
    )).scalar_one_or_none()
    if sub is not None:
        plan = await db.get(Plan, sub.plan_id)
        if plan is not None:
            return Limits(plan, is_trial=False, sub=sub)
    if (account.plan or "").lower() == "trial":
        return Limits(None, is_trial=True, trial_remaining=account.trial_messages_remaining)
    if account.plan:
        plan = (await db.execute(
            select(Plan).where(func.lower(Plan.name) == account.plan.lower()).limit(1)
        )).scalar_one_or_none()
        if plan is not None:
            return Limits(plan, is_trial=False)
    return None


async def _active_sending(db: AsyncSession, account_id: UUID) -> int:
    return int((await db.execute(
        select(func.count()).select_from(Campaign).where(
            Campaign.account_id == account_id, Campaign.status == "sending"
        )
    )).scalar_one() or 0)


async def enforce_send(db: AsyncSession, account: Account, campaign: Campaign, message_count: int) -> None:
    """Raise 402 if this campaign may not send. On a trial, decrements the free
    allowance (trial is billed up-front; paid plans meter as they dispatch)."""
    limits = await resolve_limits(db, account)
    if limits is None:
        raise _402("SUBSCRIPTION_INACTIVE")

    if limits.is_trial:
        if message_count > limits.trial_remaining:
            raise _402("MONTHLY_QUOTA_EXCEEDED", remaining=limits.trial_remaining,
                       requested=message_count)
        account.trial_messages_remaining -= message_count
        return

    # Feature gate: scheduling
    if campaign.scheduled_at and not limits.scheduling:
        raise _402("FEATURE_NOT_ON_PLAN", feature="scheduling", required_plan="growth")

    # Concurrent campaigns
    if await _active_sending(db, account.id) >= limits.simultaneous_limit:
        raise _402("CONCURRENT_LIMIT_REACHED", limit=limits.simultaneous_limit)

    # Monthly quota
    if limits.monthly_limit is not None:
        used = await quota.get_monthly_used(account.id)
        remaining = limits.monthly_limit - used
        if remaining <= 0:
            raise _402("MONTHLY_QUOTA_EXCEEDED", remaining=0,
                       resets_at=quota.month_reset_at().isoformat())
        if message_count > remaining:
            raise _402("PARTIAL_QUOTA", remaining=remaining, requested=message_count)

    # Daily limit — block-partial like the monthly check, so a single large
    # campaign can't blow past the cap (the daily counter only moves after a
    # campaign finishes, so a same-day check on accumulated-only under-enforces).
    if limits.daily_limit is not None:
        daily_used = await quota.get_daily_used(account.id)
        daily_remaining = limits.daily_limit - daily_used
        if daily_remaining <= 0:
            raise _402("DAILY_LIMIT_REACHED", remaining=0,
                       resets_at=quota.day_reset_at().isoformat())
        if message_count > daily_remaining:
            raise _402("DAILY_LIMIT_REACHED", remaining=daily_remaining,
                       requested=message_count,
                       resets_at=quota.day_reset_at().isoformat())


async def monthly_exhausted(db: AsyncSession, account: Account) -> bool:
    """Layer 3 fail-safe: has the monthly quota run out (e.g. a concurrent
    campaign consumed it) since this campaign was queued?"""
    limits = await resolve_limits(db, account)
    if limits is None or limits.is_trial or limits.monthly_limit is None:
        return False
    return await quota.get_monthly_used(account.id) >= limits.monthly_limit


async def quota_state(db: AsyncSession, account: Account) -> dict:
    limits = await resolve_limits(db, account)
    if limits is None:
        return {"plan": None, "active": False, "unlimited": False,
                "monthly_used": 0, "monthly_limit": 0, "monthly_remaining": 0,
                "daily_used": 0, "daily_limit": None, "pct": 0,
                "monthly_resets_at": quota.month_reset_at().isoformat()}
    if limits.is_trial:
        used = 0  # trial allowance is decremented on the account, not in Redis
        limit = limits.trial_remaining
    else:
        used = await quota.get_monthly_used(account.id)
        limit = limits.monthly_limit
    unlimited = limit is None
    remaining = None if unlimited else max(limit - used, 0)
    pct = 0 if unlimited or not limit else min(round(used / limit * 100), 100)
    return {
        "plan": limits.plan_name, "active": True, "unlimited": unlimited,
        "is_trial": limits.is_trial,
        "monthly_used": used, "monthly_limit": limit, "monthly_remaining": remaining,
        "daily_used": await quota.get_daily_used(account.id),
        "daily_limit": limits.daily_limit, "pct": pct,
        "monthly_resets_at": quota.month_reset_at().isoformat(),
    }
