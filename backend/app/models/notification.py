"""In-app notifications + per-account channel preferences (Section — notifications).

A Notification is account-scoped; `user_id` optionally targets one user (else it's
visible to everyone on the account). Preferences decide, per category, whether an
event is delivered in-app and/or by email — the service consults them before writing.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPk


class Notification(UUIDPk, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # Unread lookups + per-account feeds are the hot path.
        Index("ix_notifications_account_read", "account_id", "read_at"),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    # NULL → visible to all users on the account; else targeted to one user.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(60), nullable=False)  # e.g. billing.past_due
    level: Mapped[str] = mapped_column(String(10), default="info", nullable=False)  # info|success|warning|error
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(255))  # in-app deep link
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class NotificationPreference(UUIDPk, Base):
    """One row per account. `channels` maps a category → enabled channels, e.g.
    {"billing": ["in_app", "email"], "campaign": ["in_app"]}. Missing categories
    fall back to service defaults."""

    __tablename__ = "notification_preferences"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"),
        unique=True, index=True,
    )
    channels: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
