"""ARQ worker (Section 3.3) — background dispatch + scheduled-campaign promotion.

Run:  arq app.workers.WorkerSettings
The engine (services.dispatch.engine) does the real work; these are thin task
wrappers so the same logic is callable inline (dev/tests) or via the queue (prod).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from arq import cron
from arq.connections import RedisSettings

from app.core.config import settings
from app.core.database import ArchiveSessionLocal, LiveSessionLocal
from app.services import campaign_service
from app.services.dispatch import close_http, dispatch_campaign

logger = logging.getLogger("bulkreach.worker")

_pool = None


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.REDIS_URL)


async def get_arq_pool():
    """Shared ARQ pool for enqueuing from the API process."""
    global _pool
    if _pool is None:
        from arq import create_pool

        _pool = await create_pool(redis_settings())
    return _pool


async def enqueue_dispatch(campaign_id: UUID | str) -> str | None:
    """Enqueue a dispatch job; returns the ARQ job id (or None if unavailable)."""
    pool = await get_arq_pool()
    job = await pool.enqueue_job("dispatch_campaign_task", str(campaign_id))
    return job.job_id if job else None


# --- Task functions -------------------------------------------------------

async def dispatch_campaign_task(ctx: dict, campaign_id: str) -> dict:
    logger.info("worker: dispatching campaign %s", campaign_id)
    return await dispatch_campaign(UUID(campaign_id))


async def promote_scheduled(ctx: dict) -> int:
    """Cron: materialise + dispatch any scheduled campaign whose time has come."""
    now = datetime.now(timezone.utc)
    promoted = 0
    async with LiveSessionLocal() as db:
        from sqlalchemy import select

        from app.models.campaign import Campaign

        due = list(
            (
                await db.execute(
                    select(Campaign).where(
                        Campaign.status == "scheduled",
                        Campaign.scheduled_at.is_not(None),
                        Campaign.scheduled_at <= now,
                    )
                )
            ).scalars()
        )
        for campaign in due:
            try:
                await campaign_service.materialise_and_queue(db, campaign)
                await db.commit()
            except Exception:  # noqa: BLE001 — one bad campaign must not stall the poller
                await db.rollback()
                logger.exception("worker: failed to promote campaign %s", campaign.id)
                continue
            await enqueue_dispatch(campaign.id)
            promoted += 1
    if promoted:
        logger.info("worker: promoted %d scheduled campaign(s)", promoted)
    return promoted


async def reconcile_payments(ctx: dict) -> dict:
    """Cron: backstop for missed payment webhooks — re-verify stuck PENDING rows."""
    from app.services.payments import payment_service

    async with LiveSessionLocal() as db:
        result = await payment_service.reconcile_stale(db)
    if result.get("reconciled") or result.get("timed_out"):
        logger.info("worker: payments reconcile %s", result)
    return result


async def archive_ingest(ctx: dict) -> dict:
    """Cron (nightly): copy completed live campaigns/payments/reports into the
    archive DB and dedup master contacts."""
    from app.services.archive import archive_service

    async with LiveSessionLocal() as live_db, ArchiveSessionLocal() as archive_db:
        counts = await archive_service.ingest(live_db, archive_db)
        await live_db.commit()
        await archive_db.commit()
    if any(counts.values()):
        logger.info("worker: archive ingest %s", counts)
    return counts


async def archive_retention(ctx: dict) -> dict:
    """Cron (nightly): purge live data past retention (legal-hold aware) and
    anonymise archived contacts past retention. Also runs the infra-gated
    Glacier transition check."""
    from app.services.archive import archive_service

    async with LiveSessionLocal() as live_db, ArchiveSessionLocal() as archive_db:
        result = await archive_service.run_retention(live_db, archive_db, dry_run=False)
        await archive_service.glacier_transition(archive_db)
        await live_db.commit()
        await archive_db.commit()
    if result.get("campaigns_purged") or result.get("contacts_anonymised"):
        logger.info("worker: archive retention %s", result)
    return result


async def _startup(ctx: dict) -> None:
    logger.info("BulkReach dispatch worker online.")


async def _shutdown(ctx: dict) -> None:
    await close_http()


class WorkerSettings:
    functions = [dispatch_campaign_task]
    cron_jobs = [
        cron(promote_scheduled, second={0, 30}),
        # Reconcile stuck payments every minute (webhooks are best-effort).
        cron(reconcile_payments, second={15, 45}),
        # Archive ingestion + retention run nightly (EAT ≈ UTC+3).
        cron(archive_ingest, hour={settings.ARCHIVE_INGESTION_HOUR}, minute={0}),
        cron(archive_retention, hour={settings.ARCHIVE_RETENTION_HOUR}, minute={0}),
    ]
    redis_settings = redis_settings()
    on_startup = _startup
    on_shutdown = _shutdown
    max_jobs = 10
    job_timeout = 60 * 30  # a large campaign may take a while
