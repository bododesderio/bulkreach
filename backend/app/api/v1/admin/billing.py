# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Admin billing data (superadmin): platform-wide payments + subscriptions + refunds."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import Account
from app.models.billing import Payment, Plan, Subscription
from app.schemas.payment import (
    AdminPaymentOut,
    AdminPaymentsResponse,
    AdminSubscriptionOut,
    AdminSubscriptionsResponse,
    PaymentOut,
    RefundRequest,
)
from app.services.audit import record_audit
from app.services.payments import payment_service

router = APIRouter(prefix="/admin", tags=["admin:billing"])


@router.get("/payments/transactions", response_model=AdminPaymentsResponse)
async def list_payments(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> AdminPaymentsResponse:
    q = (
        select(Payment, Account.name, Account.email)
        .join(Account, Account.id == Payment.account_id, isouter=True)
        .order_by(Payment.created_at.desc())
    )
    if status_filter:
        q = q.where(Payment.status == status_filter)
    rows = (await db.execute(q.limit(min(limit, 500)).offset(offset))).all()
    items = [
        AdminPaymentOut(
            id=p.id, tx_ref=p.tx_ref, account_id=p.account_id, account_name=name,
            account_email=email, amount_ugx=p.amount_ugx, currency=p.currency, method=p.method,
            status=p.status, provider=p.provider, purpose=p.purpose, created_at=p.created_at,
            refunded_at=p.refunded_at,
        )
        for p, name, email in rows
    ]
    # Aggregate stats across ALL payments (not just this page).
    agg = (await db.execute(
        select(Payment.status, func.count(), func.coalesce(func.sum(Payment.amount_ugx), 0))
        .group_by(Payment.status)
    )).all()
    by_status = {s: {"count": c, "volume": int(v)} for s, c, v in agg}
    stats = {
        "total": sum(x["count"] for x in by_status.values()),
        "successful": by_status.get("successful", {}).get("count", 0),
        "pending": by_status.get("pending", {}).get("count", 0)
        + by_status.get("created", {}).get("count", 0),
        "failed": by_status.get("failed", {}).get("count", 0)
        + by_status.get("timeout", {}).get("count", 0),
        "refunded": by_status.get("refunded", {}).get("count", 0),
        "volume_ugx": by_status.get("successful", {}).get("volume", 0),
    }
    return AdminPaymentsResponse(items=items, stats=stats)


@router.post("/payments/transactions/{tx_ref}/refund", response_model=PaymentOut)
async def refund_payment(
    tx_ref: str,
    body: RefundRequest,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentOut:
    res = await db.execute(select(Payment).where(Payment.tx_ref == tx_ref))
    payment = res.scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    already_refunded = payment.status == "refunded"
    try:
        payment = await payment_service.refund_payment(
            db, payment, reason=body.reason or "admin refund", actor_email=admin.email,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    # Audit only a real transition — an idempotent no-op on an already-refunded
    # payment must not inflate the audit log with a refund that didn't happen.
    if not already_refunded and payment.status == "refunded":
        await record_audit(
            db, actor_id=admin.id, actor_email=admin.email, action="payment.refund",
            resource_type="payment", resource_id=str(payment.id),
            details={"tx_ref": tx_ref, "reason": body.reason},
        )
        await db.commit()
    return PaymentOut.model_validate(payment)


@router.get("/subscriptions", response_model=AdminSubscriptionsResponse)
async def list_subscriptions(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(200, ge=1, le=500),
) -> AdminSubscriptionsResponse:
    rows = (await db.execute(
        select(Subscription, Account.name, Account.email, Plan.name, Plan.price_ugx)
        .join(Account, Account.id == Subscription.account_id, isouter=True)
        .join(Plan, Plan.id == Subscription.plan_id, isouter=True)
        .order_by(Subscription.created_at.desc())
        .limit(min(limit, 500))
    )).all()
    items = [
        AdminSubscriptionOut(
            id=s.id, account_id=s.account_id, account_name=aname, account_email=aemail,
            plan_name=pname, price_ugx=pprice, status=s.status,
            current_period_start=s.current_period_start, current_period_end=s.current_period_end,
        )
        for s, aname, aemail, pname, pprice in rows
    ]
    mrr = sum((i.price_ugx or 0) for i in items if i.status == "active")
    stats = {
        "active": sum(1 for i in items if i.status == "active"),
        "past_due": sum(1 for i in items if i.status == "past_due"),
        "cancelled": sum(1 for i in items if i.status == "cancelled"),
        "total": len(items),
        "mrr_ugx": mrr,
    }
    return AdminSubscriptionsResponse(items=items, stats=stats)
