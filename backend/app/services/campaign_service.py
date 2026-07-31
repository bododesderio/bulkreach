# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Campaign lifecycle: create/validate drafts, materialise recipients into
messages, queue for dispatch, cancel, and compute delivery stats. Section 3-6."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Account
from app.models.campaign import Campaign, CampaignContact, Message
from app.models.contact import Contact, ContactList
from app.schemas.campaign import CampaignCreate, CampaignUpdate
from app.services import template_engine

_EDITABLE_STATES = {"draft"}
_CANCELLABLE_STATES = {"draft", "queued", "scheduled", "sending"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _load_owned_list(db: AsyncSession, list_id: uuid.UUID, account_id: uuid.UUID) -> ContactList:
    cl = await db.get(ContactList, list_id)
    if cl is None or cl.account_id != account_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact list not found.")
    return cl


def _validate_tags(payload: CampaignCreate | Campaign, contact_list: ContactList | None) -> None:
    """Reject merge tags not present in the chosen list's columns (Section 3.2)."""
    if contact_list is None:
        return
    available = list(contact_list.merge_columns or []) + [
        c for c in (contact_list.phone_column, contact_list.email_column) if c
    ]
    bad: set[str] = set()
    for tmpl in (payload.sms_body, payload.email_subject, payload.email_html_body, payload.email_plain_body):
        if tmpl:
            try:
                bad.update(template_engine.validate_template(tmpl, available))
            except template_engine.TemplateError as exc:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Template error: {exc}")
    if bad:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unknown merge tags: {', '.join('{{' + t + '}}' for t in sorted(bad))}. "
            f"Available: {', '.join(available) or 'none'}.",
        )


async def create(db: AsyncSession, account_id: uuid.UUID, payload: CampaignCreate) -> Campaign:
    contact_list = None
    if payload.contact_list_id:
        contact_list = await _load_owned_list(db, payload.contact_list_id, account_id)
    _validate_tags(payload, contact_list)

    campaign = Campaign(
        account_id=account_id,
        contact_list_id=payload.contact_list_id,
        name=payload.name,
        type=payload.type,
        status="draft",
        sms_body=payload.sms_body,
        sms_sender_id=payload.sms_sender_id or settings.AT_SENDER_ID,
        email_subject=payload.email_subject,
        email_html_body=payload.email_html_body,
        email_plain_body=payload.email_plain_body,
        from_email=payload.from_email or settings.DEFAULT_FROM_EMAIL,
        from_name=payload.from_name or settings.DEFAULT_FROM_NAME,
        scheduled_at=payload.scheduled_at,
    )
    db.add(campaign)
    await db.flush()
    return campaign


async def update_draft(db: AsyncSession, campaign: Campaign, payload: CampaignUpdate) -> Campaign:
    if campaign.status not in _EDITABLE_STATES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot edit a '{campaign.status}' campaign.")
    data = payload.model_dump(exclude_unset=True)
    if "contact_list_id" in data and data["contact_list_id"]:
        await _load_owned_list(db, data["contact_list_id"], campaign.account_id)
    for key, value in data.items():
        setattr(campaign, key, value)
    # Re-validate tags against the (possibly new) list.
    cl = await db.get(ContactList, campaign.contact_list_id) if campaign.contact_list_id else None
    _validate_tags(campaign, cl)
    await db.flush()
    return campaign


async def get_owned(db: AsyncSession, campaign_id: uuid.UUID, account_id: uuid.UUID) -> Campaign:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None or campaign.account_id != account_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found.")
    return campaign


async def list_for_account(
    db: AsyncSession, account_id: uuid.UUID, *, page: int, page_size: int, status_filter: str | None
) -> tuple[list[Campaign], int]:
    where = [Campaign.account_id == account_id]
    if status_filter:
        where.append(Campaign.status == status_filter)
    total = await db.scalar(select(func.count()).select_from(Campaign).where(*where)) or 0
    rows = list(
        (
            await db.execute(
                select(Campaign).where(*where)
                .order_by(Campaign.created_at.desc())
                .offset((page - 1) * page_size).limit(page_size)
            )
        ).scalars()
    )
    return rows, total


async def delete(db: AsyncSession, campaign: Campaign) -> None:
    if campaign.status == "sending":
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot delete a campaign while it is sending.")
    await db.delete(campaign)
    await db.flush()


async def _valid_contacts(db: AsyncSession, list_id: uuid.UUID) -> list[Contact]:
    return list(
        (
            await db.execute(
                select(Contact).where(Contact.list_id == list_id, Contact.is_valid.is_(True))
            )
        ).scalars()
    )


async def estimate(db: AsyncSession, campaign: Campaign) -> dict:
    """Recipient + message counts without materialising (for the detail view)."""
    if not campaign.contact_list_id:
        return {"recipients": 0, "messages": 0}
    contacts = await _valid_contacts(db, campaign.contact_list_id)
    recipients = messages = 0
    for c in contacts:
        has_sms = campaign.type in ("sms", "both") and bool(c.phone)
        has_email = campaign.type in ("email", "both") and bool(c.email)
        if has_sms or has_email:
            recipients += 1
        messages += int(has_sms) + int(has_email)
    return {"recipients": recipients, "messages": messages}


