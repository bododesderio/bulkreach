"""Account, User, ApiKey, AuditLog — Section 4.1 + consent fields (Section 23.3)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPk


class Account(UUIDPk, TimestampMixin, Base):
    __tablename__ = "accounts"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="trial", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(1024))
    report_header: Mapped[str | None] = mapped_column(Text)

    # Soft delete (Section 20.2 unsubscribed account)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Consent record (Section 23.3) — set server-side, immutable after creation
    accepted_terms_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_privacy_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_data_retention_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    terms_acceptance_ip: Mapped[str] = mapped_column(INET, nullable=False)
    terms_acceptance_user_agent: Mapped[str] = mapped_column(Text, nullable=False)

    # Trial / usage
    trial_messages_remaining: Mapped[int] = mapped_column(default=500, nullable=False)
    trial_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Profile + onboarding (multi-step signup, Section 5.2)
    contact_name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    industry: Mapped[str | None] = mapped_column(String(60))
    use_case: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    referral_source: Mapped[str | None] = mapped_column(String(60))

    users: Mapped[list["User"]] = relationship(back_populates="account")


class User(UUIDPk, TimestampMixin, Base):
    __tablename__ = "users"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # owner | admin | member | superadmin
    role: Mapped[str] = mapped_column(String(20), default="owner", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    account: Mapped[Account] = relationship(back_populates="users")


class EmailVerificationToken(UUIDPk, Base):
    """One-time 6-digit email OTP (Section 5.2). Code stored bcrypt-hashed;
    15-minute expiry; a resend invalidates prior codes for the user."""

    __tablename__ = "email_verification_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class InvitationToken(UUIDPk, Base):
    """Team-member invite (Section 5.2). token_hash = sha256 of a 256-bit random
    token (high entropy → sha256 lookup is safe + indexable); 72-hour expiry;
    single-use (accepted flips true)."""

    __tablename__ = "invitation_tokens"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="member", nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    invited_by_email: Mapped[str | None] = mapped_column(String(320))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ApiKey(UUIDPk, TimestampMixin, Base):
    __tablename__ = "api_keys"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AuditLog(UUIDPk, Base):
    """Append-only. No UPDATE or DELETE ever permitted (Section 4.1)."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_resource", "resource_type", "resource_id"),)

    actor_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    actor_email: Mapped[str | None] = mapped_column(String(320))
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(120))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    ip_address: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
