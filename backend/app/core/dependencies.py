"""FastAPI auth dependencies: bearer JWT, X-API-Key, and role guards.

Roles (Section 13.1): owner, admin, member (account level); superadmin (platform).
All /admin and /admin/archive endpoints require role == 'superadmin'.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token, verify_api_key
from app.models.account import Account, ApiKey, User

bearer_scheme = HTTPBearer(auto_error=False)

CredentialsError = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def _account_active(db: AsyncSession, account_id: UUID) -> bool:
    """A user is only usable if their ACCOUNT is live — suspending an account
    must revoke its users at auth, including already-issued access tokens."""
    account = await db.get(Account, account_id)
    if account is None:
        return False
    return account.is_active and account.status != "suspended" and account.deleted_at is None


async def _user_from_jwt(token: str, db: AsyncSession) -> User | None:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = await db.get(User, UUID(user_id))
    if not user or not user.is_active:
        return None
    if not await _account_active(db, user.account_id):
        return None
    return user


async def _user_from_api_key(raw_key: str, db: AsyncSession) -> User | None:
    # API keys are per-account; resolve to the account owner as the acting user.
    result = await db.execute(select(ApiKey).where(ApiKey.is_active.is_(True)))
    for api_key in result.scalars():
        if verify_api_key(raw_key, api_key.key_hash):
            if not await _account_active(db, api_key.account_id):
                return None
            owner = await db.execute(
                select(User)
                .where(User.account_id == api_key.account_id)
                .where(User.role == "owner")
                .limit(1)
            )
            return owner.scalar_one_or_none()
    return None


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> User:
    user: User | None = None
    if credentials and credentials.scheme.lower() == "bearer":
        user = await _user_from_jwt(credentials.credentials, db)
    elif x_api_key:
        user = await _user_from_api_key(x_api_key, db)
    if user is None:
        raise CredentialsError
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.role not in ("admin", "owner", "superadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")
    return user


async def require_superadmin(user: CurrentUser) -> User:
    """Guard for every /admin and /admin/archive route (Sections 13.1, 18.1)."""
    if user.role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Superadmin role required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
SuperadminUser = Annotated[User, Depends(require_superadmin)]
