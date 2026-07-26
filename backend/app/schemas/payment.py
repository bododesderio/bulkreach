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

    model_config = {"from_attributes": True}


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
