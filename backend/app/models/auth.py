# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Session infrastructure: rotating refresh tokens + an append-only auth-event log.

A `RefreshToken` row is one browser session. The opaque token (256-bit) lives only
in the httpOnly cookie; we store its sha256. Every /auth/refresh rotates the row
(old → revoked, new row in the same `family_id`); presenting an already-revoked
token means it leaked, so the whole family is revoked (theft detection).
`AuthEvent` is append-only — no UPDATE/DELETE — and powers the sessions/devices UI.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPk


class RefreshToken(UUIDPk, Base):
    """One rotating browser session. `token_hash` = sha256 of the 256-bit opaque
    cookie token; `family_id` groups a rotation chain for reuse (theft) detection."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_family", "family_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    family_id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(400))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # rotated | logout | reuse | user_revoked | revoke_others
    revoked_reason: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AuthEvent(UUIDPk, Base):
    """Append-only authentication audit (login/logout/refresh/refresh_reuse/…).
    No UPDATE or DELETE ever. Distinct from AuditLog: has user/account subject,
    user_agent, and a session link for the sessions/devices view."""

    __tablename__ = "auth_events"
    __table_args__ = (Index("ix_auth_events_user_created", "user_id", "created_at"),)

    account_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)
    # login | logout | refresh | refresh_reuse | session_revoked | revoke_others | password_changed
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    refresh_token_id: Mapped[uuid.UUID | None] = mapped_column(PgUUID(as_uuid=True))
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(400))
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
