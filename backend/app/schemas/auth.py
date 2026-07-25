"""Auth & account request/response schemas (Section 5.2)."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    account_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Explicit consent — must all be true (Section 23.2 'I agree' not pre-ticked)
    accept_terms: bool
    accept_privacy: bool
    accept_data_retention: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    role: str
    account_id: uuid.UUID
    last_login_at: datetime | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    email: EmailStr
    plan: str
    status: str
    logo_url: str | None = None
    report_header: str | None = None
    trial_messages_remaining: int
    trial_expires_at: datetime | None = None
    created_at: datetime


class MeResponse(BaseModel):
    user: UserOut
    account: AccountOut
