# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Auth endpoints (Section 5.2): register, login, refresh, logout, forgot/reset password."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.net import client_ip
from app.core.redis import sliding_window_allow
from app.core.security import create_access_token
from app.services.auth_session import (
    SessionError,
    clear_refresh_cookie,
    issue_session,
    record_auth_event,
    revoke_by_raw,
    rotate,
    set_refresh_cookie,
)
from app.schemas.auth import (
    AccountOut,
    ActivatePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MeResponse,
    OnboardingRequest,
    RegisterRequest,
    ResendResponse,
    ResetPasswordRequest,
    SignupCompleteRequest,
    SignupCompleteResponse,
    TokenResponse,
    UserOut,
    VerifyEmailRequest,
)
from app.core.security import hash_password
from app.services import auth_service, otp
from app.services.audit import record_audit
from app.services.email import send_email
from app.models.account import Account

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return client_ip(request) or "0.0.0.0"


def _tokens(user_id: str) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user_id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    ip = _client_ip(request)
    account, user = await auth_service.register_account(
        db, data, ip=ip, user_agent=request.headers.get("user-agent", "unknown")
    )
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="account.register",
        resource_type="account", resource_id=str(account.id), ip_address=ip,
    )
    raw, _row = await issue_session(db, user, request)
    set_refresh_cookie(response, raw)
    return _tokens(str(user.id))


# ── Multi-step signup (Section 5.2): complete → verify email → onboarding ─────
@router.post("/signup/complete", response_model=SignupCompleteResponse,
             status_code=status.HTTP_201_CREATED)
async def signup_complete(
    data: SignupCompleteRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SignupCompleteResponse:
    ip = _client_ip(request)
    account, user = await auth_service.register_account(
        db, data, ip=ip, user_agent=request.headers.get("user-agent", "unknown")
    )
    account.contact_name = data.contact_name
    account.phone = data.phone
    account.marketing_opt_in = data.accept_marketing

    code = await otp.issue(db, user.id)
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="account.register",
        resource_type="account", resource_id=str(account.id), ip_address=ip,
    )
    await send_email(
        to=user.email,
        subject="Verify your BulkReach email",
        html=(
            f"<p>Welcome to BulkReach!</p><p>Your verification code is "
            f"<strong style='font-size:20px;letter-spacing:2px'>{code}</strong>. "
            f"It expires in 15 minutes.</p>"
        ),
    )
    raw, _row = await issue_session(db, user, request)
    set_refresh_cookie(response, raw)
    return SignupCompleteResponse(
        access_token=create_access_token(str(user.id)),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        email=user.email,
        dev_code=None if settings.is_production else code,
    )


@router.post("/verify-email")
async def verify_email(
    data: VerifyEmailRequest,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    ok, reason = await otp.verify(db, user.id, data.code)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, {
            "expired": "This code has expired. Request a new one.",
            "too_many": "Too many incorrect attempts. Request a new code.",
            "no_code": "No active code — request a new one.",
            "invalid": "Incorrect code.",
        }.get(reason, "Verification failed."))
    user.email_verified = True
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="account.email_verified",
        resource_type="user", resource_id=str(user.id),
    )
    return {"email_verified": True}


