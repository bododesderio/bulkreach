"""Client subscription/quota state (Section K, Layer 1) — powers the dashboard
usage bar and the composer's pre-send remaining-messages check."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.account import Account
from app.services.subscription import enforce

router = APIRouter(prefix="/subscription", tags=["subscription"])


@router.get("/quota")
async def quota(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict:
    account = await db.get(Account, user.account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    return await enforce.quota_state(db, account)
