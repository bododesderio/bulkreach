# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""ContactList, Contact — Section 4.1."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPk


class ContactList(UUIDPk, TimestampMixin, Base):
    __tablename__ = "contact_lists"

    account_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_filename: Mapped[str | None] = mapped_column(String(512))
    source_format: Mapped[str] = mapped_column(String(20))  # csv|xlsx|docx|pdf|paste
    source_s3_key: Mapped[str | None] = mapped_column(String(1024))
    total_contacts: Mapped[int] = mapped_column(Integer, default=0)
    valid_contacts: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, default=0)
    columns: Mapped[list] = mapped_column(JSONB, default=list)
    phone_column: Mapped[str | None] = mapped_column(String(255))
    email_column: Mapped[str | None] = mapped_column(String(255))
    merge_columns: Mapped[list] = mapped_column(JSONB, default=list)
    checksum_sha256: Mapped[str | None] = mapped_column(String(64))

    contacts: Mapped[list["Contact"]] = relationship(
        back_populates="list", cascade="all, delete-orphan"
    )


class Contact(UUIDPk, TimestampMixin, Base):
    __tablename__ = "contacts"

    list_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contact_lists.id", ondelete="CASCADE"), index=True
    )
    phone: Mapped[str | None] = mapped_column(String(20), index=True)  # E.164
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    raw_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    validation_error: Mapped[str | None] = mapped_column(Text)
    # Free-form labels for segmentation; a campaign can target contacts by tag.
    tags: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)

    list: Mapped[ContactList] = relationship(back_populates="contacts")