@router.post("/resend-verification", response_model=ResendResponse)
async def resend_verification(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResendResponse:
    if not await sliding_window_allow(f"rl:otp:{user.id}", 3, 3600):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many code requests. Try again later.")
    code = await otp.issue(db, user.id)
    sent = await send_email(
        to=user.email, subject="Your BulkReach verification code",
        html=f"<p>Your new verification code is <strong>{code}</strong> (expires in 15 minutes).</p>",
    )
    return ResendResponse(sent=bool(sent), dev_code=None if settings.is_production else code)


@router.patch("/onboarding")
async def onboarding(
    data: OnboardingRequest,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    account = await db.get(Account, user.account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    if data.industry is not None:
        account.industry = data.industry
    if data.use_case is not None:
        account.use_case = data.use_case
    if data.referral_source is not None:
        account.referral_source = data.referral_source
    return {"status": "ok"}


@router.post("/activate-password")
async def activate_password(
    data: ActivatePasswordRequest,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Set a new password and clear the must-change-password flag (managed-portal
    first login, Section 5.2)."""
    user.hashed_password = hash_password(data.new_password)
    user.must_change_password = False
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="account.password_changed",
        resource_type="user", resource_id=str(user.id),
    )
    try:
        from app.services.notifications import notify

        await notify(
            db, account_id=user.account_id, user_id=user.id, type="security.password_changed",
            level="warning", title="Your password was changed",
            body="Your BulkReach password was just set. If this wasn't you, contact support immediately.",
            email_to=user.email, force_email=True,
        )
    except Exception:  # noqa: BLE001 — a security notice must not block the password change
        pass
    return {"status": "ok", "must_change_password": False}


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    ip = _client_ip(request)
    # Rate limit two ways (Section 13.4): per-IP (max 5 / 15 min) stops one host
    # hammering many accounts; per-account (by email) stops an attacker rotating
    # source IPs from brute-forcing a single account under the per-IP ceiling.
    per_ip = await sliding_window_allow(
        f"rl:login:{ip}", settings.RATE_LIMIT_LOGIN_MAX, settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS
    )
    per_account = await sliding_window_allow(
        f"rl:login:acct:{data.email.strip().lower()}",
        settings.RATE_LIMIT_LOGIN_ACCOUNT_MAX,
        settings.RATE_LIMIT_LOGIN_ACCOUNT_WINDOW_SECONDS,
    )
    if not (per_ip and per_account):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many login attempts. Try again later.")

    user = await auth_service.authenticate(db, data.email, data.password)
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="account.login",
        resource_type="user", resource_id=str(user.id), ip_address=ip,
    )
    raw, _row = await issue_session(db, user, request)
    set_refresh_cookie(response, raw)
    return _tokens(str(user.id))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_db)]
) -> TokenResponse:
    """Rotate the refresh cookie and mint a fresh access token. Rotation revokes
    the presented token; replaying a revoked token burns the whole family."""
    from app.services.auth_session import REFRESH_COOKIE

    try:
        new_raw, row = await rotate(db, request.cookies.get(REFRESH_COOKIE), request)
    except SessionError as e:
        clear_refresh_cookie(response)
        await db.commit()  # persist family-revocation / reuse event even on failure
        raise HTTPException(e.status_code, e.detail)
    set_refresh_cookie(response, new_raw)
    return _tokens(str(row.user_id))


@router.post("/logout")
async def logout(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    from app.services.auth_session import REFRESH_COOKIE

    row = await revoke_by_raw(
        db, request.cookies.get(REFRESH_COOKIE), reason="logout", request=request
    )
    if row is not None:
        await record_auth_event(
            db, account_id=row.account_id, user_id=row.user_id,
            event_type="logout", request=request, refresh_token_id=row.id,
        )
    await db.commit()
    clear_refresh_cookie(response)
    return {"message": "Logged out."}


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    data: ForgotPasswordRequest, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    from sqlalchemy import select
    from app.models.account import User

    user = await db.scalar(select(User).where(User.email == data.email))
    if user:  # Never reveal whether the email exists
        token = auth_service.make_reset_token(user)
        link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        await send_email(
            to=user.email,
            subject="Reset your BulkReach password",
            html=f'<p>Reset your password: <a href="{link}">{link}</a></p><p>This link expires in 1 hour.</p>',
            plain=f"Reset your password: {link} (expires in 1 hour)",
        )
    return {"message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    await auth_service.apply_password_reset(db, data.token, data.new_password)
    return {"message": "Password updated."}


@router.get("/me", response_model=MeResponse)
async def me(user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]) -> MeResponse:
    account = await db.get(Account, user.account_id)
    return MeResponse(user=UserOut.model_validate(user), account=AccountOut.model_validate(account))
