"""Notification delivery (Section — notifications).

One entry point, `notify()`, fans an event out to the channels the account has
enabled for that event's category:
  • in_app  → a Notification row (the bell feed)
  • email   → a best-effort transactional email (no-op without SMTP)

Category is the part of the type before the first dot (billing.past_due → billing).
Preferences are per-account; anything unset falls back to DEFAULT_CHANNELS.

Quota-threshold notifications are additionally deduped in Redis so an account is
told "80% used" at most once per month per threshold.
"""
from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis
from app.models.account import Account, User
from app.models.notification import Notification, NotificationPreference
from app.services.email import send_email

log = logging.getLogger("bulkreach.notifications")

# category → channels enabled by default when the account hasn't customised.
DEFAULT_CHANNELS: dict[str, list[str]] = {
    "billing": ["in_app", "email"],
    "quota": ["in_app", "email"],
    "payment": ["in_app"],
    "campaign": ["in_app"],
    "team": ["in_app"],
    "system": ["in_app"],
}

QUOTA_THRESHOLDS = (80, 90, 100)


def _category(type_: str) -> str:
    return type_.split(".", 1)[0]


def effective_channels(prefs: NotificationPreference | None) -> dict[str, list[str]]:
    """Merge stored per-category overrides onto the defaults."""
    merged = {k: list(v) for k, v in DEFAULT_CHANNELS.items()}
    if prefs and isinstance(prefs.channels, dict):
        for cat, chans in prefs.channels.items():
            if isinstance(chans, list):
                merged[cat] = [c for c in chans if c in ("in_app", "email")]
    return merged


async def _channels_for(db: AsyncSession, account_id: UUID, category: str) -> list[str]:
    prefs = (
        await db.execute(
            select(NotificationPreference).where(NotificationPreference.account_id == account_id)
        )
    ).scalar_one_or_none()
    return effective_channels(prefs).get(category, DEFAULT_CHANNELS.get(category, ["in_app"]))


async def notify(
    db: AsyncSession,
    *,
    account_id: UUID,
    type: str,
    title: str,
    body: str | None = None,
    level: str = "info",
    link: str | None = None,
    meta: dict | None = None,
    user_id: UUID | None = None,
    email_subject: str | None = None,
    email_html: str | None = None,
    email_to: str | None = None,
) -> Notification | None:
    """Create an in-app notification (if enabled) and optionally email it. Returns
    the Notification row, or None if in-app is disabled for the category. Never
    raises for delivery problems — notifications must not break the triggering flow."""
    category = _category(type)
    channels = await _channels_for(db, account_id, category)

    notification: Notification | None = None
    if "in_app" in channels:
        notification = Notification(
            account_id=account_id, user_id=user_id, type=type, level=level,
            title=title, body=body, link=link, meta=meta or {},
        )
        db.add(notification)
        await db.flush()

    if "email" in channels and (email_html or body):
        to = email_to
        if to is None:
            account = await db.get(Account, account_id)
            to = account.email if account else None
        if to:
            try:
                await send_email(
                    to=to,
                    subject=email_subject or title,
                    html=email_html or f"<p>{body or title}</p>",
                    plain=body or title,
                )
            except Exception:  # noqa: BLE001 — email is best-effort
                log.warning("notification email failed acct=%s type=%s", account_id, type)
    return notification


async def notify_quota_threshold(
    db: AsyncSession, account: Account, used: int, limit: int | None
) -> None:
    """Fire a one-per-month notification when monthly usage crosses 80/90/100%.

    Deduped via a Redis set per account+month so repeated dispatches don't spam.
    """
    if not limit or limit <= 0:
        return
    pct = min(round(used / limit * 100), 100)
    crossed = [t for t in QUOTA_THRESHOLDS if pct >= t]
    if not crossed:
        return
    from app.services.subscription import quota as quota_svc

    marker = f"notif:quota:{account.id}:{quota_svc._now():%Y-%m}"
    for threshold in crossed:
        # SADD returns 1 only the first time this threshold is added → send once.
        if not await redis.sadd(marker, threshold):
            continue
        # Expire the marker at the end of the month so next month starts clean.
        await redis.expireat(marker, int(quota_svc.month_reset_at().timestamp()))
        if threshold >= 100:
            title = "You've used all of this month's messages"
            body = ("Your monthly message allowance is exhausted. Upgrade your plan "
                    "to keep sending, or wait for the monthly reset.")
            level = "error"
        else:
            title = f"You've used {threshold}% of your monthly messages"
            body = (f"{used:,} of {limit:,} messages used this month. "
                    "Consider upgrading if you're running low.")
            level = "warning"
        await notify(
            db, account_id=account.id, type="quota.threshold", title=title, body=body,
            level=level, link="/dashboard/billing",
            meta={"pct": pct, "threshold": threshold, "used": used, "limit": limit},
            email_subject=title,
        )
