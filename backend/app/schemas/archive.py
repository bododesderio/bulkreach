"""Archive subsystem (superadmin) schemas — governance over the separate
archive DB: stats, retention, anonymisation, erasure, legal holds, access log."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ArchiveStats(BaseModel):
    archived_campaigns: int
    master_contacts: int
    anonymised_contacts: int
    archived_payments: int
    archived_reports: int
    active_legal_holds: int
    pending_erasures: int
    oldest_archived_at: datetime | None
    storage_estimate_bytes: int
    live_retention_months: int
    clickhouse_events: int | None = None


class RetentionBucket(BaseModel):
    period: str
    campaigns: int
    state: str  # hot | warm | glacier


class RetentionRuleOut(BaseModel):
    id: UUID
    domain: str
    account_id: UUID | None
    retention_months: int | None
    never_delete: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class RetentionRuleUpsert(BaseModel):
    domain: str = Field(min_length=1, max_length=50)
    retention_months: int | None = Field(None, ge=0)
    never_delete: bool = False


class MasterContactOut(BaseModel):
    id: UUID
    phone: str | None
    email: str | None
    first_name: str | None
    last_name: str | None
    account_name: str | None
    campaign_count: int
    first_seen_at: datetime
    last_seen_at: datetime
    anonymised_at: datetime | None
    legal_hold: bool


class LegalHoldOut(BaseModel):
    id: UUID
    resource_type: str
    resource_id: str
    reason: str
    placed_by_email: str | None
    placed_at: datetime
    lifted_at: datetime | None
    is_active: bool

    model_config = {"from_attributes": True}


class LegalHoldCreate(BaseModel):
    resource_type: str = Field(min_length=1, max_length=50)
    resource_id: str = Field(min_length=1, max_length=120)
    reason: str = Field(min_length=1)


class LegalHoldLift(BaseModel):
    reason: str = Field(min_length=1)


class ErasureRequestOut(BaseModel):
    id: UUID
    contact_phone: str | None
    contact_email: str | None
    master_contact_id: UUID | None
    requested_by: str | None
    status: str
    executed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ErasureCreate(BaseModel):
    contact_phone: str | None = None
    contact_email: str | None = None
    requested_by: str | None = Field(None, max_length=320)


class AccessLogOut(BaseModel):
    id: UUID
    actor_email: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    ip_address: str | None
    created_at: datetime


class RetentionResult(BaseModel):
    dry_run: bool
    campaigns_purgeable: int
    contacts_anonymisable: int
    campaigns_purged: int
    contacts_anonymised: int


class IngestResult(BaseModel):
    campaigns_ingested: int
    reports_ingested: int
    payments_ingested: int
    contacts_upserted: int


class ExportOut(BaseModel):
    id: UUID
    filename: str
    format: str
    size_bytes: int | None
    storage_class: str
    s3_key: str | None
    archived_at: datetime

    model_config = {"from_attributes": True}


class ExportCreate(BaseModel):
    domain: str = Field("campaigns", pattern="^(campaigns|payments|contacts)$")
