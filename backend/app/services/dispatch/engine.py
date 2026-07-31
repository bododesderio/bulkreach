# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Campaign dispatch engine (Section 3.3).

Orchestrates one campaign end-to-end: renders each message per-recipient, sends
in bounded-concurrency batches through the selected providers, tracks every
message in the `messages` table, retries transient failures with exponential
backoff (≤ max_attempts), streams progress to Redis, and finalises campaign
counters. Callable directly (tests) or from the ARQ worker task.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Sequence
from datetime import datetime, timezone
from itertools import islice
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import settings
from app.core.database import LiveSessionLocal
from app.models.account import Account
from app.models.campaign import Campaign, CampaignContact, Message
from app.services.template_engine import (
    TemplateError,
    render_email_body,
    render_sms,
    render_subject,
)

from . import progress
from .base import SendResult
from .email_providers import get_email_provider
from .sms_providers import get_sms_provider

logger = logging.getLogger("bulkreach.dispatch.engine")

# Concurrent in-flight sends. Providers rate-limit server-side; this bounds our
# own fan-out. A batch is the commit/progress-flush unit between inter-batch sleeps.
_CONCURRENCY = 20


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _chunk(seq: Sequence, size: int):
    it = iter(seq)
    while batch := list(islice(it, size)):
        yield batch


def _backoff_seconds(round_idx: int) -> float:
    # 1s, 2s, 4s, ... capped — exercised for real in prod, tiny in tests via monkeypatch.
    return min(2.0**round_idx, 30.0)


async def _refund_unsent(db, account, refund: int) -> None:
    """Refund reserved-but-unsent monthly/daily quota (paid plans only; trial is
    DB-metered up-front). `refund` = reserved message_count − actually sent."""
    if account is None or (account.plan or "").lower() == "trial" or refund <= 0:
        return
    from app.services.subscription import quota as quota_svc

    await quota_svc.release(account.id, refund)


async def _send_one(message, campaign, merge_map, sms_provider, email_provider, sem) -> SendResult:
    data = merge_map.get(message.campaign_contact_id, {})
    async with sem:
        try:
            if message.channel == "sms":
                body = render_sms(campaign.sms_body or "", data)
                return await sms_provider.send(
                    to=message.recipient, body=body, sender_id=campaign.sms_sender_id
                )
            subject = render_subject(campaign.email_subject or "", data)
            html = render_email_body(campaign.email_html_body or "", data)
            plain = render_sms(campaign.email_plain_body or "", data) if campaign.email_plain_body else None
            return await email_provider.send(
                to=message.recipient,
                subject=subject,
                html=html,
                plain=plain,
                from_email=campaign.from_email or settings.DEFAULT_FROM_EMAIL,
                from_name=campaign.from_name or settings.DEFAULT_FROM_NAME,
            )
        except TemplateError as exc:
            return SendResult(False, "render", error=f"template_error: {exc}", retriable=False)
        except Exception as exc:  # noqa: BLE001 — never let one recipient crash the run
            return SendResult(False, "engine", error=f"{type(exc).__name__}: {exc}")


