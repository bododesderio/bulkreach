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


class SignupCompleteRequest(RegisterRequest):
    """Step 2 of multi-step signup — account details (carried from step 1) plus
    consent. Creates the account and triggers email verification."""
    contact_name: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=32)
    accept_marketing: bool = False


class SignupCompleteResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    email: EmailStr
    # Non-production convenience: the OTP so dev/tests can complete the flow
    # without a mail server. Always null in production.
    dev_code: str | None = None


class VerifyEmailRequest(BaseModel):
    code: str = Field(min_length=4, max_length=8)


class ActivatePasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class ResendResponse(BaseModel):
    sent: bool
    dev_code: str | None = None


class OnboardingRequest(BaseModel):
    industry: str | None = Field(None, max_length=60)
    use_case: list[str] | None = None
    referral_source: str | None = Field(None, max_length=60)


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
    email_verified: bool = False
    user_type: str = "self_service"
    must_change_password: bool = False
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
