"""Team invitation schemas (Section 5.2)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class InviteCreate(BaseModel):
    email: EmailStr
    role: Literal["member", "admin"] = "member"


class InviteOut(BaseModel):
    id: UUID
    email: EmailStr
    role: str
    expires_at: datetime
    accepted: bool
    created_at: datetime
    dev_link: str | None = None  # non-production only, returned on create


class InvitePreview(BaseModel):
    valid: bool
    reason: str | None = None
    company_name: str | None = None
    email: EmailStr | None = None
    role: str | None = None
    existing_account: bool = False


class InviteAccept(BaseModel):
    full_name: str | None = Field(None, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    accept_terms: bool
    accept_privacy: bool
    accept_data_retention: bool
