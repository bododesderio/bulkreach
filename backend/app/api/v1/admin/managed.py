"""Managed-service workflow (superadmin): drive a client brief through the
15-state pipeline (see services/managed/pipeline.py). Transitions follow the state
graph (forward jumps + the copy-approval loop); each is audited. Assigning a
manager, sending copy for client approval, holding/cancelling, and issuing the
final report are first-class actions."""
from __future__ import annotations

import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import Account, User
from app.models.campaign import Campaign, ManagedCampaign, Report
from app.schemas.admin import ManagedCreate, ManagedOut, ManagedResponse, ManagedUpdate
from app.services.audit import record_audit
from app.services.email import send_email
from app.services.managed import pipeline
from app.services.reports import pdf
from app.services.storage import get_storage

log = logging.getLogger("bulkreach.managed")

router = APIRouter(prefix="/admin/managed", tags=["admin:managed"])

_TERMINAL = pipeline.TERMINAL


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _manager_emails(db: AsyncSession, ids: set[UUID]) -> dict[UUID, str]:
    if not ids:
        return {}
    rows = (await db.execute(
        select(User.id, User.email).where(User.id.in_(ids))
    )).all()
    return {uid: email for uid, email in rows}


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
    mgr_emails: dict[UUID, str], report_ready: bool,
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
        report_ready=report_ready,
        report_url=f"/admin/managed/{mc.id}/report/download" if report_ready else None,
        copy_sms=mc.copy_sms, copy_email_subject=mc.copy_email_subject,
        copy_email_body=mc.copy_email_body,
        approval_sent_at=mc.approval_sent_at, approval_expires_at=mc.approval_expires_at,
        change_request_note=mc.change_request_note,
        on_hold=mc.on_hold, cancelled=mc.cancelled,
    )


@router.get("", response_model=ManagedResponse)
async def list_managed(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = None,
    limit: int = 200,
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

    mgr_ids = {mc.account_manager_id for mc, _, _ in rows if mc.account_manager_id}
    mgr_emails = await _manager_emails(db, mgr_ids)
    ready = await _report_ready_ids(
        db, {mc.campaign_id for mc, _, _ in rows if mc.campaign_id}
    )

    items = [
        _to_out(mc, aname, camp, mgr_emails, mc.campaign_id in ready)
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
    ready = bool(await _report_ready_ids(db, {mc.campaign_id} if mc.campaign_id else set()))
    return _to_out(mc, account.name if account else None, campaign, mgr_emails, ready)


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
        if body.status == "approved" and mc.approved_at is None:
            mc.approved_at = _now()

    if details:
        await record_audit(
            db, actor_id=admin.id, actor_email=admin.email, action="managed.update",
            resource_type="managed_campaign", resource_id=str(mc.id), details=details,
        )
    await db.commit()
    await db.refresh(mc)
    return await _load_one(db, mc)


@router.post("/{managed_id}/request-approval", response_model=ManagedOut)
async def request_approval(
    managed_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ManagedOut:
    """Snapshot the draft copy, mint a client copy-approval token, email the client a
    no-login review link, and move the job to `awaiting_approval`."""
    mc = await db.get(ManagedCampaign, managed_id)
    if mc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Managed campaign not found")
    if not (mc.copy_sms or mc.copy_email_body):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Add draft SMS or email copy before sending it to the client for approval",
        )
    if mc.status != pipeline.APPROVAL_OPEN and not pipeline.can_transition(mc.status, pipeline.APPROVAL_OPEN):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot send for approval from '{mc.status}'",
        )
    account = await db.get(Account, mc.account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")

    token, token_hash = pipeline.new_token()
    mc.approval_token_hash = token_hash
    mc.approval_sent_at = _now()
    mc.approval_expires_at = _now() + timedelta(days=pipeline.APPROVAL_TTL_DAYS)
    mc.change_request_note = None
    mc.status = pipeline.APPROVAL_OPEN

    link = f"{settings.FRONTEND_URL}/managed-approve/{token}"
    await send_email(
        to=account.email,
        subject="Please review your campaign copy — BulkReach",
        html=(
            f"<p>Hello {account.name},</p>"
            f"<p>Your account manager has prepared the copy for your upcoming campaign. "
            f"Please review and approve it so we can proceed.</p>"
            f'<p><a href="{link}">Review &amp; approve your campaign copy</a></p>'
            f"<p>This link expires in {pipeline.APPROVAL_TTL_DAYS} days.</p>"
        ),
    )
    try:
        from app.services.notifications import notify

        await notify(
            db, account_id=mc.account_id, type="managed.copy_review",
            title="Your campaign copy is ready to review",
            body="Your account manager sent your managed-campaign copy for approval.",
            level="info", meta={"managed_id": str(mc.id)},
        )
    except Exception:  # noqa: BLE001 — a notice must not fail the action
        pass

    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action="managed.request_approval",
        resource_type="managed_campaign", resource_id=str(mc.id),
        details={"expires_at": mc.approval_expires_at.isoformat()},
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
    return await _toggle_flag(db, admin, managed_id, field="cancelled", value=True, action="managed.cancel")


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
    except ImportError as exc:  # WeasyPrint native libs missing on this host
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
    sent = await send_email(
        to=account.email,
        subject=f"Your BulkReach campaign report — {campaign.name}",
        html=(
            f"<p>Hello {account.name},</p>"
            f"<p>Your managed campaign <strong>{campaign.name}</strong> is complete. "
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
    except ImportError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "PDF rendering is unavailable."
        ) from exc
    filename = pdf.report_filename(campaign.id, campaign.name)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
