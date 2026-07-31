# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Campaigns API (Section 5.x): CRUD, preview, send/schedule/cancel, per-message
delivery, live SSE progress, and provider status."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.campaign import Campaign, Message
from app.schemas.campaign import (
    CampaignCreate,
    CampaignDetail,
    CampaignOut,
    CampaignStats,
    CampaignUpdate,
    MessageOut,
    PaginatedCampaigns,
    PaginatedMessages,
    PreviewOut,
    PreviewRequest,
    ProviderInfo,
    ScheduleRequest,
    SendResponse,
    SmsSegmentInfo,
)
from app.services import campaign_service, template_engine
from app.services.audit import record_audit
from app.services.dispatch import (
    available_email_providers,
    available_sms_providers,
    dispatch_campaign,
    get_email_provider,
    get_sms_provider,
)
from app.services.dispatch import progress as progress_store

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_TERMINAL = {"completed", "cancelled", "failed"}


# --- Provider status (declared before /{campaign_id} so it isn't shadowed) ---
@router.get("/providers", response_model=ProviderInfo)
async def providers(_: CurrentUser) -> ProviderInfo:
    return ProviderInfo(
        active_sms=get_sms_provider().name,
        active_email=get_email_provider().name,
        sms=available_sms_providers(),
        email=available_email_providers(),
        simulator_forced=settings.DISPATCH_FORCE_SIMULATOR,
    )


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> CampaignOut:
    campaign = await campaign_service.create(db, user.account_id, payload)
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="campaign.create",
        resource_type="campaign", resource_id=str(campaign.id),
        details={"type": campaign.type, "name": campaign.name},
    )
    return CampaignOut.model_validate(campaign)


@router.get("", response_model=PaginatedCampaigns)
async def list_campaigns(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1, page_size: int = 20, status_filter: str | None = None,
) -> PaginatedCampaigns:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    rows, total = await campaign_service.list_for_account(
        db, user.account_id, page=page, page_size=page_size, status_filter=status_filter
    )
    return PaginatedCampaigns(
        items=[CampaignOut.model_validate(r) for r in rows],
        total=total, page=page, page_size=page_size,
    )


