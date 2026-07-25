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
from app.core.database import LiveSessionLocal
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


async def _startup(ctx: dict) -> None:
    logger.info("BulkReach dispatch worker online.")


async def _shutdown(ctx: dict) -> None:
    await close_http()


class WorkerSettings:
    functions = [dispatch_campaign_task]
    cron_jobs = [cron(promote_scheduled, second={0, 30})]
    redis_settings = redis_settings()
    on_startup = _startup
    on_shutdown = _shutdown
    max_jobs = 10
    job_timeout = 60 * 30  # a large campaign may take a while
