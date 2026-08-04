# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Billing API (Section 14): invoices/receipts, proration preview, auto-renew.

Client-facing. Amounts and VAT are server-authoritative; the client only reads.
"""
from __future__ import annotations

import io
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.account import Account
from app.models.billing import Plan, Subscription
from app.models.invoicing import Invoice
from app.schemas.invoice import (
    AutoRenewUpdate,
    InvoiceOut,
    ProrationPreview,
    SubscriptionStateOut,
)
from app.services.billing import compute_proration
from app.services.billing import pdf as invoice_pdf_svc

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/invoices", response_model=list[InvoiceOut])
async def list_invoices(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
) -> list[InvoiceOut]:
    res = await db.execute(
        select(Invoice)
        .where(Invoice.account_id == user.account_id)
        .order_by(Invoice.issued_at.desc())
        .limit(min(limit, 200))
    )
    return [InvoiceOut.model_validate(i) for i in res.scalars()]


@router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(
    invoice_id: UUID,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    invoice = await db.get(Invoice, invoice_id)
    if invoice is None or invoice.account_id != user.account_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    try:
        data = invoice_pdf_svc.invoice_pdf(invoice)
    except ImportError as exc:  # WeasyPrint native libs missing on this host
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "PDF rendering is unavailable on this server.",
        ) from exc
    filename = invoice_pdf_svc.invoice_filename(invoice)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/proration-preview", response_model=ProrationPreview)
async def proration_preview(
    plan_id: UUID,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProrationPreview:
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    p = await compute_proration(db, user.account_id, plan)
    return ProrationPreview(
        plan_id=plan.id,
        base_price_ugx=p.base_price_ugx,
        credit_ugx=p.credit_ugx,
        amount_due_ugx=p.amount_due_ugx,
        days_remaining=p.days_remaining,
        applies=p.applies,
    )


@router.get("/subscription", response_model=SubscriptionStateOut)
async def subscription_state(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionStateOut:
    account = await db.get(Account, user.account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    sub = (
        await db.execute(select(Subscription).where(Subscription.account_id == user.account_id))
    ).scalar_one_or_none()
    if sub is None:
        return SubscriptionStateOut(status="none", plan=account.plan)
    return SubscriptionStateOut(
        status=sub.status,
        plan=account.plan,
        auto_renew=sub.auto_renew,
        current_period_end=sub.current_period_end,
        dunning_stage=sub.dunning_stage,
        grace_until=sub.grace_until,
    )


@router.patch("/auto-renew", response_model=SubscriptionStateOut)
async def set_auto_renew(
    body: AutoRenewUpdate,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SubscriptionStateOut:
    if user.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only an account owner or admin can change auto-renewal.")
    account = await db.get(Account, user.account_id)
    sub = (
        await db.execute(select(Subscription).where(Subscription.account_id == user.account_id))
    ).scalar_one_or_none()
    if sub is None or account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active subscription")
    sub.auto_renew = body.auto_renew
    from app.services.audit import record_audit

    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="billing.auto_renew",
        resource_type="subscription", resource_id=str(sub.id),
        details={"auto_renew": body.auto_renew},
    )
    await db.commit()
    await db.refresh(sub)
    return SubscriptionStateOut(
        status=sub.status,
        plan=account.plan,
        auto_renew=sub.auto_renew,
        current_period_end=sub.current_period_end,
        dunning_stage=sub.dunning_stage,
        grace_until=sub.grace_until,
    )
