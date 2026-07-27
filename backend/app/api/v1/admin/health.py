"""Admin system health (superadmin): live liveness checks over the real
infrastructure — Postgres, Redis, and configured providers. No seed data."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clickhouse
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.core.redis import redis
from app.models.payment_provider import PaymentProviderConfig
from app.schemas.admin import HealthResponse, HealthService
from app.services.storage import get_storage

router = APIRouter(prefix="/admin/health", tags=["admin:health"])

_RANK = {"operational": 0, "degraded": 1, "down": 2}


@router.get("", response_model=HealthResponse)
async def health(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HealthResponse:
    services: list[HealthService] = []

    # ── Postgres (live DB) ──
    try:
        t0 = time.perf_counter()
        await db.execute(text("SELECT 1"))
        latency = int((time.perf_counter() - t0) * 1000)
        try:
            conns = int((await db.execute(
                text("SELECT count(*) FROM pg_stat_activity")
            )).scalar_one() or 0)
            detail = f"Primary · {conns} connections"
        except Exception:  # noqa: BLE001
            detail = "Primary"
        services.append(HealthService(
            name="PostgreSQL (live)", category="Datastore",
            status="degraded" if latency > 200 else "operational",
            latency_ms=latency, detail=detail,
        ))
    except Exception as exc:  # noqa: BLE001
        services.append(HealthService(
            name="PostgreSQL (live)", category="Datastore", status="down",
            latency_ms=None, detail=f"Unreachable: {type(exc).__name__}",
        ))

    # ── Redis / ARQ queue ──
    try:
        t0 = time.perf_counter()
        await redis.ping()
        latency = int((time.perf_counter() - t0) * 1000)
        services.append(HealthService(
            name="Redis / ARQ queue", category="Queue",
            status="degraded" if latency > 100 else "operational",
            latency_ms=latency, detail="Reachable · dispatch + rate-limit store",
        ))
    except Exception as exc:  # noqa: BLE001
        services.append(HealthService(
            name="Redis / ARQ queue", category="Queue", status="down",
            latency_ms=None, detail=f"Unreachable: {type(exc).__name__}",
        ))

    # ── ClickHouse (analytics store) ──
    t0 = time.perf_counter()
    if await clickhouse.ping():
        latency = int((time.perf_counter() - t0) * 1000)
        events = await clickhouse.count_events()
        services.append(HealthService(
            name="ClickHouse (analytics)", category="Datastore", status="operational",
            latency_ms=latency,
            detail=f"{events:,} delivery events · {settings.ARCHIVE_CLICKHOUSE_TTL_YEARS}yr TTL"
            if events is not None else "reachable",
        ))
    else:
        services.append(HealthService(
            name="ClickHouse (analytics)", category="Datastore", status="degraded",
            latency_ms=None, detail="Unreachable — analytics ingestion is infra-gated",
        ))

    # ── Object storage (S3 / MinIO) ──
    try:
        using_s3 = get_storage()._s3 is not None
    except Exception:  # noqa: BLE001
        using_s3 = False
    services.append(HealthService(
        name="Object storage (S3/MinIO)", category="Storage",
        status="operational" if using_s3 else "degraded", latency_ms=None,
        detail="MinIO/S3 backend" if using_s3 else "Local-filesystem fallback (no S3)",
    ))

    # ── Payment providers (configured & enabled) ──
    try:
        rows = (await db.execute(
            select(PaymentProviderConfig.slug, PaymentProviderConfig.enabled,
                   PaymentProviderConfig.mode)
        )).all()
        enabled = [slug for slug, en, _ in rows if en]
        if enabled:
            live = [slug for slug, en, mode in rows if en and mode == "live"]
            detail = f"{len(enabled)} enabled: {', '.join(enabled)}" + (
                f" · {len(live)} live" if live else " · all test mode"
            )
            pstatus = "operational"
        else:
            detail = "No provider enabled — checkout uses dev simulator"
            pstatus = "degraded"
        services.append(HealthService(
            name="Payment providers", category="Provider", status=pstatus,
            latency_ms=None, detail=detail,
        ))
    except Exception as exc:  # noqa: BLE001
        services.append(HealthService(
            name="Payment providers", category="Provider", status="down",
            latency_ms=None, detail=f"Config unreadable: {type(exc).__name__}",
        ))

    # ── SMS / Email dispatch (from settings; simulator fallback in dev) ──
    sms_provider = getattr(settings, "SMS_PROVIDER", None) or "simulator"
    email_provider = getattr(settings, "EMAIL_PROVIDER", None) or "simulator"
    services.append(HealthService(
        name="SMS dispatch", category="Provider",
        status="operational" if sms_provider != "simulator" else "degraded",
        latency_ms=None,
        detail=f"{sms_provider}" + (" · dev simulator" if sms_provider == "simulator" else ""),
    ))
    services.append(HealthService(
        name="Email dispatch", category="Provider",
        status="operational" if email_provider != "simulator" else "degraded",
        latency_ms=None,
        detail=f"{email_provider}" + (" · dev simulator" if email_provider == "simulator" else ""),
    ))

    overall = "operational"
    worst = max((_RANK.get(s.status, 0) for s in services), default=0)
    overall = {0: "operational", 1: "degraded", 2: "down"}[worst]

    return HealthResponse(
        overall=overall, services=services, checked_at=datetime.now(timezone.utc),
    )
