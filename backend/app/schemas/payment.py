"""Payment API schemas — client checkout + admin provider config."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Method = Literal["mtn_momo", "airtel_money", "card"]
Mode = Literal["test", "live"]


# ---- Client checkout ----
class CheckoutRequest(BaseModel):
    plan_id: UUID
    method: Method
    phone: str = Field("", max_length=20)  # required for MoMo/Airtel USSD push
    purpose: Literal["subscription"] = "subscription"


class CheckoutResponse(BaseModel):
    payment_id: UUID
    tx_ref: str
    status: str
    redirect_url: str | None = None  # None → USSD push (check phone)


class PaymentMethodOut(BaseModel):
    method: Method
    provider: str
    provider_name: str


class PlanOut(BaseModel):
    id: UUID
    name: str
    price_ugx: int
    messages_per_month: int
    batch_size: int
    features: dict
    period: str = "month"
    featured: bool = False

    model_config = {"from_attributes": True}


Period = Literal["month", "quarter", "year"]
PlanStatus = Literal["active", "hidden"]


class AdminPlanOut(BaseModel):
    id: UUID
    name: str
    price_ugx: int
    messages_per_month: int
    batch_size: int
    features: dict
    period: str
    status: str
    featured: bool
    display_order: int
    subscriber_count: int = 0

    model_config = {"from_attributes": True}


class PlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    price_ugx: int = Field(ge=0)
    messages_per_month: int = Field(-1)  # -1 = unlimited
    batch_size: int = Field(20_000, ge=1)
    period: Period = "month"
    status: PlanStatus = "active"
    featured: bool = False
    display_order: int = 100
    features: dict = Field(default_factory=dict)  # {bullets: [...], gates: {...}}


class PlanUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    price_ugx: int | None = Field(None, ge=0)
    messages_per_month: int | None = None
    batch_size: int | None = Field(None, ge=1)
    period: Period | None = None
    status: PlanStatus | None = None
    featured: bool | None = None
    display_order: int | None = None
    features: dict | None = None


class PaymentOut(BaseModel):
    id: UUID
    tx_ref: str
    amount_ugx: int
    currency: str
    method: str | None
    status: str
    provider: str | None
    purpose: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---- Admin provider config ----
class CredentialFieldMeta(BaseModel):
    key: str
    label: str
    secret: bool
    required: bool
    placeholder: str


class ProviderConfigOut(BaseModel):
    slug: str
    display_name: str
    enabled: bool
    mode: Mode
    supported_methods: list[str]
    credential_fields: list[CredentialFieldMeta]
    # Secret values are masked (••••1234); non-secret values returned as-is.
    credentials: dict[str, str]


class ProviderConfigUpdate(BaseModel):
    enabled: bool | None = None
    mode: Mode | None = None
    # Only keys present are updated; a masked value (unchanged) is ignored server-side.
    credentials: dict[str, str] | None = None


class RoutingOut(BaseModel):
    routing: dict[str, str]
    default_currency: str


class RoutingUpdate(BaseModel):
    routing: dict[str, str]
    default_currency: str = "UGX"


# ---- Admin billing data ----
class RefundRequest(BaseModel):
    reason: str = Field("", max_length=255)


class AdminPaymentOut(BaseModel):
    id: UUID
    tx_ref: str
    account_id: UUID
    account_name: str | None = None
    account_email: str | None = None
    amount_ugx: int
    currency: str
    method: str | None
    status: str
    provider: str | None
    purpose: str
    created_at: datetime
    refunded_at: datetime | None = None


class AdminPaymentsResponse(BaseModel):
    items: list[AdminPaymentOut]
    stats: dict


class AdminSubscriptionOut(BaseModel):
    id: UUID
    account_id: UUID
    account_name: str | None = None
    account_email: str | None = None
    plan_name: str | None = None
    price_ugx: int | None = None
    status: str
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None


class AdminSubscriptionsResponse(BaseModel):
    items: list[AdminSubscriptionOut]
    stats: dict
