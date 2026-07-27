"""Managed-service workflow (superadmin): take a client brief through the
lifecycle briefed → copy_approved → scheduled → sending → complete → report_issued.

Transitions are forward-only (no going back a stage); each is audited. Assigning
an account manager and issuing the final report are first-class actions."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import Account, User
from app.models.campaign import Campaign, ManagedCampaign
from app.schemas.admin import ManagedCreate, ManagedOut, ManagedResponse, ManagedUpdate
from app.services.audit import record_audit

router = APIRouter(prefix="/admin/managed", tags=["admin:managed"])

# Lifecycle order — index defines "forward". report_issued is terminal.
STAGES = ["briefed", "copy_approved", "scheduled", "sending", "complete", "report_issued"]
_TERMINAL = ("complete", "report_issued")


def _stage_index(stage: str) -> int:
    try:
        return STAGES.index(stage)
    except ValueError:
        return -1


async def _manager_emails(db: AsyncSession, ids: set[UUID]) -> dict[UUID, str]:
    if not ids:
        return {}
    rows = (await db.execute(
        select(User.id, User.email).where(User.id.in_(ids))
    )).all()
    return {uid: email for uid, email in rows}


async def _to_out(
    db: AsyncSession, mc: ManagedCampaign, account_name: str | None,
    campaign: Campaign | None, mgr_emails: dict[UUID, str],
) -> ManagedOut:
    audience = None
    channel = None
    campaign_name = None
    if campaign is not None:
        campaign_name = campaign.name
        channel = campaign.type
        audience = (campaign.sms_sent or 0) + (campaign.email_sent or 0) or None
    return ManagedOut(
        id=mc.id, account_id=mc.account_id, account_name=account_name,
        campaign_id=mc.campaign_id, campaign_name=campaign_name, channel=channel,
        audience=audience, brief_text=mc.brief_text, status=mc.status,
        account_manager_id=mc.account_manager_id,
        account_manager_email=mgr_emails.get(mc.account_manager_id) if mc.account_manager_id else None,
        approved_at=mc.approved_at, created_at=mc.created_at, updated_at=mc.updated_at,
    )


@router.get("", response_model=ManagedResponse)
async def list_managed(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = None,
) -> ManagedResponse:
    stmt = (
        select(ManagedCampaign, Account.name, Campaign)
        .join(Account, Account.id == ManagedCampaign.account_id, isouter=True)
        .join(Campaign, Campaign.id == ManagedCampaign.campaign_id, isouter=True)
        .order_by(ManagedCampaign.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(ManagedCampaign.status == status_filter)
    rows = (await db.execute(stmt)).all()

    mgr_ids = {mc.account_manager_id for mc, _, _ in rows if mc.account_manager_id}
    mgr_emails = await _manager_emails(db, mgr_ids)

    items = [
        await _to_out(db, mc, aname, camp, mgr_emails)
        for mc, aname, camp in rows
    ]
    stats = {
        "total": len(items),
        "pending": sum(1 for i in items if i.status not in _TERMINAL),
        "in_flight": sum(1 for i in items if i.status in ("scheduled", "sending")),
        "complete": sum(1 for i in items if i.status in _TERMINAL),
    }
    return ManagedResponse(items=items, stats=stats)


async def _load_one(db: AsyncSession, mc: ManagedCampaign) -> ManagedOut:
    account = await db.get(Account, mc.account_id)
    campaign = await db.get(Campaign, mc.campaign_id) if mc.campaign_id else None
    mgr_emails = await _manager_emails(
        db, {mc.account_manager_id} if mc.account_manager_id else set()
    )
    return await _to_out(db, mc, account.name if account else None, campaign, mgr_emails)


@router.post("", response_model=ManagedOut, status_code=status.HTTP_201_CREATED)
async def create_managed(
    body: ManagedCreate,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ManagedOut:
    account = await db.get(Account, body.account_id)
    if account is None or account.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    mc = ManagedCampaign(
        account_id=body.account_id, campaign_id=body.campaign_id,
        brief_text=body.brief_text, status="briefed",
    )
    db.add(mc)
    await db.flush()
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action="managed.create",
        resource_type="managed_campaign", resource_id=str(mc.id),
        details={"account": account.name},
    )
    await db.commit()
    await db.refresh(mc)
    return await _load_one(db, mc)


@router.patch("/{managed_id}", response_model=ManagedOut)
async def update_managed(
    managed_id: UUID,
    body: ManagedUpdate,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ManagedOut:
    mc = await db.get(ManagedCampaign, managed_id)
    if mc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Managed campaign not found")

    details: dict = {}
    if body.brief_text is not None:
        mc.brief_text = body.brief_text
        details["brief_text"] = "updated"
    if body.account_manager_id is not None:
        mgr = await db.get(User, body.account_manager_id)
        if mgr is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Manager user not found")
        mc.account_manager_id = body.account_manager_id
        details["account_manager"] = mgr.email
    if body.status is not None:
        target = _stage_index(body.status)
        current = _stage_index(mc.status)
        if target < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown status '{body.status}'")
        if target < current:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Cannot move backward from '{mc.status}' to '{body.status}'",
            )
        if target != current:
            mc.status = body.status
            details["status"] = body.status
            if body.status == "copy_approved" and mc.approved_at is None:
                mc.approved_at = datetime.now(timezone.utc)

    if details:
        await record_audit(
            db, actor_id=admin.id, actor_email=admin.email, action="managed.update",
            resource_type="managed_campaign", resource_id=str(mc.id), details=details,
        )
    await db.commit()
    await db.refresh(mc)
    return await _load_one(db, mc)


@router.post("/{managed_id}/report", response_model=ManagedOut)
async def issue_report(
    managed_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ManagedOut:
    mc = await db.get(ManagedCampaign, managed_id)
    if mc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Managed campaign not found")
    if _stage_index(mc.status) < _stage_index("complete"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Campaign must be complete before a report can be issued",
        )
    mc.status = "report_issued"
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action="managed.report_issued",
        resource_type="managed_campaign", resource_id=str(mc.id),
        details={"campaign_id": str(mc.campaign_id) if mc.campaign_id else None},
    )
    await db.commit()
    await db.refresh(mc)
    return await _load_one(db, mc)
