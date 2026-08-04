# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Managed-service workflow (superadmin): drive a client brief through the
pipeline (see services/managed/pipeline.py). The admin runs each job solo —
create the brief, draft the copy, link + dispatch the campaign, and issue the
report — advancing via forward state transitions (each audited). There is no
client sign-off step; the client-approval flow was removed."""
from __future__ import annotations

import html
import io
import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import Account, User
from app.models.campaign import Campaign, ManagedCampaign, Report
from app.schemas.admin import ManagedCreate, ManagedOut, ManagedResponse, ManagedUpdate
from app.services import campaign_service
from app.services.audit import record_audit
from app.services.dispatch import dispatch_campaign
from app.services.email import send_email
from app.services.managed import pipeline
from app.services.reports import pdf
from app.services.storage import get_storage

# States from which a managed job can still be dispatched (i.e. not already
# sending/sent/reported/closed). Mirrors the pre-"sending" pipeline stages.
_SENDABLE_STATES = frozenset(pipeline.STAGES[: pipeline.index("sending")])

log = logging.getLogger("bulkreach.managed")

router = APIRouter(prefix="/admin/managed", tags=["admin:managed"])

_TERMINAL = pipeline.TERMINAL


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _report_ready_ids(db: AsyncSession, campaign_ids: set[UUID]) -> set[UUID]:
    """Campaign ids that already have a client-success report."""
    if not campaign_ids:
        return set()
    rows = (await db.execute(
        select(Report.campaign_id).where(
            Report.campaign_id.in_(campaign_ids), Report.type == "client_success"
        )
    )).scalars().all()
    return set(rows)


def _to_out(
    mc: ManagedCampaign, account_name: str | None, campaign: Campaign | None,
    report_ready: bool,
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
        created_at=mc.created_at, updated_at=mc.updated_at,
        report_ready=report_ready,
        report_url=f"/admin/managed/{mc.id}/report/download" if report_ready else None,
        copy_sms=mc.copy_sms, copy_email_subject=mc.copy_email_subject,
        copy_email_body=mc.copy_email_body,
        on_hold=mc.on_hold, cancelled=mc.cancelled,
    )


@router.get("", response_model=ManagedResponse)
async def list_managed(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = None,
    limit: int = Query(200, ge=1, le=500),
) -> ManagedResponse:
    stmt = (
        select(ManagedCampaign, Account.name, Campaign)
        .join(Account, Account.id == ManagedCampaign.account_id, isouter=True)
        .join(Campaign, Campaign.id == ManagedCampaign.campaign_id, isouter=True)
        .order_by(ManagedCampaign.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(ManagedCampaign.status == status_filter)
    rows = (await db.execute(stmt.limit(min(limit, 500)))).all()

    ready = await _report_ready_ids(
        db, {mc.campaign_id for mc, _, _ in rows if mc.campaign_id}
    )

    items = [
        _to_out(mc, aname, camp, mc.campaign_id in ready)
        for mc, aname, camp in rows
    ]
    stats = {
        "total": len(items),
        "pending": sum(1 for i in items if i.status not in _TERMINAL and not i.cancelled),
        "in_flight": sum(1 for i in items if i.status in ("scheduled", "sending") and not i.cancelled),
        "complete": sum(1 for i in items if i.status in _TERMINAL),
    }
    return ManagedResponse(items=items, stats=stats)


async def _load_one(db: AsyncSession, mc: ManagedCampaign) -> ManagedOut:
    account = await db.get(Account, mc.account_id)
    campaign = await db.get(Campaign, mc.campaign_id) if mc.campaign_id else None
    ready = bool(await _report_ready_ids(db, {mc.campaign_id} if mc.campaign_id else set()))
    return _to_out(mc, account.name if account else None, campaign, ready)


@router.get("/{managed_id}", response_model=ManagedOut)
async def get_managed(
    managed_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ManagedOut:
    """Single managed job — backs the admin job-detail workspace."""
    mc = await db.get(ManagedCampaign, managed_id)
    if mc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Managed campaign not found")
    return await _load_one(db, mc)


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
    if body.campaign_id is not None:
        campaign = await db.get(Campaign, body.campaign_id)
        if campaign is None or campaign.account_id != mc.account_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Campaign not found or belongs to a different account",
            )
        mc.campaign_id = body.campaign_id
        details["campaign_id"] = str(body.campaign_id)
    for field in ("copy_sms", "copy_email_subject", "copy_email_body"):
        value = getattr(body, field)
        if value is not None:
            setattr(mc, field, value)
            details[field] = "updated"
    if body.status is not None and body.status != mc.status:
        if not pipeline.is_valid(body.status):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown status '{body.status}'")
        if not pipeline.can_transition(mc.status, body.status):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"'{mc.status}' → '{body.status}' is not a permitted transition",
            )
        mc.status = body.status
        details["status"] = body.status

    if details:
        await record_audit(
            db, actor_id=admin.id, actor_email=admin.email, action="managed.update",
            resource_type="managed_campaign", resource_id=str(mc.id), details=details,
        )
    await db.commit()
    await db.refresh(mc)
    return await _load_one(db, mc)


async def _toggle_flag(
    db: AsyncSession, admin: User, managed_id: UUID, *, field: str, value: bool, action: str,
) -> ManagedOut:
    mc = await db.get(ManagedCampaign, managed_id)
    if mc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Managed campaign not found")
    setattr(mc, field, value)
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action=action,
        resource_type="managed_campaign", resource_id=str(mc.id),
    )
    await db.commit()
    await db.refresh(mc)
    return await _load_one(db, mc)


@router.post("/{managed_id}/hold", response_model=ManagedOut)
async def hold_managed(managed_id: UUID, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _toggle_flag(db, admin, managed_id, field="on_hold", value=True, action="managed.hold")


@router.post("/{managed_id}/unhold", response_model=ManagedOut)
async def unhold_managed(managed_id: UUID, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _toggle_flag(db, admin, managed_id, field="on_hold", value=False, action="managed.unhold")


@router.post("/{managed_id}/cancel", response_model=ManagedOut)
async def cancel_managed(managed_id: UUID, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    """Cancel a managed job — and actually STOP its campaign if one is in flight.

    Previously this only flipped the ``cancelled`` flag, so a job cancelled while
    ``sending`` kept dispatching SMS/email. Now, if the linked campaign is still
    stoppable, it is cancelled in the same transaction (the dispatch loop checks
    the campaign status between batches and halts)."""
    mc = await db.get(ManagedCampaign, managed_id)
    if mc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Managed campaign not found")

    stopped_campaign = False
    if mc.campaign_id is not None:
        campaign = await db.get(Campaign, mc.campaign_id)
        if campaign is not None and campaign.status in ("queued", "sending", "scheduled"):
            await campaign_service.cancel(db, campaign)
            stopped_campaign = True

    mc.cancelled = True
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action="managed.cancel",
        resource_type="managed_campaign", resource_id=str(mc.id),
        details={"stopped_campaign": stopped_campaign,
                 "campaign_id": str(mc.campaign_id) if mc.campaign_id else None},
    )
    await db.commit()
    await db.refresh(mc)
    return await _load_one(db, mc)


@router.post("/{managed_id}/send", response_model=ManagedOut)
async def send_managed(
    managed_id: UUID,
    admin: SuperadminUser,
    background: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ManagedOut:
    """Actually dispatch the linked campaign for a managed job.

    This is the real "send" the admin was missing: it materialises the
    campaign's recipient messages and enqueues dispatch — the same path the
    client composer uses — then moves the job to ``sending``. Previously the
    admin could only flip the status flag, which never sent anything.
    """
    mc = await db.get(ManagedCampaign, managed_id)
    if mc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Managed campaign not found")
    if mc.cancelled:
        raise HTTPException(status.HTTP_409_CONFLICT, "This job is cancelled.")
    if mc.on_hold:
        raise HTTPException(status.HTTP_409_CONFLICT, "Resume the job before sending.")
    if mc.campaign_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Link the campaign to dispatch in the Content step first.",
        )
    if mc.status not in _SENDABLE_STATES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This job has already been dispatched.",
        )

    campaign = await db.get(Campaign, mc.campaign_id)
    if campaign is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Linked campaign not found")
    if campaign.account_id != mc.account_id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The linked campaign belongs to a different account.",
        )
    if campaign.status not in ("draft", "scheduled"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"The linked campaign is '{campaign.status}' and cannot be dispatched.",
        )

    # Materialise recipients + queue messages (FOR-UPDATE guarded → 409 on a
    # concurrent double-send), then move the job to "sending".
    recipients, messages = await campaign_service.materialise_and_queue(db, campaign)
    mc.status = "sending"
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action="managed.send",
        resource_type="managed_campaign", resource_id=str(mc.id),
        details={"campaign_id": str(mc.campaign_id), "recipients": recipients,
                 "messages": messages},
    )
    # Commit the queued rows BEFORE enqueuing dispatch, so a worker can't dequeue
    # against an uncommitted campaign (same ordering the client send relies on).
    await db.commit()
    if settings.DISPATCH_INLINE:
        background.add_task(dispatch_campaign, campaign.id)
    else:
        try:
            from app.workers import enqueue_dispatch

            await enqueue_dispatch(campaign.id)
        except Exception:  # noqa: BLE001 — fall back to in-process rather than stranding a queued campaign
            background.add_task(dispatch_campaign, campaign.id)

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
    if not pipeline.reached(mc.status, pipeline.DISPATCH_DONE):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Campaign must be sent before a report can be issued",
        )
    if mc.campaign_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Link the campaign this job ran before issuing its client report",
        )
    campaign = await db.get(Campaign, mc.campaign_id)
    account = await db.get(Account, mc.account_id)
    if campaign is None or account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Linked campaign or account not found")

    # Render the branded client-success PDF (reuses the M4a report renderer).
    try:
        data = await pdf.campaign_report_pdf(db, campaign, account)
    except (ImportError, OSError) as exc:  # WeasyPrint python or native libs missing
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "PDF rendering is unavailable on this server.",
        ) from exc

    filename = pdf.report_filename(campaign.id, campaign.name)
    try:
        file_url = get_storage().put(
            f"managed-reports/{mc.id}.pdf", data, content_type="application/pdf"
        )
    except Exception as exc:  # noqa: BLE001 — storage is best-effort; report still issues
        log.warning("managed report storage failed mc=%s: %s", mc.id, exc)
        file_url = None

    # Email the client (best-effort — no-op in dev without SMTP), PDF attached.
    emailed_at = None
    acct_name = html.escape(account.name or "")
    camp_name = html.escape(campaign.name or "")
    sent = await send_email(
        to=account.email,
        subject=f"Your BulkReach campaign report — {campaign.name}",
        html=(
            f"<p>Hello {acct_name},</p>"
            f"<p>Your managed campaign <strong>{camp_name}</strong> is complete. "
            f"The delivery report is attached.</p>"
            f"<p>— The BulkReach team</p>"
        ),
        attachment=(filename, data, "application/pdf"),
    )
    if sent:
        emailed_at = datetime.now(timezone.utc)

    # Record (or refresh) the client-success report for this campaign.
    report = (await db.execute(
        select(Report).where(
            Report.campaign_id == mc.campaign_id, Report.type == "client_success"
        )
    )).scalar_one_or_none()
    if report is None:
        report = Report(campaign_id=mc.campaign_id, type="client_success")
        db.add(report)
    report.file_url = file_url
    report.emailed_to = account.email
    report.emailed_at = emailed_at

    mc.status = "report_issued"
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action="managed.report_issued",
        resource_type="managed_campaign", resource_id=str(mc.id),
        details={"campaign_id": str(mc.campaign_id), "emailed": bool(emailed_at),
                 "size_bytes": len(data)},
    )
    await db.commit()
    await db.refresh(mc)
    return await _load_one(db, mc)


@router.get("/{managed_id}/report/download")
async def download_report(
    managed_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Stream the managed campaign's branded client-success PDF (re-rendered from
    the immutable completed-campaign data)."""
    mc = await db.get(ManagedCampaign, managed_id)
    if mc is None or mc.campaign_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No report for this managed campaign")
    campaign = await db.get(Campaign, mc.campaign_id)
    account = await db.get(Account, mc.account_id)
    if campaign is None or account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Linked campaign or account not found")
    try:
        data = await pdf.campaign_report_pdf(db, campaign, account)
    except (ImportError, OSError) as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "PDF rendering is unavailable."
        ) from exc
    filename = pdf.report_filename(campaign.id, campaign.name)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
