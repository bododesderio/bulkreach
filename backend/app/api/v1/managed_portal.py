"""Managed-client portal API (Section I). A managed_client sees their own
managed campaigns; the heavy workflow lives admin-side."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.campaign import Campaign, ManagedCampaign

router = APIRouter(prefix="/managed-portal", tags=["managed-portal"])


class PortalCampaign(BaseModel):
    id: UUID
    brief_text: str
    status: str
    campaign_name: str | None
    approved_at: datetime | None
    created_at: datetime


@router.get("/campaigns", response_model=list[PortalCampaign])
async def my_managed_campaigns(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PortalCampaign]:
    rows = (await db.execute(
        select(ManagedCampaign, Campaign.name)
        .join(Campaign, Campaign.id == ManagedCampaign.campaign_id, isouter=True)
        .where(ManagedCampaign.account_id == user.account_id)
        .order_by(ManagedCampaign.created_at.desc())
    )).all()
    return [
        PortalCampaign(
            id=mc.id, brief_text=mc.brief_text, status=mc.status,
            campaign_name=cname, approved_at=mc.approved_at, created_at=mc.created_at,
        )
        for mc, cname in rows
    ]
