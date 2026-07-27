"""Invoice + gapless invoice numbering (Section 14 — invoices/receipts, VAT).

An Invoice is a tax document issued when a subscription payment settles. It snapshots
the billing party and the VAT breakdown at issue time so a later plan/price change
never mutates history. Numbers are gapless per calendar year via `invoice_sequences`,
allocated under a row lock so concurrent settlements can't collide or skip.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPk


class InvoiceSequence(Base):
    """Per-year gapless counter. One row per calendar year; `last_number` is the
    highest number issued. Incremented with SELECT ... FOR UPDATE (see service)."""

    __tablename__ = "invoice_sequences"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Invoice(UUIDPk, Base):
    __tablename__ = "invoices"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL")
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("plans.id", ondelete="SET NULL")
    )

    number: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    # A paid invoice doubles as the receipt (kind reflects the dominant purpose).
    kind: Mapped[str] = mapped_column(String(20), default="receipt", nullable=False)  # invoice|receipt|credit_note
    status: Mapped[str] = mapped_column(String(20), default="paid", nullable=False)   # paid|due|void
    currency: Mapped[str] = mapped_column(String(3), default="UGX", nullable=False)

    # Money in minor-unit-free UGX (whole shillings). total = subtotal + vat.
    subtotal_ugx: Mapped[int] = mapped_column(BigInteger, nullable=False)  # net of VAT
    vat_rate: Mapped[float] = mapped_column(Float, nullable=False)
    vat_ugx: Mapped[int] = mapped_column(BigInteger, nullable=False)
    total_ugx: Mapped[int] = mapped_column(BigInteger, nullable=False)     # gross charged
    proration_credit_ugx: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    # Snapshots (immutable after issue).
    billing_name: Mapped[str] = mapped_column(String(255), nullable=False)
    billing_email: Mapped[str] = mapped_column(String(320), nullable=False)
    plan_name: Mapped[str | None] = mapped_column(String(50))
    line_items: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