async def materialise_and_queue(db: AsyncSession, campaign: Campaign) -> tuple[int, int]:
    """Turn the chosen contact list into CampaignContact + Message rows and mark
    the campaign queued. Enforces MAX_RECIPIENTS and the trial message allowance."""
    if campaign.status not in ("draft", "scheduled"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Campaign is already '{campaign.status}'.")
    if not campaign.contact_list_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attach a contact list before sending.")

    contacts = await _valid_contacts(db, campaign.contact_list_id)

    # Suppression list (Section 20): skip addresses that hard-bounced, complained,
    # or opted out. Loaded once per channel, not per recipient.
    from app.services import deliveries

    sms_blocked = (
        await deliveries.suppressed_addresses(db, campaign.account_id, "sms")
        if campaign.type in ("sms", "both") else set()
    )
    email_blocked = (
        await deliveries.suppressed_addresses(db, campaign.account_id, "email")
        if campaign.type in ("email", "both") else set()
    )

    targets = []
    for c in contacts:
        sms_ok = (
            campaign.type in ("sms", "both") and bool(c.phone)
            and c.phone.strip() not in sms_blocked
        )
        email_ok = (
            campaign.type in ("email", "both") and bool(c.email)
            and c.email.strip().lower() not in email_blocked
        )
        if sms_ok or email_ok:
            targets.append((c, sms_ok, email_ok))

    recipients = len(targets)
    if recipients == 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No valid recipients for this channel. Check phone/email column mapping.",
        )
    if recipients > settings.MAX_RECIPIENTS_PER_CAMPAIGN:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{recipients:,} recipients exceeds the {settings.MAX_RECIPIENTS_PER_CAMPAIGN:,} per-campaign limit.",
        )

    message_count = sum(int(s) + int(e) for _, s, e in targets)

    # Subscription hard gate (Section K, Layer 2): active plan, feature gates,
    # concurrent limit, monthly + daily quota. Trial accounts spend their free
    # allowance here; paid plans meter in Redis as they dispatch.
    account = await db.get(Account, campaign.account_id)
    if account is not None:
        from app.services.subscription import enforce

        await enforce.enforce_send(db, account, campaign, message_count)

    # Bulk-build all rows, then a SINGLE flush. IDs are generated app-side so the
    # Message FK needs no per-contact flush round-trip (was O(n) flushes — up to
    # 20k — at send time). SQLAlchemy topologically orders CampaignContact before
    # Message on flush, satisfying the FK.
    rows: list = []
    for contact, sms_ok, email_ok in targets:
        cc_id = uuid.uuid4()
        rows.append(CampaignContact(
            id=cc_id,
            campaign_id=campaign.id,
            contact_id=contact.id,
            phone=contact.phone,
            email=contact.email,
            merge_data=contact.raw_data or {},
        ))
        if sms_ok:
            rows.append(Message(
                campaign_id=campaign.id, campaign_contact_id=cc_id, channel="sms",
                recipient=contact.phone, status="queued",
                max_attempts=settings.MAX_RETRIES_PER_MESSAGE,
            ))
        if email_ok:
            rows.append(Message(
                campaign_id=campaign.id, campaign_contact_id=cc_id, channel="email",
                recipient=contact.email, status="queued",
                max_attempts=settings.MAX_RETRIES_PER_MESSAGE,
            ))
    db.add_all(rows)

    campaign.status = "queued"
    await db.flush()
    return recipients, message_count


async def cancel(db: AsyncSession, campaign: Campaign) -> Campaign:
    if campaign.status not in _CANCELLABLE_STATES or campaign.status == "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot cancel a '{campaign.status}' campaign.")
    campaign.status = "cancelled"
    await db.flush()
    return campaign


async def compute_stats(db: AsyncSession, campaign_id: uuid.UUID) -> dict:
    rows = (
        await db.execute(
            select(Message.channel, Message.status, func.count())
            .where(Message.campaign_id == campaign_id)
            .group_by(Message.channel, Message.status)
        )
    ).all()
    stats = {
        "total": 0, "queued": 0, "sending": 0, "sent": 0, "failed": 0,
        "sms_sent": 0, "sms_failed": 0, "email_sent": 0, "email_failed": 0,
        "delivered": 0, "bounced": 0,
    }
    # A message that was accepted by the provider counts as "sent" whether or not a
    # delivery report has since moved it to delivered/undelivered/bounced/complained.
    accepted = {"sent", "delivered", "undelivered", "bounced", "complained"}
    for channel, st, count in rows:
        stats["total"] += count
        if st in accepted:
            stats["sent"] += count
            stats[f"{channel}_sent"] += count
        elif st == "failed":
            stats["failed"] += count
            stats[f"{channel}_failed"] += count
        elif st in ("queued", "sending"):
            stats[st] += count
        if st == "delivered":
            stats["delivered"] += count
        elif st in ("bounced", "complained"):
            stats["bounced"] += count
    done = stats["sent"] + stats["failed"]
    stats["delivery_rate"] = round(stats["sent"] / done * 100, 1) if done else 0.0
    # Of the messages accepted, how many a DLR confirmed delivered (0 until DLRs arrive).
    stats["delivered_rate"] = (
        round(stats["delivered"] / stats["sent"] * 100, 1) if stats["sent"] else 0.0
    )
    return stats


async def sample_for_preview(db: AsyncSession, campaign: Campaign) -> dict:
    if not campaign.contact_list_id:
        return {}
    contact = (
        await db.execute(
            select(Contact).where(
                Contact.list_id == campaign.contact_list_id, Contact.is_valid.is_(True)
            ).limit(1)
        )
    ).scalar_one_or_none()
    return dict(contact.raw_data or {}) if contact else {}
