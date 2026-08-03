# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Campaign, CampaignContact, ManagedCampaign, Report — Section 4.1."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPk


class Campaign(UUIDPk, TimestampMixin, Base):
    __tablename__ = "campaigns"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    contact_list_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contact_lists.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # sms|email|both
    # draft|queued|scheduled|sending|completed|failed|cancelled
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)

    sms_body: Mapped[str | None] = mapped_column(Text)
    sms_sender_id: Mapped[str | None] = mapped_column(String(20))
    email_subject: Mapped[str | None] = mapped_column(String(500))
    email_html_body: Mapped[str | None] = mapped_column(Text)
    email_plain_body: Mapped[str | None] = mapped_column(Text)
    from_email: Mapped[str | None] = mapped_column(String(320))
    from_name: Mapped[str | None] = mapped_column(String(255))

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    messages_sent: Mapped[int] = mapped_column(Integer, default=0)
    sms_sent: Mapped[int] = mapped_column(Integer, default=0)
    sms_failed: Mapped[int] = mapped_column(Integer, default=0)
    email_sent: Mapped[int] = mapped_column(Integer, default=0)
    email_failed: Mapped[int] = mapped_column(Integer, default=0)
    # Delivery-report (DLR) outcomes, populated by inbound provider callbacks after
    # a message is accepted ("sent"). delivered ≤ sent; bounced counts hard failures.
    delivered: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    bounced: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    elapsed_seconds: Mapped[float | None] = mapped_column(Float)
    error_message: Mapped[str | None] = mapped_column(Text)

    archived: Mapped[bool] = mapped_column(default=False)

    recipients: Mapped[list["CampaignContact"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignContact(UUIDPk, Base):
    __tablename__ = "campaign_contacts"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    phone: Mapped[str | None] = mapped_column(String(20))  # E.164
    email: Mapped[str | None] = mapped_column(String(320))
    merge_data: Mapped[dict] = mapped_column(JSONB, default=dict)

    campaign: Mapped[Campaign] = relationship(back_populates="recipients")


class Message(UUIDPk, TimestampMixin, Base):
    """One row per recipient×channel — the unit of dispatch, retry and delivery
    reporting (Sections 3.3, 6.x). Aggregate counters live on Campaign."""

    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_campaign_status", "campaign_id", "status"),
        # DLR lookup: inbound callbacks resolve a message by its provider id.
        Index("ix_messages_provider_message_id", "provider_message_id"),
        # Inbound-SMS opt-out lookup: resolve the most recent SMS to a recipient
        # (WHERE channel='sms' AND recipient=? ORDER BY created_at DESC).
        Index("ix_messages_recipient_created", "recipient", "created_at"),
    )

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
    )
    campaign_contact_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("campaign_contacts.id", ondelete="SET NULL")
    )
    channel: Mapped[str] = mapped_column(String(10), nullable=False)  # sms|email
    recipient: Mapped[str] = mapped_column(String(320), nullable=False)  # E.164 or email
    # queued|sending|sent|failed → (via DLR) delivered|undelivered|bounced|complained
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    provider: Mapped[str | None] = mapped_column(String(40))
    provider_message_id: Mapped[str | None] = mapped_column(String(255))
    error_reason: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ManagedCampaign(UUIDPk, TimestampMixin, Base):
    __tablename__ = "managed_campaigns"

    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL")
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    brief_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Pipeline state (see services/managed/pipeline.py). The admin runs each job
    # solo and advances it via forward transitions — no client sign-off, no
    # assignment (both were removed; their columns dropped in migration b2d4f6a8c1e0).
    status: Mapped[str] = mapped_column(String(30), default="briefed", nullable=False, index=True)

    # Draft campaign copy the admin writes (before a Campaign exists).
    copy_sms: Mapped[str | None] = mapped_column(Text)
    copy_email_subject: Mapped[str | None] = mapped_column(String(500))
    copy_email_body: Mapped[str | None] = mapped_column(Text)

    # Orthogonal lifecycle flags (do not consume a pipeline stage).
    on_hold: Mapped[bool] = mapped_column(default=False, nullable=False)
    cancelled: Mapped[bool] = mapped_column(default=False, nullable=False)


class Report(UUIDPk, Base):
    __tablename__ = "reports"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # analytics|client_success
    file_url: Mapped[str | None] = mapped_column(String(1024))
    emailed_to: Mapped[str | None] = mapped_column(String(320))
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
