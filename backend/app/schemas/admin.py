"""Admin portal (superadmin) schemas — overview, accounts, campaigns, audit,
managed-service workflow, health, revenue. Read-mostly; money-safe writes live
in the payments/plans routers."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# ── Overview / dashboard ────────────────────────────────────────────────────
class OverviewKPIs(BaseModel):
    total_clients: int
    new_clients: int
    revenue_ugx: int
    revenue_change_pct: float
    messages: int
    messages_change_pct: float
    managed_queue_pending: int


class RevenueByPlan(BaseModel):
    name: str
    accounts: int
    mrr_ugx: int


class ActivityItem(BaseModel):
    id: str
    kind: str  # signup | payment | campaign | managed | system
    text: str
    meta: str
    when: datetime


class OverviewResponse(BaseModel):
    period: str
    kpis: OverviewKPIs
    revenue_by_plan: list[RevenueByPlan]
    activity: list[ActivityItem]


# ── Staff / users (for manager assignment) ──────────────────────────────────
class AdminUserOut(BaseModel):
    id: UUID
    email: str
    role: str
    account_name: str | None = None
    last_login_at: datetime | None = None


# ── Accounts ────────────────────────────────────────────────────────────────
class AdminAccountOut(BaseModel):
    id: UUID
    name: str
    email: str
    plan: str
    status: str
    is_active: bool
    joined: datetime
    messages_month: int
    mrr_ugx: int


class AdminAccountsResponse(BaseModel):
    items: list[AdminAccountOut]
    stats: dict


class AccountCampaignBrief(BaseModel):
    id: UUID
    name: str
    type: str
    status: str
    messages_sent: int
    created_at: datetime


class AdminAccountDetail(BaseModel):
    account: AdminAccountOut
    subscription: dict | None = None
    recent_campaigns: list[AccountCampaignBrief]
    recent_payments: list[dict]
    users_count: int


# ── Campaigns (cross-account) ────────────────────────────────────────────────
class AdminCampaignOut(BaseModel):
    id: UUID
    account_id: UUID
    account_name: str | None
    name: str
    channel: str
    audience: int
    sent: int
    delivered: int
    failed: int
    status: str
    progress: int
    when: datetime


class AdminCampaignsResponse(BaseModel):
    items: list[AdminCampaignOut]
    stats: dict


# ── Audit log ────────────────────────────────────────────────────────────────
class AuditEntryOut(BaseModel):
    id: UUID
    actor_email: str | None
    action: str
    resource_type: str
    resource_id: str | None
    ip_address: str | None
    severity: str
    created_at: datetime


class AuditResponse(BaseModel):
    items: list[AuditEntryOut]
    total: int


# ── Managed-service workflow ─────────────────────────────────────────────────
class ManagedOut(BaseModel):
    id: UUID
    account_id: UUID
    account_name: str | None
    campaign_id: UUID | None
    campaign_name: str | None
    channel: str | None
    audience: int | None
    brief_text: str
    status: str
    account_manager_id: UUID | None
    account_manager_email: str | None
    approved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    report_ready: bool = False
    report_url: str | None = None


class ManagedResponse(BaseModel):
    items: list[ManagedOut]
    stats: dict


class ManagedCreate(BaseModel):
    account_id: UUID
    brief_text: str
    campaign_id: UUID | None = None


class ManagedUpdate(BaseModel):
    status: str | None = None  # must be a valid forward transition
    account_manager_id: UUID | None = None
    brief_text: str | None = None
    campaign_id: UUID | None = None  # link the campaign this managed job ran


# ── Health ───────────────────────────────────────────────────────────────────
class HealthService(BaseModel):
    name: str
    category: str
    status: str  # operational | degraded | down
    latency_ms: int | None
    detail: str


class HealthResponse(BaseModel):
    overall: str
    services: list[HealthService]
    checked_at: datetime


# ── Revenue analytics ────────────────────────────────────────────────────────
class RevenueTotals(BaseModel):
    mrr_ugx: int
    collected_ugx: int
    outstanding_ugx: int
    arpu_ugx: int


class RevenuePoint(BaseModel):
    month: str
    revenue: int


class MethodSplit(BaseModel):
    method: str
    share_pct: float
    value_ugx: int


class RevenueResponse(BaseModel):
    period: str
    totals: RevenueTotals
    series: list[RevenuePoint]
    method_split: list[MethodSplit]
