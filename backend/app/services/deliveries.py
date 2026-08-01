# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Delivery-report (DLR) ingestion + the suppression list (Section 6, 20).

A message is marked `sent` when a provider *accepts* it; the real outcome arrives
later as an asynchronous delivery report. `record_delivery` transitions the message
to its final state (delivered / undelivered / bounced / complained), updates the
campaign's denormalised counters, and — on a hard bounce or spam complaint — adds
the recipient to the account's suppression list so future sends skip it.

All transitions are idempotent: a repeated or out-of-order DLR for a message that is
already in a terminal delivery state is a no-op."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign, Message
from app.models.suppression import Suppression

# The terminal states a DLR can move a message into.
DELIVERY_OUTCOMES = {"delivered", "undelivered", "bounced", "complained"}
# Outcomes that permanently suppress the recipient (protect sender reputation).
_HARD = {"bounced", "complained"}
# Inbound-SMS reply keywords that opt a recipient out (Section 6/20).
STOP_KEYWORDS = {
    "stop", "stopall", "unsubscribe", "unsub", "cancel", "end", "quit",
    "optout", "opt-out", "opt out",
}


def is_stop_keyword(text: str | None) -> bool:
    """True if an inbound reply is an opt-out request (whole-message match)."""
    return (text or "").strip().lower() in STOP_KEYWORDS


def _norm(channel: str, address: str) -> str:
    return address.strip().lower() if channel == "email" else address.strip()


async def add_suppression(
    db: AsyncSession, account_id: UUID, channel: str, address: str, *, reason: str
) -> bool:
    """Add an address to the account's suppression list. Idempotent (unique index).
    Returns True if a new row was created."""
    addr = _norm(channel, address)
    if not addr:
        return False
    exists = await db.scalar(
        select(Suppression.id).where(
            Suppression.account_id == account_id,
            Suppression.channel == channel,
            Suppression.address == addr,
        ).limit(1)
    )
    if exists:
        return False
    db.add(Suppression(account_id=account_id, channel=channel, address=addr, reason=reason))
    await db.flush()
    return True


async def is_suppressed(db: AsyncSession, account_id: UUID, channel: str, address: str) -> bool:
    return bool(await db.scalar(
        select(Suppression.id).where(
            Suppression.account_id == account_id,
            Suppression.channel == channel,
            Suppression.address == _norm(channel, address),
        ).limit(1)
    ))


async def suppressed_addresses(db: AsyncSession, account_id: UUID, channel: str) -> set[str]:
    """All suppressed addresses for an account+channel — for bulk filtering at
    campaign materialisation (one query instead of one-per-recipient)."""
    rows = (await db.execute(
        select(Suppression.address).where(
            Suppression.account_id == account_id, Suppression.channel == channel
        )
    )).scalars()
    return set(rows)


async def record_delivery(
    db: AsyncSession,
    *,
    provider_message_id: str,
    outcome: str,
    provider: str | None = None,
    raw: dict | None = None,
    commit: bool = True,
) -> bool:
    """Apply a delivery report to the message with this provider id. Returns True if
    a message was found and transitioned (or already terminal); False if unknown."""
    if outcome not in DELIVERY_OUTCOMES or not provider_message_id:
        return False
    msg = await db.scalar(
        select(Message).where(Message.provider_message_id == provider_message_id).limit(1)
    )
    if msg is None:
        return False
    if msg.status in DELIVERY_OUTCOMES:
        return True  # idempotent — already reported

    msg.status = outcome
    if outcome == "delivered":
        msg.delivered_at = datetime.now(timezone.utc)
    elif raw:
        reason = raw.get("reason") or raw.get("error") or raw.get("failureReason")
        if reason:
            msg.error_reason = str(reason)[:2000]

    campaign = await db.get(Campaign, msg.campaign_id)
    if campaign is not None:
        if outcome == "delivered":
            campaign.delivered += 1
        elif outcome in _HARD:
            campaign.bounced += 1
            await add_suppression(
                db, campaign.account_id, msg.channel, msg.recipient, reason=outcome,
            )

    await db.flush()
    if commit:
        await db.commit()
    return True


async def handle_inbound_sms(
    db: AsyncSession, *, from_number: str, text: str, commit: bool = True
) -> str | None:
    """Process an inbound (mobile-originated) SMS. If it's a STOP keyword, opt the
    sender out by suppressing their number for the **sending account** — the account
    whose campaign most recently sent SMS to that number. Returns the action taken
    (`"suppressed"` / `"already_suppressed"`) or None (not a STOP, or no prior send)."""
    number = (from_number or "").strip()
    if not number or not is_stop_keyword(text):
        return None

    # Attribute the opt-out to whoever last messaged this number.
    msg = await db.scalar(
        select(Message)
        .where(Message.channel == "sms", Message.recipient == number)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    if msg is None:
        return None
    campaign = await db.get(Campaign, msg.campaign_id)
    if campaign is None:
        return None

    created = await add_suppression(
        db, campaign.account_id, "sms", number, reason="unsubscribe"
    )
    if commit:
        await db.commit()
    return "suppressed" if created else "already_suppressed"
