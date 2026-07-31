# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Suppression-list management (Section 20): the addresses a campaign will skip.

Populated automatically by DLR ingestion (hard bounces + complaints); this router
lets an account view, manually add, and remove entries (an unsubscribe honoured in
error, say). Reads are open to any account user; writes are owner/admin only."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete as sa_delete
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.suppression import Suppression
from app.services import deliveries

router = APIRouter(prefix="/suppressions", tags=["suppressions"])


class SuppressionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    channel: str
    address: str
    reason: str
    created_at: datetime


class SuppressionCreate(BaseModel):
    channel: str = Field(pattern="^(sms|email)$")
    address: str = Field(min_length=3, max_length=320)


@router.get("", response_model=list[SuppressionOut])
async def list_suppressions(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    channel: str | None = None,
    limit: int = 200,
) -> list[SuppressionOut]:
    stmt = select(Suppression).where(Suppression.account_id == user.account_id)
    if channel in ("sms", "email"):
        stmt = stmt.where(Suppression.channel == channel)
    stmt = stmt.order_by(Suppression.created_at.desc()).limit(min(limit, 1000))
    rows = (await db.execute(stmt)).scalars().all()
    return [SuppressionOut.model_validate(r) for r in rows]


@router.post("", response_model=SuppressionOut, status_code=status.HTTP_201_CREATED)
async def add(
    body: SuppressionCreate,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SuppressionOut:
    if user.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only an account owner or admin can edit the suppression list.")
    await deliveries.add_suppression(db, user.account_id, body.channel, body.address, reason="manual")
    await db.commit()
    row = await db.scalar(
        select(Suppression).where(
            Suppression.account_id == user.account_id,
            Suppression.channel == body.channel,
            Suppression.address == body.address.strip().lower()
            if body.channel == "email" else body.address.strip(),
        ).limit(1)
    )
    return SuppressionOut.model_validate(row)


@router.delete("/{suppression_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_class=Response)
async def remove(
    suppression_id: uuid.UUID,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    if user.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only an account owner or admin can edit the suppression list.")
    await db.execute(
        sa_delete(Suppression).where(
            Suppression.id == suppression_id, Suppression.account_id == user.account_id
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
