# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Contact list / import schemas (Section 5.3)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ContactListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    source_filename: str | None = None
    source_format: str | None = None
    total_contacts: int
    valid_contacts: int
    duplicate_count: int
    columns: list[str] = []
    phone_column: str | None = None
    email_column: str | None = None
    merge_columns: list[str] = []
    created_at: datetime


class ImportResult(BaseModel):
    """Returned after an upload/paste so the composer can confirm column mapping."""
    list: ContactListOut
    error_count: int
    errors: list[str] = []
    preview: list[dict] = []  # first few contacts' raw_data + phone/email


class PasteRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1)


class MapColumnsRequest(BaseModel):
    phone_column: str | None = None
    email_column: str | None = None


class ContactRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    phone: str | None = None
    email: str | None = None
    raw_data: dict = {}
    is_valid: bool
    tags: list[str] = []


class PaginatedContacts(BaseModel):
    items: list[ContactRow]
    total: int
    page: int
    page_size: int
