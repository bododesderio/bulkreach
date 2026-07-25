"""Report schemas (Section 2.2 — analytics + client-success PDF)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ChannelBreakdown(BaseModel):
    sms_sent: int = 0
    sms_failed: int = 0
    email_sent: int = 0
    email_failed: int = 0


class CampaignSummaryRow(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    status: str
    delivered: int
    failed: int
    delivery_rate: float  # percentage 0–100
    created_at: datetime
    completed_at: datetime | None = None


class DailyPoint(BaseModel):
    date: str  # YYYY-MM-DD
    delivered: int


class ReportSummary(BaseModel):
    period: str  # 7d | 30d | 90d | all
    campaigns: int
    recipients: int
    delivered: int
    failed: int
    delivery_rate: float  # percentage 0–100
    channels: ChannelBreakdown
    daily: list[DailyPoint]
    recent: list[CampaignSummaryRow]
