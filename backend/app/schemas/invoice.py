"""Invoice / billing API schemas (Section 14)."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class InvoiceOut(BaseModel):
    id: UUID
    number: str
    kind: str
    status: str
    currency: str
    subtotal_ugx: int
    vat_rate: float
    vat_ugx: int
    total_ugx: int
    proration_credit_ugx: int
    plan_name: str | None = None
    period_start: datetime | None = None
    period_end: datetime | None = None
    issued_at: datetime

    model_config = {"from_attributes": True}


class ProrationPreview(BaseModel):
    plan_id: UUID
    base_price_ugx: int
    credit_ugx: int
    amount_due_ugx: int
    days_remaining: int
    applies: bool


class AutoRenewUpdate(BaseModel):
    auto_renew: bool


class SubscriptionStateOut(BaseModel):
    """Client-facing subscription health for the billing page."""
    status: str  # none|active|past_due|cancelled
    plan: str
    auto_renew: bool = True
    current_period_end: datetime | None = None
    dunning_stage: int = 0
    grace_until: datetime | None = None
