"""Admin-configurable payment providers + method routing (registry model).

Each supported gateway (Flutterwave, Pesapal, MTN MoMo direct, Airtel direct) has
one PaymentProviderConfig row holding its enabled flag, test/live mode, and its
credentials as an encrypted JSONB blob (secrets encrypted per-value via
app.core.crypto — never plaintext). A single PaymentSettings row maps each payment
method (mtn_momo | airtel_money | card) to the provider slug that handles it, so an
admin can, e.g., route cards through Flutterwave and MoMo through Pesapal.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPk

# Canonical provider slugs and the payment methods each can settle.
PROVIDER_SLUGS = ("flutterwave", "pesapal", "mtn_momo", "airtel", "simulator")
PAYMENT_METHODS = ("mtn_momo", "airtel_money", "card")


class PaymentProviderConfig(UUIDPk, TimestampMixin, Base):
    __tablename__ = "payment_providers"

    slug: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mode: Mapped[str] = mapped_column(String(10), default="test", nullable=False)  # test|live
    # Credentials as {field: value}; secret fields are stored encrypted (enc::…).
    credentials: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String(320))


class PaymentSettings(UUIDPk, TimestampMixin, Base):
    """Singleton row (id fixed) holding method→provider routing + defaults."""

    __tablename__ = "payment_settings"

    SINGLETON_ID = uuid.UUID("00000000-0000-0000-0000-0000000005e7")

    # {"mtn_momo": "flutterwave", "airtel_money": "flutterwave", "card": "flutterwave"}
    routing: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    default_currency: Mapped[str] = mapped_column(String(3), default="UGX", nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String(320))


class RawWebhookEvent(UUIDPk, Base):
    """Verbatim provider webhook payloads — stored before parsing for audit/replay
    (payments skill: raw-store discipline). Append-only; access-controlled."""

    __tablename__ = "payment_webhook_events"

    provider: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    signature_valid: Mapped[bool] = mapped_column(Boolean, nullable=False)
    tx_ref: Mapped[str | None] = mapped_column(String(120), index=True)
    source_ip: Mapped[str | None] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
