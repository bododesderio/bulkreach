# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Payments API (Section 14): client checkout, verification, history, webhooks.

Providers and method routing are configured by superadmins (see admin/payments).
This router is what clients and gateways touch. Webhook endpoints are unauthenticated
by design — they authenticate via provider signature inside the service.
"""
from __future__ import annotations

import json
import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.redis import sliding_window_allow
from app.models.account import Account
from app.models.billing import Payment, Plan
from app.schemas.payment import (
    CheckoutRequest,
    CheckoutResponse,
    PaymentMethodOut,
    PaymentOut,
    PlanOut,
)
from app.services.payments import payment_service
from app.services.payments import registry
from app.services.payments.base import Customer

router = APIRouter(prefix="/payments", tags=["payments"])

MAX_WEBHOOK_BYTES = 64 * 1024  # provider callbacks are tiny; cap to resist flooding
_PHONE_RE = re.compile(r"^\+?\d{9,15}$")


def _callback_base() -> str:
    return (settings.PAYMENTS_CALLBACK_BASE_URL or settings.FRONTEND_URL).rstrip("/")


@router.get("/plans", response_model=list[PlanOut])
async def plans(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PlanOut]:
    res = await db.execute(
        select(Plan).where(Plan.status == "active")
        .order_by(Plan.display_order.asc(), Plan.price_ugx.asc())
    )
    return [PlanOut.model_validate(p) for p in res.scalars()]


@router.get("/methods", response_model=list[PaymentMethodOut])
async def methods(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PaymentMethodOut]:
    return [PaymentMethodOut(**m) for m in await registry.enabled_methods(db)]


@router.post("/checkout", response_model=CheckoutResponse)
async def checkout(
    body: CheckoutRequest,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CheckoutResponse:
    # Spending the account's money / changing its plan is an owner/admin action —
    # a low-privilege member must not be able to initiate a charge.
    if user.role not in ("owner", "admin"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only an account owner or admin can make a payment.",
        )
    if not await sliding_window_allow(f"pay:checkout:{user.account_id}", max_hits=10, window_seconds=60):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many checkout attempts, try again shortly")
    account = await db.get(Account, user.account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    if body.method in ("mtn_momo", "airtel_money"):
        if not body.phone or not _PHONE_RE.match(body.phone.strip()):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "A valid phone number is required for mobile money (e.g. +2567XXXXXXXX)",
            )
    customer = Customer(email=account.email, name=account.name, phone=body.phone)
    callback_url = f"{_callback_base()}/dashboard/billing/callback"
    try:
        intent = await payment_service.start_checkout(
            db, account, method=body.method, plan_id=body.plan_id,
            customer=customer, callback_url=callback_url, purpose=body.purpose,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return CheckoutResponse(
        payment_id=intent.payment.id, tx_ref=intent.payment.tx_ref, status=intent.payment.status,
        mode=intent.mode, redirect_url=intent.redirect_url, inline=intent.inline,
    )


@router.get("/{tx_ref}/verify", response_model=PaymentOut)
async def verify(
    tx_ref: str,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentOut:
    res = await db.execute(
        select(Payment).where(Payment.tx_ref == tx_ref, Payment.account_id == user.account_id)
    )
    payment = res.scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    await payment_service.reconcile(db, payment)
    return PaymentOut.model_validate(payment)


@router.get("/history", response_model=list[PaymentOut])
async def history(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
) -> list[PaymentOut]:
    res = await db.execute(
        select(Payment)
        .where(Payment.account_id == user.account_id)
        .order_by(Payment.created_at.desc())
        .limit(min(limit, 200))
    )
    return [PaymentOut.model_validate(p) for p in res.scalars()]


@router.post("/webhooks/{provider}", include_in_schema=False)
async def webhook(
    provider: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    source_ip_early = request.client.host if request.client else "unknown"
    # Throttle the public webhook to blunt flooding / storage-exhaustion (the raw
    # event is only persisted inside handle_webhook, after this gate).
    if not await sliding_window_allow(f"pay:webhook:{source_ip_early}", max_hits=120, window_seconds=60):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Rate limited")
    raw = await request.body()
    if len(raw) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Payload too large")
    try:
        payload = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        payload = dict(request.query_params)  # Pesapal IPN may arrive as query params
    if not isinstance(payload, dict):
        payload = {}  # a JSON array/scalar is not a valid callback body
    source_ip = request.client.host if request.client else None
    accepted = await payment_service.handle_webhook(
        db, provider, headers=request.headers, raw_body=raw, payload=payload, source_ip=source_ip,
    )
    if not accepted:
        # Signature failure / unknown provider → 401 (do not process, do not 200).
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook")
    return {"status": "ok"}
