# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Per-account suppression list — addresses that must not be sent to again.

Populated by delivery-report ingestion (hard bounces, spam complaints), inbound
STOP, and manual admin action. `materialise_and_queue` skips any recipient whose
phone/email is suppressed for the campaign's channel, protecting sender reputation
and honouring opt-outs (Section 20)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPk


class Suppression(UUIDPk, Base):
    __tablename__ = "suppressions"
    __table_args__ = (
        UniqueConstraint("account_id", "channel", "address", name="uq_suppression_addr"),
        Index("ix_suppression_lookup", "account_id", "channel", "address"),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(10), nullable=False)  # sms|email
    address: Mapped[str] = mapped_column(String(320), nullable=False)  # E.164 or email (lowercased)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)  # bounce|complaint|unsubscribe|manual
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
