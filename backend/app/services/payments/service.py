# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""PaymentService — orchestrates the transaction state machine.

    created → pending → (successful | failed | timeout)

Golden rules enforced here (payments skill):
- Amount/currency/plan are server-authoritative; the client only names a plan.
- A tx_ref + Payment row are written BEFORE any provider call.
- Terminal states are write-once; a duplicated webhook/poll is a logged no-op.
- Success is only granted after a server-side verify() whose amount matches the
  stored intent — never from an unverified webhook.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Account
from app.models.billing import Payment, Plan, Subscription
from app.models.payment_provider import RawWebhookEvent
from app.services.payments import registry
from app.services.payments.base import FAILED, PENDING, SUCCESSFUL, Customer

log = logging.getLogger("bulkreach.payments")

_TERMINAL = {SUCCESSFUL, FAILED, "timeout"}


def _mask_phone(phone: str) -> str:
    return ("••••" + phone[-4:]) if phone and len(phone) > 4 else "••••"


def _new_tx_ref() -> str:
    return f"BR-{uuid.uuid4().hex[:24]}"


@dataclass
class CheckoutIntent:
    """What the client needs to render the right custom checkout step.

    mode drives the UI:
      simulated  → dev: show a simulated-confirm panel, then poll verify
      inline     → Flutterwave Inline: load the JS widget with `inline` params
                   (card entry stays on our page, gateway-secured — SAQ-A)
      ussd_push  → direct MoMo/Airtel: STK push fired; show "check your phone" + poll
      redirect   → aggregator hosted page (Pesapal / FW non-card): send to redirect_url
    """

    payment: Payment
    mode: str
    redirect_url: str | None = None
    inline: dict | None = None


