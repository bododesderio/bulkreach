# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Campaign schemas (Section 5.x campaigns API)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CampaignType = Literal["sms", "email", "both"]


class CampaignBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: CampaignType
    contact_list_id: uuid.UUID | None = None
    audience_tags: list[str] = Field(default_factory=list)  # segment filter (any-of)
    sms_body: str | None = Field(default=None, max_length=1600)
    sms_sender_id: str | None = Field(default=None, max_length=20)
    email_subject: str | None = Field(default=None, max_length=500)
    email_html_body: str | None = None
    email_plain_body: str | None = None
    from_email: str | None = Field(default=None, max_length=320)
    from_name: str | None = Field(default=None, max_length=255)


class CampaignCreate(CampaignBase):
    scheduled_at: datetime | None = None

    @model_validator(mode="after")
    def _require_channel_content(self) -> "CampaignCreate":
        if self.type in ("sms", "both") and not (self.sms_body and self.sms_body.strip()):
            raise ValueError("sms_body is required for SMS campaigns.")
        if self.type in ("email", "both"):
            if not (self.email_subject and self.email_subject.strip()):
                raise ValueError("email_subject is required for email campaigns.")
            if not (self.email_html_body and self.email_html_body.strip()):
                raise ValueError("email_html_body is required for email campaigns.")
        return self


class CampaignUpdate(BaseModel):
    """Partial update — only allowed while the campaign is a draft."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: CampaignType | None = None
    contact_list_id: uuid.UUID | None = None
    sms_body: str | None = None
    sms_sender_id: str | None = None
    email_subject: str | None = None
    email_html_body: str | None = None
    email_plain_body: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    scheduled_at: datetime | None = None


class CampaignStats(BaseModel):
    total: int = 0
    queued: int = 0
    sending: int = 0
    sent: int = 0
    failed: int = 0
    sms_sent: int = 0
    sms_failed: int = 0
    email_sent: int = 0
    email_failed: int = 0
    # DLR-derived (0 until delivery reports arrive): confirmed delivered vs hard
    # bounces/complaints, and the share of accepted messages confirmed delivered.
    delivered: int = 0
    bounced: int = 0
    delivery_rate: float = 0.0  # sent / (sent+failed) — provider acceptance
    delivered_rate: float = 0.0  # delivered / sent — DLR-confirmed delivery
    clicks: int = 0  # total link redirects across the campaign's tracked links
    click_rate: float = 0.0  # clicks / sent — click-through rate


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    account_id: uuid.UUID
    contact_list_id: uuid.UUID | None = None
    audience_tags: list[str] = []
    name: str
    type: str
    status: str
    sms_body: str | None = None
    sms_sender_id: str | None = None
    email_subject: str | None = None
    email_html_body: str | None = None
    email_plain_body: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    messages_sent: int = 0
    sms_sent: int = 0
    sms_failed: int = 0
    email_sent: int = 0
    email_failed: int = 0
    elapsed_seconds: float | None = None
    error_message: str | None = None
    created_at: datetime


class CampaignDetail(CampaignOut):
    stats: CampaignStats | None = None
    recipient_estimate: int | None = None


class PaginatedCampaigns(BaseModel):
    items: list[CampaignOut]
    total: int
    page: int
    page_size: int


class ScheduleRequest(BaseModel):
    scheduled_at: datetime


class SendResponse(BaseModel):
    id: uuid.UUID
    status: str
    queued_messages: int
    recipients: int


class PreviewRequest(BaseModel):
    # If omitted, the first valid contact of the campaign's list is used.
    sample: dict[str, str] | None = None


class SmsSegmentInfo(BaseModel):
    encoding: str
    length: int
    parts: int


class PreviewOut(BaseModel):
    sms_body: str | None = None
    sms_segments: SmsSegmentInfo | None = None
    email_subject: str | None = None
    email_html_body: str | None = None
    sample: dict[str, str] = {}


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    channel: str
    recipient: str
    status: str
    attempts: int
    provider: str | None = None
    provider_message_id: str | None = None
    error_reason: str | None = None
    sent_at: datetime | None = None


class PaginatedMessages(BaseModel):
    items: list[MessageOut]
    total: int
    page: int
    page_size: int


class ProviderInfo(BaseModel):
    active_sms: str
    active_email: str
    sms: dict[str, bool]
    email: dict[str, bool]
    simulator_forced: bool
