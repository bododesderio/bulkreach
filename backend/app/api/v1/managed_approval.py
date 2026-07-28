"""Public copy-approval endpoints for managed campaigns.

A client receives a tokenized, no-login link when their account manager sends the
drafted campaign copy for approval. The token authenticates the whole interaction:
they view the copy, then either approve it (→ approved) or request changes with a
note (→ changes_requested, which loops the job back to the manager).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.account import Account
from app.models.campaign import ManagedCampaign
from app.schemas.admin import ChangeRequestBody, ManagedApprovalView, ManagedOut
from app.services.managed import pipeline

log = logging.getLogger("bulkreach.managed")

router = APIRouter(prefix="/managed-approve", tags=["managed-approval"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _load_open(db: AsyncSession, token: str) -> ManagedCampaign:
    """Resolve a token to a managed job that is currently open for approval, or 404.

    404 (not 403) for every failure mode — invalid, expired, already-decided,
    wrong-state — so a probing client can't distinguish them."""
    mc = (await db.execute(
        select(ManagedCampaign).where(
            ManagedCampaign.approval_token_hash == pipeline.hash_token(token)
        )
    )).scalar_one_or_none()
    if (
        mc is None
        or mc.status != pipeline.APPROVAL_OPEN
        or mc.cancelled
        or mc.approval_expires_at is None
        or mc.approval_expires_at < _now()
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This approval link is invalid or has expired")
    return mc


@router.get("/{token}", response_model=ManagedApprovalView)
async def view_copy(token: str, db: Annotated[AsyncSession, Depends(get_db)]) -> ManagedApprovalView:
    mc = await _load_open(db, token)
    account = await db.get(Account, mc.account_id)
    return ManagedApprovalView(
        managed_id=mc.id, account_name=account.name if account else None,
        status=mc.status, brief_text=mc.brief_text,
        copy_sms=mc.copy_sms, copy_email_subject=mc.copy_email_subject,
        copy_email_body=mc.copy_email_body, expires_at=mc.approval_expires_at,
    )


def _clear_token(mc: ManagedCampaign) -> None:
    """Single-use: burn the token so the same link can't be replayed."""
    mc.approval_token_hash = None
    mc.approval_expires_at = None


async def _notify(db: AsyncSession, mc: ManagedCampaign, type_: str, title: str, body: str) -> None:
    try:
        from app.services.notifications import notify

        await notify(db, account_id=mc.account_id, type=type_, title=title, body=body,
                     level="info", meta={"managed_id": str(mc.id)})
    except Exception:  # noqa: BLE001 — a notice must not fail the decision
        pass


@router.post("/{token}/approve", response_model=ManagedOut)
async def approve_copy(token: str, db: Annotated[AsyncSession, Depends(get_db)]) -> ManagedOut:
    mc = await _load_open(db, token)
    mc.status = "approved"
    mc.approved_at = _now()
    mc.change_request_note = None
    _clear_token(mc)
    await _notify(db, mc, "managed.copy_approved", "Campaign copy approved",
                  "The client approved the campaign copy. It's ready to schedule.")
    await db.commit()
    await db.refresh(mc)
    return await _out(db, mc)


@router.post("/{token}/request-changes", response_model=ManagedOut)
async def request_changes(
    token: str, body: ChangeRequestBody, db: Annotated[AsyncSession, Depends(get_db)]
) -> ManagedOut:
    mc = await _load_open(db, token)
    mc.status = pipeline.LOOP_STATE
    mc.change_request_note = body.note
    _clear_token(mc)
    await _notify(db, mc, "managed.changes_requested", "Client requested copy changes",
                  f"The client asked for changes: {body.note[:180]}")
    await db.commit()
    await db.refresh(mc)
    return await _out(db, mc)


async def _out(db: AsyncSession, mc: ManagedCampaign) -> ManagedOut:
    account = await db.get(Account, mc.account_id)
    return ManagedOut(
        id=mc.id, account_id=mc.account_id, account_name=account.name if account else None,
        campaign_id=mc.campaign_id, campaign_name=None, channel=None, audience=None,
        brief_text=mc.brief_text, status=mc.status,
        account_manager_id=mc.account_manager_id, account_manager_email=None,
        approved_at=mc.approved_at, created_at=mc.created_at, updated_at=mc.updated_at,
        copy_sms=mc.copy_sms, copy_email_subject=mc.copy_email_subject,
        copy_email_body=mc.copy_email_body, approval_sent_at=mc.approval_sent_at,
        approval_expires_at=mc.approval_expires_at, change_request_note=mc.change_request_note,
        on_hold=mc.on_hold, cancelled=mc.cancelled,
    )
