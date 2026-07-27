"""Admin cross-account campaign monitor (superadmin, read-only)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import Account
from app.models.campaign import Campaign, CampaignContact
from app.schemas.admin import AdminCampaignOut, AdminCampaignsResponse

router = APIRouter(prefix="/admin/campaigns", tags=["admin:campaigns"])


@router.get("", response_model=AdminCampaignsResponse)
async def list_campaigns(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = None,
    limit: int = 200,
) -> AdminCampaignsResponse:
    audience_sub = (
        select(
            CampaignContact.campaign_id.label("cid"),
            func.count().label("audience"),
        )
        .group_by(CampaignContact.campaign_id)
        .subquery()
    )

    stmt = (
        select(Campaign, Account.name, func.coalesce(audience_sub.c.audience, 0))
        .join(Account, Account.id == Campaign.account_id, isouter=True)
        .join(audience_sub, audience_sub.c.cid == Campaign.id, isouter=True)
        .order_by(Campaign.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(Campaign.status == status_filter)
    rows = (await db.execute(stmt.limit(min(limit, 500)))).all()

    items: list[AdminCampaignOut] = []
    for c, account_name, audience in rows:
        sent = (c.sms_sent or 0) + (c.email_sent or 0)
        failed = (c.sms_failed or 0) + (c.email_failed or 0)
        delivered = max(sent - failed, 0)
        aud = int(audience) or sent
        if c.status == "completed":
            progress = 100
        elif aud > 0:
            progress = min(int(sent / aud * 100), 100)
        else:
            progress = 0
        when = c.scheduled_at or c.created_at
        items.append(AdminCampaignOut(
            id=c.id, account_id=c.account_id, account_name=account_name, name=c.name,
            channel=c.type, audience=aud, sent=sent, delivered=delivered, failed=failed,
            status=c.status, progress=progress, when=when,
        ))

    stats = {
        "total": len(items),
        "sending": sum(1 for i in items if i.status == "sending"),
        "completed": sum(1 for i in items if i.status == "completed"),
        "scheduled": sum(1 for i in items if i.status == "scheduled"),
        "failed": sum(1 for i in items if i.status == "failed"),
        "messages_sent": sum(i.sent for i in items),
    }
    return AdminCampaignsResponse(items=items, stats=stats)
