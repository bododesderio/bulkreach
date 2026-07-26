"""Plan, Subscription, Payment — Section 4.1 + Pricing (Section 14)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPk


class Plan(UUIDPk, Base):
    __tablename__ = "plans"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    price_ugx: Mapped[int] = mapped_column(BigInteger, nullable=False)
    messages_per_month: Mapped[int] = mapped_column(Integer, nullable=False)  # -1 = unlimited
    batch_size: Mapped[int] = mapped_column(Integer, default=20_000)
    features: Mapped[dict] = mapped_column(JSONB, default=dict)


class Subscription(UUIDPk, TimestampMixin, Base):
    __tablename__ = "subscriptions"

    # One active subscription per account — UNIQUE so the settlement upsert is
    # atomic and two concurrent successful payments can't duplicate it.
    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"),
        index=True, unique=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), ForeignKey("plans.id"))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|past_due|cancelled
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    flutterwave_subscription_id: Mapped[str | None] = mapped_column(String(120))


class Payment(UUIDPk, Base):
    __tablename__ = "payments"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    amount_ugx: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="UGX", nullable=False)
    method: Mapped[str] = mapped_column(String(30))  # mtn_momo|airtel_money|card
    # State machine: created → pending → successful|failed|timeout (payments skill).
    status: Mapped[str] = mapped_column(String(20), default="created", index=True)
    purpose: Mapped[str] = mapped_column(String(30), default="subscription")  # subscription|topup
    # Provider registry fields (provider-agnostic; supersede flutterwave_tx_id).
    provider: Mapped[str | None] = mapped_column(String(30), index=True)
    provider_tx_id: Mapped[str | None] = mapped_column(String(160), index=True)
    tx_ref: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL")
    )
    # Last provider payload seen (verify/webhook) — audit trail, never trusted raw.
    raw_response: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # Legacy column retained for back-compat with the initial schema.
    flutterwave_tx_id: Mapped[str | None] = mapped_column(String(120), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
