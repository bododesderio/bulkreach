"""Archive-database ORM models (Sections 19-20).

These live in a completely separate PostgreSQL instance (ArchiveBase metadata).
Retention behaviour is enforced by the retention engine, never by hard deletes on
contact records (anonymisation only — Section 23.4).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import ArchiveBase


class ArchivedCampaign(ArchiveBase):
    __tablename__ = "archived_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)  # live id
    account_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    account_name: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20))
    # Immutable message snapshot exactly as sent (Section 19.1)
    sms_body: Mapped[str | None] = mapped_column(Text)
    email_subject: Mapped[str | None] = mapped_column(String(500))
    email_html_body: Mapped[str | None] = mapped_column(Text)
    email_plain_body: Mapped[str | None] = mapped_column(Text)
    from_name: Mapped[str | None] = mapped_column(String(255))
    from_email: Mapped[str | None] = mapped_column(String(320))
    sms_sender_id: Mapped[str | None] = mapped_column(String(20))
    messages_sent: Mapped[int] = mapped_column(Integer, default=0)
    sms_sent: Mapped[int] = mapped_column(Integer, default=0)
    sms_failed: Mapped[int] = mapped_column(Integer, default=0)
    email_sent: Mapped[int] = mapped_column(Integer, default=0)
    email_failed: Mapped[int] = mapped_column(Integer, default=0)
    contact_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    legal_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    never_delete: Mapped[bool] = mapped_column(Boolean, default=False)


class MasterContact(ArchiveBase):
    """Global contact registry — deduped by phone/email, retained forever (19.2)."""

    __tablename__ = "master_contacts"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)  # E.164 or sha256
    email: Mapped[str | None] = mapped_column(String(320), unique=True, index=True)  # or sha256
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    raw_data: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    source_filename: Mapped[str | None] = mapped_column(String(512))
    source_format: Mapped[str | None] = mapped_column(String(20))
    account_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)
    account_name: Mapped[str | None] = mapped_column(String(255))
    campaign_appearances: Mapped[list] = mapped_column(ARRAY(PgUUID(as_uuid=True)), default=list)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    anonymised_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    legal_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    never_delete: Mapped[bool] = mapped_column(Boolean, default=False)


class ArchivedReport(ArchiveBase):
    __tablename__ = "archived_reports"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)
    type: Mapped[str] = mapped_column(String(20))
    file_url: Mapped[str | None] = mapped_column(String(1024))
    storage_class: Mapped[str] = mapped_column(String(20), default="standard")  # standard|glacier
    retrieval_available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    emailed_to: Mapped[str | None] = mapped_column(String(320))
    emailed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ArchivedPayment(ArchiveBase):
    __tablename__ = "archived_payments"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    account_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), index=True)
    account_name: Mapped[str | None] = mapped_column(String(255))
    amount_ugx: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(8), default="UGX")
    method: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str | None] = mapped_column(String(20))
    flutterwave_tx_id: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ArchivedSourceFile(ArchiveBase):
    """File manifest — Section 19.6. checksum kept even after file deletion."""

    __tablename__ = "archived_source_files"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)
    account_name: Mapped[str | None] = mapped_column(String(255))
    contact_list_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    filename: Mapped[str] = mapped_column(String(512))
    format: Mapped[str] = mapped_column(String(20))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    s3_key: Mapped[str | None] = mapped_column(String(1024))
    storage_class: Mapped[str] = mapped_column(String(20), default="standard")
    checksum_sha256: Mapped[str | None] = mapped_column(String(64))
    upload_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    file_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RetentionRule(ArchiveBase):
    __tablename__ = "retention_rules"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain: Mapped[str] = mapped_column(String(50), index=True)  # data domain name
    account_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)  # null=global
    retention_months: Mapped[int | None] = mapped_column(Integer)  # null = never delete
    never_delete: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class LegalHold(ArchiveBase):
    __tablename__ = "legal_holds"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resource_type: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[str] = mapped_column(String(120), index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    placed_by: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    placed_by_email: Mapped[str | None] = mapped_column(String(320))
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    lifted_by: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    lifted_reason: Mapped[str | None] = mapped_column(Text)
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class ErasureRequest(ArchiveBase):
    __tablename__ = "erasure_requests"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contact_phone: Mapped[str | None] = mapped_column(String(64))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    master_contact_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    requested_by: Mapped[str | None] = mapped_column(String(320))
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|completed
    executed_by: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ArchiveAccessLog(ArchiveBase):
    """Append-only. No UPDATE/DELETE ever (Section 13.1, 23.6)."""

    __tablename__ = "archive_access_log"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    actor_email: Mapped[str | None] = mapped_column(String(320))
    session_id: Mapped[str | None] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(60))  # view|search|download|anonymise|hold|lift|erase|export
    resource_type: Mapped[str | None] = mapped_column(String(60))
    resource_id: Mapped[str | None] = mapped_column(String(120))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
