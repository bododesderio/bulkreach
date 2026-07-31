# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Auto-renewal sweep + failed-payment dunning ladder (Section 14, day 0 → 30).

We never fabricate a card charge we can't actually make. Instead:
  • renewal sweep — when a period ends, the subscription goes `past_due` and the
    dunning clock starts (day 0). The client re-pays via the normal checkout, and
    payment settlement (`_on_success`) reactivates the subscription.
  • dunning sweep — advances the ladder (day 0/3/7/14/30), emailing a reminder as
    each stage is crossed (best-effort; no-ops without SMTP). At the grace deadline
    the account is suspended: status→suspended, plan→trial, subscription→cancelled.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Account
from app.models.billing import Plan, Subscription
from app.services.audit import record_audit

log = logging.getLogger("bulkreach.billing")


def _stage_for_days(days: int) -> int:
    """1-based ladder position for how many days past due (0..len(STAGE_DAYS))."""
    stage = 0
    for i, threshold in enumerate(settings.DUNNING_STAGE_DAYS, start=1):
        if days >= threshold:
            stage = i
    return stage


async def _notify_dunning(db, account: Account, *, days_past_due: int, final: bool) -> None:
    """Deliver a dunning notice through the notification service (in-app + email
    per the account's billing preferences)."""
    from app.services.notifications import notify

    if final:
        title = "Your subscription has been suspended"
        body = ("Your subscription payment is overdue and your account has been suspended. "
                "Settle your invoice to restore access.")
        type_, level = "billing.suspended", "error"
    else:
        title = "Action needed: your payment is overdue"
        body = (f"Your subscription renewal is {days_past_due} day(s) overdue. "
                "Please settle it to keep your account active.")
        type_, level = "billing.past_due", "warning"
    await notify(
        db, account_id=account.id, type=type_, level=level, title=title, body=body,
        link="/dashboard/billing", meta={"days_past_due": days_past_due},
        email_subject=f"BulkReach — {title}",
        email_html=(f"<p>Hi {account.name},</p><p>{body}</p>"
                    f'<p><a href="{settings.FRONTEND_URL}/dashboard/billing">Go to billing</a></p>'),
    )


async def run_renewal_sweep(db: AsyncSession, *, now: datetime | None = None) -> dict:
    """Move active subscriptions whose period has ended into `past_due` and open the
    dunning ladder at day 0. Idempotent — already past_due rows are skipped."""
    now = now or datetime.now(timezone.utc)
    due = list(
        (
            await db.execute(
                select(Subscription).where(
                    Subscription.status == "active",
                    # Admin-assigned custom deals aren't payment-driven — they never
                    # enter the dunning ladder.
                    Subscription.manually_assigned.is_(False),
                    Subscription.current_period_end.is_not(None),
                    Subscription.current_period_end <= now,
                )
            )
        ).scalars()
    )
    opened = 0
    for sub in due:
        sub.status = "past_due"
        sub.past_due_since = now
        sub.dunning_stage = 1
        sub.last_dunning_at = now
        sub.grace_until = now + timedelta(days=settings.DUNNING_GRACE_DAYS)
        account = await db.get(Account, sub.account_id)
        await record_audit(
            db, actor_id=None, actor_email="system",
            action="subscription.past_due", resource_type="subscription",
            resource_id=str(sub.id),
            details={"auto_renew": sub.auto_renew, "grace_until": sub.grace_until.isoformat()},
        )
        if account is not None:
            await _notify_dunning(db, account, days_past_due=0, final=False)
        opened += 1
    await db.flush()
    if opened:
        log.info("renewal sweep: %d subscription(s) → past_due", opened)
    return {"checked": len(due), "past_due_opened": opened}


async def run_dunning_sweep(db: AsyncSession, *, now: datetime | None = None) -> dict:
    """Advance the ladder for past_due subscriptions; suspend at the grace deadline."""
    now = now or datetime.now(timezone.utc)
    rows = list(
        (
            await db.execute(select(Subscription).where(Subscription.status == "past_due"))
        ).scalars()
    )
    advanced = suspended = 0
    for sub in rows:
        since = sub.past_due_since or now
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)
        days = (now - since).days
        account = await db.get(Account, sub.account_id)

        if days >= settings.DUNNING_GRACE_DAYS:
            # Terminal: suspend + downgrade.
            sub.status = "cancelled"
            sub.dunning_stage = len(settings.DUNNING_STAGE_DAYS)
            sub.last_dunning_at = now
            if account is not None:
                account.status = "suspended"
                account.plan = "trial"
            await record_audit(
                db, actor_id=None, actor_email="system",
                action="subscription.suspended", resource_type="subscription",
                resource_id=str(sub.id), details={"days_past_due": days},
            )
            if account is not None:
                await _notify_dunning(db, account, days_past_due=days, final=True)
            suspended += 1
            continue

        target = _stage_for_days(days)
        if target > sub.dunning_stage:
            sub.dunning_stage = target
            sub.last_dunning_at = now
            await record_audit(
                db, actor_id=None, actor_email="system",
                action="subscription.dunning_advanced", resource_type="subscription",
                resource_id=str(sub.id), details={"stage": target, "days_past_due": days},
            )
            if account is not None:
                await _notify_dunning(db, account, days_past_due=days, final=False)
            advanced += 1
    await db.flush()
    if advanced or suspended:
        log.info("dunning sweep: advanced=%d suspended=%d", advanced, suspended)
    return {"checked": len(rows), "advanced": advanced, "suspended": suspended}
