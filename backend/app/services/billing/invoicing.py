"""Invoice creation, VAT breakdown, and gapless per-year numbering.

VAT (Uganda, 18% standard). Plan prices are quoted VAT-INCLUSIVE, so the gross
`total` is what the customer pays and the net + VAT are backed out of it:

    net = round(total / (1 + rate));  vat = total - net

This keeps `net + vat == total` exactly (no rounding drift on the amount charged).
When VAT_INCLUSIVE is False the total is treated as net and VAT is added on top.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Account
from app.models.billing import Payment, Plan, Subscription
from app.models.invoicing import Invoice, InvoiceSequence

log = logging.getLogger("bulkreach.billing")


@dataclass(frozen=True)
class VatBreakdown:
    subtotal: int  # net of VAT (whole UGX)
    vat: int
    total: int  # gross charged
    rate: float


def compute_vat_breakdown(total_or_net_ugx: int, *, rate: float | None = None,
                          inclusive: bool | None = None) -> VatBreakdown:
    """Split an amount into net + VAT. `inclusive` decides whether the input is the
    gross total (default, VAT-inclusive pricing) or the net (VAT added on top)."""
    rate = settings.VAT_RATE if rate is None else rate
    inclusive = settings.VAT_INCLUSIVE if inclusive is None else inclusive
    amount = int(total_or_net_ugx)
    if rate <= 0:
        return VatBreakdown(subtotal=amount, vat=0, total=amount, rate=0.0)
    if inclusive:
        net = round(amount / (1 + rate))
        vat = amount - net
        return VatBreakdown(subtotal=net, vat=vat, total=amount, rate=rate)
    vat = round(amount * rate)
    return VatBreakdown(subtotal=amount, vat=vat, total=amount + vat, rate=rate)


async def next_invoice_number(db: AsyncSession, *, when: datetime | None = None) -> str:
    """Allocate the next gapless invoice number for the calendar year.

    Locks (or creates) the year's counter row FOR UPDATE so two concurrent
    settlements serialize — no duplicate, no gap. Format: BR-INV-2026-000001.
    """
    when = when or datetime.now(timezone.utc)
    year = when.year
    row = (
        await db.execute(
            select(InvoiceSequence).where(InvoiceSequence.year == year).with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        row = InvoiceSequence(year=year, last_number=0)
        db.add(row)
        await db.flush()
        # Re-select FOR UPDATE so a racing inserter blocks on the now-committed row.
        row = (
            await db.execute(
                select(InvoiceSequence).where(InvoiceSequence.year == year).with_for_update()
            )
        ).scalar_one()
    row.last_number += 1
    await db.flush()
    return f"BR-INV-{year}-{row.last_number:06d}"


async def create_invoice_for_payment(db: AsyncSession, payment: Payment) -> Invoice | None:
    """Issue a paid invoice (doubling as the receipt) for a settled subscription
    payment. Idempotent: a second call for the same payment returns the existing
    invoice. VAT is derived from the amount actually charged; any proration credit
    stashed on the payment is shown as a discount line."""
    if payment.purpose != "subscription":
        return None
    existing = (
        await db.execute(select(Invoice).where(Invoice.payment_id == payment.id))
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    account = await db.get(Account, payment.account_id)
    if account is None:
        return None
    plan = await db.get(Plan, payment.plan_id) if payment.plan_id else None
    sub = (
        await db.execute(select(Subscription).where(Subscription.account_id == payment.account_id))
    ).scalar_one_or_none()

    proration = (payment.raw_response or {}).get("_proration") or {}
    credit = int(proration.get("credit_ugx", 0) or 0)
    base_price = int(proration.get("base_price_ugx", payment.amount_ugx) or payment.amount_ugx)

    vat = compute_vat_breakdown(payment.amount_ugx)
    number = await next_invoice_number(db)

    plan_label = (plan.name if plan else None) or "Subscription"
    period = f"{settings.SUBSCRIPTION_PERIOD_DAYS} days"
    line_items: list[dict] = [
        {"description": f"{plan_label} plan · {period}", "amount_ugx": base_price},
    ]
    if credit > 0:
        line_items.append(
            {"description": "Proration credit (unused time on previous plan)", "amount_ugx": -credit}
        )
    line_items.append(
        {"description": f"of which VAT ({round(vat.rate * 100)}%)", "amount_ugx": vat.vat, "meta": "vat"}
    )

    invoice = Invoice(
        account_id=account.id,
        payment_id=payment.id,
        subscription_id=sub.id if sub else None,
        plan_id=plan.id if plan else None,
        number=number,
        kind="receipt",
        status="paid",
        currency=payment.currency,
        subtotal_ugx=vat.subtotal,
        vat_rate=vat.rate,
        vat_ugx=vat.vat,
        total_ugx=vat.total,
        proration_credit_ugx=credit,
        billing_name=account.name,
        billing_email=account.email,
        plan_name=plan.name if plan else None,
        line_items=line_items,
        period_start=sub.current_period_start if sub else None,
        period_end=sub.current_period_end if sub else None,
    )
    db.add(invoice)
    await db.flush()
    log.info("invoice issued %s acct=%s total=%s", number, account.id, vat.total)
    return invoice
