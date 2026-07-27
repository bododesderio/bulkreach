"""Auth endpoints (Section 5.2): register, login, refresh, logout, forgot/reset password."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.redis import sliding_window_allow
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.schemas.auth import (
    AccountOut,
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
from app.services import auth_service, otp
from app.services.audit import record_audit
from app.services.email import send_email
from app.models.account import Account

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "bulkreach_refresh"


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "0.0.0.0")


def _set_refresh_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        create_refresh_token(user_id),
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
    )


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
    _set_refresh_cookie(response, str(user.id))
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
    _set_refresh_cookie(response, str(user.id))
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


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    ip = _client_ip(request)
    # Rate limit: max 5 failed logins / 15 min / IP (Section 13.4)
    allowed = await sliding_window_allow(
        f"rl:login:{ip}", settings.RATE_LIMIT_LOGIN_MAX, settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS
    )
    if not allowed:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many login attempts. Try again later.")

    user = await auth_service.authenticate(db, data.email, data.password)
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="account.login",
        resource_type="user", resource_id=str(user.id), ip_address=ip,
    )
    _set_refresh_cookie(response, str(user.id))
    return _tokens(str(user.id))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> TokenResponse:
    token = request.cookies.get(REFRESH_COOKIE)
    payload = decode_token(token) if token else None
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token.")
    # Re-validate against the DB — a refresh cookie must not outlive a
    # suspended/deleted user or account.
    from uuid import UUID

    from app.models.account import User

    user = await db.get(User, UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token.")
    account = await db.get(Account, user.account_id)
    if account is None or not account.is_active or account.status == "suspended" or account.deleted_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is suspended.")
    return _tokens(payload["sub"])


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
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