@router.get("/{campaign_id}", response_model=CampaignDetail)
async def get_campaign(
    campaign_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> CampaignDetail:
    campaign = await campaign_service.get_owned(db, campaign_id, user.account_id)
    stats = await campaign_service.compute_stats(db, campaign_id)
    detail = CampaignDetail.model_validate(campaign)
    detail.stats = CampaignStats(**stats)
    if campaign.status == "draft":
        detail.recipient_estimate = (await campaign_service.estimate(db, campaign))["recipients"]
    return detail


@router.patch("/{campaign_id}", response_model=CampaignOut)
async def update_campaign(
    campaign_id: UUID, payload: CampaignUpdate, user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignOut:
    campaign = await campaign_service.get_owned(db, campaign_id, user.account_id)
    campaign = await campaign_service.update_draft(db, campaign, payload)
    return CampaignOut.model_validate(campaign)


@router.delete("/{campaign_id}", status_code=status.HTTP_200_OK)
async def delete_campaign(
    campaign_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    campaign = await campaign_service.get_owned(db, campaign_id, user.account_id)
    await campaign_service.delete(db, campaign)
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="campaign.delete",
        resource_type="campaign", resource_id=str(campaign_id),
    )
    return {"message": "Campaign deleted."}


@router.post("/{campaign_id}/preview", response_model=PreviewOut)
async def preview_campaign(
    campaign_id: UUID, payload: PreviewRequest, user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PreviewOut:
    campaign = await campaign_service.get_owned(db, campaign_id, user.account_id)
    sample = payload.sample or await campaign_service.sample_for_preview(db, campaign)
    out = PreviewOut(sample={str(k): str(v) for k, v in sample.items()})
    try:
        if campaign.type in ("sms", "both") and campaign.sms_body:
            out.sms_body = template_engine.render_sms(campaign.sms_body, sample)
            info = template_engine.sms_length_info(out.sms_body)
            out.sms_segments = SmsSegmentInfo(encoding=info.encoding, length=info.length, parts=info.parts)
        if campaign.type in ("email", "both"):
            if campaign.email_subject:
                out.email_subject = template_engine.render_subject(campaign.email_subject, sample)
            if campaign.email_html_body:
                out.email_html_body = template_engine.render_email_body(campaign.email_html_body, sample)
    except template_engine.TemplateError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Template error: {exc}")
    return out


@router.post("/{campaign_id}/send", response_model=SendResponse)
async def send_campaign(
    campaign_id: UUID, user: CurrentUser, request: Request,
    background: BackgroundTasks, db: Annotated[AsyncSession, Depends(get_db)],
) -> SendResponse:
    campaign = await campaign_service.get_owned(db, campaign_id, user.account_id)
    recipients, messages = await campaign_service.materialise_and_queue(db, campaign)
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="campaign.send",
        resource_type="campaign", resource_id=str(campaign_id),
        details={"recipients": recipients, "messages": messages},
    )
    # Dispatch: enqueue to the ARQ worker, or run in-process when no worker runs.
    if settings.DISPATCH_INLINE:
        background.add_task(dispatch_campaign, campaign.id)
    else:
        try:
            from app.workers import enqueue_dispatch

            await enqueue_dispatch(campaign.id)
        except Exception:  # noqa: BLE001 — fall back to in-process rather than stranding a queued campaign
            background.add_task(dispatch_campaign, campaign.id)
    return SendResponse(id=campaign.id, status="queued", queued_messages=messages, recipients=recipients)


@router.post("/{campaign_id}/schedule", response_model=CampaignOut)
async def schedule_campaign(
    campaign_id: UUID, payload: ScheduleRequest, user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignOut:
    campaign = await campaign_service.get_owned(db, campaign_id, user.account_id)
    if campaign.status not in ("draft", "scheduled"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot schedule a '{campaign.status}' campaign.")
    when = payload.scheduled_at
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    if when <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "scheduled_at must be in the future.")
    campaign.scheduled_at = when
    campaign.status = "scheduled"
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="campaign.schedule",
        resource_type="campaign", resource_id=str(campaign_id),
        details={"scheduled_at": when.isoformat()},
    )
    return CampaignOut.model_validate(campaign)


@router.post("/{campaign_id}/cancel", response_model=CampaignOut)
async def cancel_campaign(
    campaign_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> CampaignOut:
    campaign = await campaign_service.get_owned(db, campaign_id, user.account_id)
    campaign = await campaign_service.cancel(db, campaign)
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="campaign.cancel",
        resource_type="campaign", resource_id=str(campaign_id),
    )
    return CampaignOut.model_validate(campaign)


@router.get("/{campaign_id}/messages", response_model=PaginatedMessages)
async def list_messages(
    campaign_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1, page_size: int = 50, status_filter: str | None = None,
) -> PaginatedMessages:
    await campaign_service.get_owned(db, campaign_id, user.account_id)
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    where = [Message.campaign_id == campaign_id]
    if status_filter:
        where.append(Message.status == status_filter)
    total = await db.scalar(select(func.count()).select_from(Message).where(*where)) or 0
    rows = list(
        (
            await db.execute(
                select(Message).where(*where)
                .order_by(Message.created_at).offset((page - 1) * page_size).limit(page_size)
            )
        ).scalars()
    )
    return PaginatedMessages(
        items=[MessageOut.model_validate(r) for r in rows],
        total=total, page=page, page_size=page_size,
    )


@router.get("/{campaign_id}/progress")
async def progress_stream(
    campaign_id: UUID, user: CurrentUser
) -> StreamingResponse:
    """Server-Sent Events stream of live dispatch progress from Redis.

    Ownership is resolved in a SHORT-LIVED session that is released before the
    stream starts: a StreamingResponse keeps a `Depends(get_db)` session checked
    out for the whole stream (up to the 1h cap), so a handful of open campaign
    tabs would exhaust the connection pool. The stream itself reads only Redis."""
    from app.core.database import LiveSessionLocal

    async with LiveSessionLocal() as check_db:
        campaign = await campaign_service.get_owned(check_db, campaign_id, user.account_id)
        initial_status = campaign.status

    async def event_stream():
        last = None
        # Emit an immediate snapshot so the client renders without waiting a tick.
        snapshot = await progress_store.read(campaign_id)
        if snapshot is None:
            snapshot = {"status": initial_status, "total": 0, "sent": 0, "failed": 0, "pending": 0, "pct": 0.0}
        yield f"data: {json.dumps(snapshot)}\n\n"
        last = snapshot
        if snapshot.get("status") in _TERMINAL:
            return
        for _ in range(60 * 60):  # 1h safety cap
            await asyncio.sleep(1)
            data = await progress_store.read(campaign_id)
            if data and data != last:
                yield f"data: {json.dumps(data)}\n\n"
                last = data
                if data.get("status") in _TERMINAL:
                    return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
