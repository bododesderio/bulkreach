# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Admin cross-account campaign monitor (superadmin, read-only)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
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
    limit: int = Query(200, ge=1, le=500),
) -> AdminCampaignsResponse:
    # Fetch the page of campaigns FIRST (bounded by LIMIT), then count recipients
    # only for those campaign ids. The previous version GROUP-BY'd the entire
    # campaign_contacts table (the largest table in the DB) on every request
    # before applying the LIMIT — an unbounded aggregate that grows with total
    # historical volume.
    stmt = (
        select(Campaign, Account.name)
        .join(Account, Account.id == Campaign.account_id, isouter=True)
        .order_by(Campaign.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(Campaign.status == status_filter)
    rows = (await db.execute(stmt.limit(min(limit, 500)))).all()

    campaign_ids = [c.id for c, _ in rows]
    audience_by_id: dict = {}
    if campaign_ids:
        audience_by_id = dict(
            (
                await db.execute(
                    select(CampaignContact.campaign_id, func.count())
                    .where(CampaignContact.campaign_id.in_(campaign_ids))
                    .group_by(CampaignContact.campaign_id)
                )
            ).all()
        )

    items: list[AdminCampaignOut] = []
    for c, account_name in rows:
        audience = audience_by_id.get(c.id, 0)
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
