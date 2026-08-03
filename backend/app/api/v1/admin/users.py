"""Admin users directory (superadmin): platform staff assignable as managed
account managers. Defaults to internal staff roles (superadmin, admin)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import Account, User
from app.schemas.admin import AdminUserOut

router = APIRouter(prefix="/admin/users", tags=["admin:users"])

_STAFF_ROLES = ("superadmin", "admin")


@router.get("", response_model=list[AdminUserOut])
async def list_users(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    role: str | None = None,
    limit: int = Query(200, ge=1, le=500),
) -> list[AdminUserOut]:
    stmt = (
        select(User, Account.name)
        .join(Account, Account.id == User.account_id, isouter=True)
        .where(User.is_active.is_(True))
        .order_by(User.email)
    )
    # Default to assignable internal staff; an explicit role filters to just that.
    stmt = stmt.where(User.role == role) if role else stmt.where(User.role.in_(_STAFF_ROLES))
    rows = (await db.execute(stmt.limit(min(limit, 500)))).all()
    return [
        AdminUserOut(
            id=u.id, email=u.email, role=u.role, account_name=aname,
            last_login_at=u.last_login_at,
        )
        for u, aname in rows
    ]