async def dispatch_campaign(
    campaign_id: UUID | str,
    *,
    session_factory: async_sessionmaker | None = None,
) -> dict:
    """Dispatch a single campaign. Idempotent-ish: only picks up queued/sending
    messages, so a re-run resumes rather than duplicating."""
    session_factory = session_factory or LiveSessionLocal
    started = time.monotonic()

    async with session_factory() as db:
        campaign = await db.get(Campaign, campaign_id)
        if campaign is None:
            logger.warning("dispatch: campaign %s not found", campaign_id)
            return {"status": "not_found"}
        if campaign.status in ("completed", "cancelled"):
            logger.info("dispatch: campaign %s already %s", campaign_id, campaign.status)
            return {"status": campaign.status}

        messages = list(
            (
                await db.execute(
                    select(Message).where(
                        Message.campaign_id == campaign.id,
                        Message.status.in_(("queued", "sending")),
                    )
                )
            ).scalars()
        )
        total = len(messages)

        if total == 0:
            campaign.status = "completed"
            campaign.completed_at = _utcnow()
            await db.commit()
            await progress.write(campaign_id, status="completed", total=0, sent=0, failed=0)
            return {"status": "completed", "total": 0}

        # Merge data per recipient (rendering context).
        cc_ids = {m.campaign_contact_id for m in messages if m.campaign_contact_id}
        merge_map: dict = {}
        if cc_ids:
            rows = (
                await db.execute(select(CampaignContact).where(CampaignContact.id.in_(cc_ids)))
            ).scalars()
            merge_map = {r.id: (r.merge_data or {}) for r in rows}

        # Quota is RESERVED atomically at queue time (enforce_send), so a queued
        # campaign already owns its allowance and cannot be starved by a concurrent
        # campaign — the old Layer-3 `monthly_exhausted` pause is now obsolete (and
        # would false-positive, since `used` includes this campaign's own reservation).
        account = await db.get(Account, campaign.account_id)

        campaign.status = "sending"
        await db.commit()

        sms_provider = get_sms_provider()
        email_provider = get_email_provider()
        logger.info(
            "dispatch: campaign %s → %d messages · sms=%s email=%s",
            campaign_id, total, sms_provider.name, email_provider.name,
        )

        sem = asyncio.Semaphore(_CONCURRENCY)
        sent = failed = 0
        sms_sent = sms_failed = email_sent = email_failed = 0
        await progress.write(campaign_id, status="sending", total=total, sent=0, failed=0)

        async def flush_progress(status: str = "sending") -> None:
            await progress.write(
                campaign_id, status=status, total=total, sent=sent, failed=failed,
                sms_sent=sms_sent, sms_failed=sms_failed,
                email_sent=email_sent, email_failed=email_failed,
            )

        pending = messages
        max_rounds = max((m.max_attempts for m in messages), default=1)
        batch_size = max(settings.SMS_BATCH_SIZE, settings.EMAIL_BATCH_SIZE)

        for round_idx in range(max_rounds):
            if not pending:
                break

            # Honour a cancellation requested mid-flight (checked per round).
            current_status = await db.scalar(select(Campaign.status).where(Campaign.id == campaign.id))
            if current_status == "cancelled":
                logger.info("dispatch: campaign %s cancelled mid-flight", campaign_id)
                await _refund_unsent(db, account, len(messages) - sent)
                await flush_progress(status="cancelled")
                return {"status": "cancelled", "sent": sent, "failed": failed}

            retriable: list = []
            for batch in _chunk(pending, batch_size):
                # Also honour cancellation BETWEEN batches, so a large single-round
                # campaign can actually be stopped (not only between retry rounds).
                if await db.scalar(select(Campaign.status).where(Campaign.id == campaign.id)) == "cancelled":
                    logger.info("dispatch: campaign %s cancelled mid-batch", campaign_id)
                    await _refund_unsent(db, account, len(messages) - sent)
                    await flush_progress(status="cancelled")
                    return {"status": "cancelled", "sent": sent, "failed": failed}
                results = await asyncio.gather(
                    *[_send_one(m, campaign, merge_map, sms_provider, email_provider, sem) for m in batch]
                )
                for message, res in zip(batch, results):
                    message.attempts += 1
                    message.provider = res.provider
                    if res.ok:
                        message.status = "sent"
                        message.provider_message_id = res.provider_message_id
                        message.error_reason = None
                        message.sent_at = _utcnow()
                        sent += 1
                        if message.channel == "sms":
                            sms_sent += 1
                        else:
                            email_sent += 1
                    else:
                        message.error_reason = res.error
                        if res.retriable and message.attempts < message.max_attempts:
                            message.status = "sending"
                            retriable.append(message)
                        else:
                            message.status = "failed"
                            failed += 1
                            if message.channel == "sms":
                                sms_failed += 1
                            else:
                                email_failed += 1
                await db.commit()
                await flush_progress()
                if settings.INTER_BATCH_DELAY_SECONDS:
                    await asyncio.sleep(settings.INTER_BATCH_DELAY_SECONDS)

            pending = retriable
            if pending and round_idx < max_rounds - 1:
                await asyncio.sleep(_backoff_seconds(round_idx))

        # Anything still pending after all rounds is a terminal failure.
        for message in pending:
            message.status = "failed"
            failed += 1
            if message.channel == "sms":
                sms_failed += 1
            else:
                email_failed += 1

        campaign.status = "completed"
        campaign.completed_at = _utcnow()
        campaign.messages_sent = sent
        campaign.sms_sent = sms_sent
        campaign.sms_failed = sms_failed
        campaign.email_sent = email_sent
        campaign.email_failed = email_failed
        campaign.elapsed_seconds = round(time.monotonic() - started, 3)
        await db.commit()

        # Quota was RESERVED up-front at queue time (message_count). Refund the
        # messages that ultimately didn't send so the counter reflects actual
        # dispatched volume (trial allowance is DB-metered up-front, not here).
        if account is not None and (account.plan or "").lower() != "trial":
            from app.services.subscription import enforce, quota as quota_svc
            try:
                await _refund_unsent(db, account, len(messages) - sent)
                # Warn once/month when monthly usage crosses 80/90/100%.
                limits = await enforce.resolve_limits(db, account)
                if limits and not limits.is_trial and limits.monthly_limit:
                    from app.services.notifications import notify_quota_threshold

                    used = await quota_svc.get_monthly_used(account.id)
                    await notify_quota_threshold(db, account, used, limits.monthly_limit)
                    await db.commit()
            except Exception:  # noqa: BLE001 — metering must never fail a completed send
                logger.warning("quota refund failed for account %s", account.id)

        # Notify the account that their campaign finished. A run where nothing was
        # delivered is a failure, not a success — report it honestly at error level.
        if account is not None:
            try:
                from app.services.notifications import notify

                total_failure = sent == 0 and failed > 0
                if total_failure:
                    await notify(
                        db, account_id=account.id, type="campaign.failed", level="error",
                        title=f"Campaign “{campaign.name}” failed to send",
                        body=f"None of the {failed:,} messages could be delivered. "
                             "Open the campaign to review the errors.",
                        link=f"/dashboard/campaigns/{campaign_id}",
                        meta={"campaign_id": str(campaign_id), "sent": sent, "failed": failed},
                    )
                else:
                    await notify(
                        db, account_id=account.id, type="campaign.completed", level="success",
                        title=f"Campaign “{campaign.name}” finished",
                        body=f"{sent:,} delivered · {failed:,} failed.",
                        link=f"/dashboard/campaigns/{campaign_id}",
                        meta={"campaign_id": str(campaign_id), "sent": sent, "failed": failed},
                    )
                await db.commit()
            except Exception:  # noqa: BLE001 — never fail a completed send on a notice
                logger.warning("campaign-finish notification failed %s", campaign_id)

        await flush_progress(status="completed")

        logger.info(
            "dispatch: campaign %s done — sent=%d failed=%d in %.1fs",
            campaign_id, sent, failed, campaign.elapsed_seconds or 0.0,
        )
        return {
            "status": "completed", "total": total, "sent": sent, "failed": failed,
            "sms_sent": sms_sent, "sms_failed": sms_failed,
            "email_sent": email_sent, "email_failed": email_failed,
        }