class PaymentService:
    async def start_checkout(
        self,
        db: AsyncSession,
        account: Account,
        *,
        method: str,
        plan_id: uuid.UUID | None,
        customer: Customer,
        callback_url: str,
        purpose: str = "subscription",
    ) -> CheckoutIntent:
        # Server-authoritative amount: subscription price comes from the plan row.
        plan: Plan | None = None
        if plan_id is not None:
            plan = await db.get(Plan, plan_id)
            if plan is None:
                raise ValueError("Unknown plan")
        if plan is None:
            raise ValueError("A plan is required to start checkout")
        currency = "UGX"

        # Server-authoritative amount, proration-aware: an upgrade mid-cycle credits
        # the unused time on the current plan. The credit is stashed on the payment so
        # the invoice can show it, and so verify() checks against the amount charged.
        from app.services.billing.proration import compute_proration

        proration = await compute_proration(db, account.id, plan)
        amount = int(proration.amount_due_ugx)

        provider = await registry.resolve_provider_for_method(db, method)
        slug = provider.slug
        tx_ref = _new_tx_ref()

        payment = Payment(
            account_id=account.id,
            amount_ugx=amount,
            currency=currency,
            method=method,
            status="created",
            purpose=purpose,
            provider=slug,
            tx_ref=tx_ref,
            plan_id=plan.id,
            raw_response={"_proration": {
                "credit_ugx": proration.credit_ugx,
                "base_price_ugx": proration.base_price_ugx,
                "days_remaining": proration.days_remaining,
            }} if proration.applies else {},
        )
        db.add(payment)
        await db.flush()  # persist CREATED before any provider call

        # Simulator (dev only): no external call; the custom UI drives a simulated
        # confirmation then polls verify (which the simulator reports successful).
        if slug == "simulator":
            payment.status = PENDING
            await db.commit()
            await db.refresh(payment)
            return CheckoutIntent(payment=payment, mode="simulated")

        # Flutterwave card → Inline: the secure card widget runs client-side on OUR
        # page. We persist only the intent and return the PUBLIC key — never call the
        # hosted-redirect charge, and no card data ever touches our server (SAQ-A).
        if slug == "flutterwave" and method == "card":
            payment.status = PENDING
            await db.commit()
            await db.refresh(payment)
            return CheckoutIntent(payment=payment, mode="inline", inline={
                "provider": "flutterwave",
                "public_key": provider.cred("public_key"),
                "tx_ref": tx_ref,
                "amount": amount,
                "currency": currency,
                "email": customer.email,
                "name": customer.name,
                "phone": customer.phone,
            })

        # Everything else calls the provider: direct telco → STK push (no redirect →
        # ussd_push); aggregator (Pesapal / FW non-card) → hosted redirect.
        result = await provider.create_charge(
            tx_ref=tx_ref, amount=amount, currency=currency, method=method,
            customer=customer, callback_url=callback_url,
        )
        payment.raw_response = result.raw or {}
        if not result.ok:
            payment.status = FAILED
            await db.commit()
            log.warning("checkout failed acct=%s method=%s err=%s", account.id, method, result.error)
            raise ValueError(result.error or "Payment initiation failed")

        payment.status = PENDING
        payment.provider_tx_id = result.provider_tx_id
        payment.raw_response = {**payment.raw_response, "_redirect_url": result.redirect_url}
        await db.commit()
        await db.refresh(payment)
        mode = "redirect" if result.redirect_url else "ussd_push"
        return CheckoutIntent(
            payment=payment, mode=mode, redirect_url=result.redirect_url
        )

    async def reconcile(self, db: AsyncSession, payment: Payment) -> Payment:
        """Poll the provider for authoritative status and apply it idempotently.

        The provider verify() (a network call) runs WITHOUT a DB lock; the state
        transition then re-reads the row `FOR UPDATE` so a concurrent /verify and
        webhook reconcile for the same tx_ref serialize — the loser sees the
        terminal status and no-ops (no double credit)."""
        if payment.status in _TERMINAL:
            return payment
        provider = await registry.load_provider_by_slug(db, payment.provider or "")
        if provider is None:
            return payment
        verify = await provider.verify(tx_ref=payment.tx_ref, provider_tx_id=payment.provider_tx_id)
        locked = await db.execute(
            select(Payment).where(Payment.id == payment.id).with_for_update()
        )
        payment = locked.scalar_one()
        await self._apply(db, payment, verify.status, amount=verify.amount,
                          currency=verify.currency, raw=verify.raw,
                          provider_tx_id=verify.provider_tx_id)
        return payment

    async def reconcile_stale(
        self, db: AsyncSession, *, older_than_minutes: int = 2,
        timeout_after_minutes: int = 30, limit: int = 100,
    ) -> dict:
        """Backstop for missed webhooks: re-verify PENDING payments, and mark ones
        stuck past `timeout_after_minutes` as timed out. Run on a schedule."""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=older_than_minutes)
        deadline = now - timedelta(minutes=timeout_after_minutes)
        res = await db.execute(
            select(Payment).where(Payment.status == PENDING, Payment.created_at <= cutoff).limit(limit)
        )
        pending = list(res.scalars())
        reconciled = timed_out = 0
        for p in pending:
            try:
                await self.reconcile(db, p)
            except Exception:  # noqa: BLE001 — one bad row must not stall the sweep
                log.exception("reconcile_stale failed tx=%s", p.tx_ref)
                await db.rollback()
                continue
            await db.refresh(p)
            if p.status != PENDING:
                reconciled += 1
            elif p.created_at <= deadline:
                locked = (await db.execute(
                    select(Payment).where(Payment.id == p.id).with_for_update()
                )).scalar_one()
                if locked.status == PENDING:
                    locked.status = "timeout"
                    await db.commit()
                    timed_out += 1
        return {"checked": len(pending), "reconciled": reconciled, "timed_out": timed_out}

    async def handle_webhook(
        self, db: AsyncSession, slug: str, *, headers, raw_body: bytes, payload: dict, source_ip: str | None,
    ) -> bool:
        """Return True if accepted (200). Store raw verbatim, verify signature,
        then reconcile authoritatively. Unknown tx → 200 + log (no retry storm)."""
        provider = await registry.load_provider_by_slug(db, slug)
        sig_ok = bool(provider) and provider.verify_webhook_signature(headers=headers, raw_body=raw_body)
        parsed = provider.parse_webhook(payload) if provider else None

        db.add(RawWebhookEvent(
            provider=slug, signature_valid=sig_ok,
            tx_ref=parsed.tx_ref if parsed else None,
            source_ip=source_ip, payload=payload,
        ))
        await db.flush()

        if provider is None:
            await db.commit()
            return False
        if not sig_ok:
            await db.commit()
            log.warning("webhook signature REJECTED provider=%s ip=%s", slug, source_ip)
            return False
        if parsed is None or not parsed.tx_ref:
            await db.commit()
            return True

        res = await db.execute(select(Payment).where(Payment.tx_ref == parsed.tx_ref))
        payment = res.scalar_one_or_none()
        if payment is None:
            await db.commit()
            log.warning("webhook for unknown tx_ref=%s provider=%s", parsed.tx_ref, slug)
            return True
        if payment.status in _TERMINAL:
            await db.commit()  # already settled — no-op
            return True

        # Always reconcile via server-side verify (skill: don't trust webhook status).
        await self.reconcile(db, payment)
        return True

    async def _apply(
        self, db: AsyncSession, payment: Payment, status: str, *,
        amount: float | None, currency: str | None, raw: dict | None, provider_tx_id: str | None,
    ) -> None:
        if payment.status in _TERMINAL:
            log.info("terminal no-op tx=%s already=%s", payment.tx_ref, payment.status)
            return
        if provider_tx_id and not payment.provider_tx_id:
            payment.provider_tx_id = provider_tx_id
        if raw:
            payment.raw_response = {**(payment.raw_response or {}), "verify": raw}

        if status == SUCCESSFUL:
            if payment.provider == "simulator":
                # Dev-only provider reports no amount; never credit in production.
                if settings.is_production:
                    payment.status = FAILED
                    log.error("simulator settlement blocked in production tx=%s", payment.tx_ref)
                    await self._on_failure(db, payment, reason="provider_unavailable")
                    await db.commit()
                    return
            else:
                # Fail closed: a real provider MUST report an amount+currency that
                # matches the stored intent. Missing is treated as a mismatch.
                if amount is None or int(round(float(amount))) != payment.amount_ugx:
                    payment.status = FAILED
                    log.error("AMOUNT MISMATCH/ABSENT tx=%s intent=%s got=%s",
                              payment.tx_ref, payment.amount_ugx, amount)
                    await self._on_failure(db, payment, reason="amount_mismatch")
                    await db.commit()
                    return
                if not currency or currency.upper() != payment.currency.upper():
                    payment.status = FAILED
                    log.error("CURRENCY MISMATCH/ABSENT tx=%s intent=%s got=%s",
                              payment.tx_ref, payment.currency, currency)
                    await self._on_failure(db, payment, reason="currency_mismatch")
                    await db.commit()
                    return
            payment.status = SUCCESSFUL
            await self._on_success(db, payment)
        elif status in _TERMINAL:
            payment.status = status
            await self._on_failure(db, payment, reason=status)
        else:
            payment.status = PENDING
        await db.commit()

    async def refund_payment(
        self, db: AsyncSession, payment: Payment, *, reason: str, actor_email: str | None = None,
    ) -> Payment:
        """Refund a successful payment. Idempotent + row-locked: only a `successful`
        payment can be refunded, and a second attempt on an already-`refunded` row
        is a no-op (never double-refunds)."""
        locked = await db.execute(
            select(Payment).where(Payment.id == payment.id).with_for_update()
        )
        payment = locked.scalar_one()
        if payment.status == "refunded":
            return payment  # already refunded — no-op
        if payment.status != SUCCESSFUL:
            raise ValueError("Only a successful payment can be refunded")

        provider = await registry.load_provider_by_slug(db, payment.provider or "")
        if provider is None:
            raise ValueError("Payment provider unavailable")
        result = await provider.refund(
            tx_ref=payment.tx_ref, provider_tx_id=payment.provider_tx_id,
            amount=float(payment.amount_ugx), currency=payment.currency, reason=reason,
        )
        if not result.ok:
            log.warning("refund failed tx=%s err=%s", payment.tx_ref, result.error)
            raise ValueError(result.error or "Refund failed at provider")

        payment.status = "refunded"
        payment.refunded_at = datetime.now(timezone.utc)
        payment.refund_provider_id = result.provider_refund_id
        payment.refund_reason = reason
        payment.raw_response = {**(payment.raw_response or {}), "refund": result.raw}
        # Reflect the downgrade: drop the account off the paid plan — UNLESS the
        # subscription was manually assigned by an admin (a custom deal is not tied
        # to this payment and must survive a refund).
        account = await db.get(Account, payment.account_id)
        if account is not None and payment.purpose == "subscription":
            res = await db.execute(select(Subscription).where(Subscription.account_id == account.id))
            sub = res.scalar_one_or_none()
            if sub is None or not sub.manually_assigned:
                account.plan = "trial"
                if sub is not None:
                    sub.status = "cancelled"
        await db.commit()
        log.info("refund ok tx=%s by=%s", payment.tx_ref, actor_email or "system")

        # Notify the account that the refund downgraded them off their paid plan.
        if account is not None and payment.purpose == "subscription":
            try:
                from app.services.notifications import notify

                await notify(
                    db, account_id=account.id, type="billing.subscription_cancelled",
                    level="warning", title="Your subscription was cancelled",
                    body=f"A refund of UGX {payment.amount_ugx:,} was issued and your plan "
                         "was moved back to Trial.",
                    link="/dashboard/billing",
                    meta={"tx_ref": payment.tx_ref, "reason": reason},
                )
                await db.commit()
            except Exception:  # noqa: BLE001 — a notice must not fail a completed refund
                log.warning("refund notification failed tx=%s", payment.tx_ref)
        return payment

    async def _on_success(self, db: AsyncSession, payment: Payment) -> None:
        """Grant what was paid for. Idempotent across payments via a UNIQUE
        constraint on subscriptions.account_id + an atomic upsert, so two
        successful payments for one account can't create duplicate subscriptions.
        Reactivates a past_due/suspended account (repayment clears dunning) and
        issues the invoice/receipt."""
        if payment.purpose != "subscription" or payment.plan_id is None:
            return
        plan = await db.get(Plan, payment.plan_id)
        account = await db.get(Account, payment.account_id)
        if plan is None or account is None:
            return
        account.plan = plan.name.lower()
        if account.status == "suspended":
            account.status = "active"  # repayment restores a dunning-suspended account
        now = datetime.now(timezone.utc)
        period_end = now + timedelta(days=settings.SUBSCRIPTION_PERIOD_DAYS)
        # A real paid settlement produces a payment-driven subscription: clear any
        # admin manual-assignment overrides so the row renews/dunns/refunds normally.
        # (A "was-manual, now-pays" row that kept manually_assigned=True would be
        # skipped by the renewal sweep and the refund downgrade — indefinite free
        # service + refund-proof.)
        reset = dict(
            plan_id=plan.id, status="active",
            current_period_start=now, current_period_end=period_end,
            dunning_stage=0, past_due_since=None, last_dunning_at=None, grace_until=None,
            manually_assigned=False,
            custom_messages_per_month=None, custom_daily_limit=None,
            custom_price_ugx=None, custom_features=None,
        )
        stmt = pg_insert(Subscription).values(
            account_id=account.id, **reset,
        ).on_conflict_do_update(
            index_elements=[Subscription.account_id], set_=reset,
        )
        await db.execute(stmt)
        log.info("subscription activated acct=%s plan=%s tx=%s", account.id, plan.name, payment.tx_ref)

        # Issue the invoice/receipt (idempotent). Best-effort: never fail settlement
        # because a document couldn't be written.
        try:
            from app.services.billing.invoicing import create_invoice_for_payment

            invoice = await create_invoice_for_payment(db, payment)
        except Exception:  # noqa: BLE001
            invoice = None
            log.exception("invoice generation failed tx=%s (payment still settled)", payment.tx_ref)

        try:
            from app.services.notifications import notify

            await notify(
                db, account_id=account.id, type="payment.succeeded", level="success",
                title=f"Payment received — {plan.name} plan active",
                body=f"Your payment of UGX {payment.amount_ugx:,} was successful.",
                link="/dashboard/billing",
                meta={"tx_ref": payment.tx_ref, "amount_ugx": payment.amount_ugx,
                      "invoice_number": invoice.number if invoice else None},
            )
        except Exception:  # noqa: BLE001 — a notice must never fail settlement
            log.warning("payment notification failed tx=%s", payment.tx_ref)

    async def _on_failure(self, db: AsyncSession, payment: Payment, *, reason: str) -> None:
        """Tell the account a subscription charge did not go through. Force-emails so
        a user who has left the checkout still learns their payment failed. Best-effort
        — a notice must never interfere with recording the failed payment."""
        if payment.purpose != "subscription":
            return
        try:
            from app.services.notifications import notify

            await notify(
                db, account_id=payment.account_id, type="payment.failed", level="error",
                title="Your payment could not be completed",
                body=f"We couldn't process your payment of UGX {payment.amount_ugx:,}. "
                     "Please try again or use a different method.",
                link="/dashboard/billing", force_email=True,
                meta={"tx_ref": payment.tx_ref, "reason": reason},
            )
        except Exception:  # noqa: BLE001
            log.warning("payment-failed notification failed tx=%s", payment.tx_ref)


payment_service = PaymentService()
