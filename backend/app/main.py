# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""BulkReach API — FastAPI application factory.

Routers are registered per milestone as the corresponding domain is implemented.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import RequestIdMiddleware, configure_logging
from app.core.middleware import SecurityHeadersMiddleware
from app.domain.exceptions import DomainError

# Structured logging with per-request correlation ids — install before anything
# below logs, so even import-time and startup lines are formatted.
configure_logging()

# --- Error tracking (Sentry) — no-op unless SENTRY_DSN is set ---
if settings.SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,  # never ship request bodies / PII
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup / shutdown hooks (Redis pool, etc.) go here as subsystems come online.
    yield


app = FastAPI(
    title=f"{settings.PROJECT_NAME} API",
    version="2.0.0",
    description="Bulk SMS & Email platform for Uganda / East Africa.",
    # Interactive docs + the OpenAPI schema hand out a full route/parameter map;
    # keep them off in production so they aren't a free recon surface.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

@app.exception_handler(DomainError)
async def _domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    """Translate domain (business-rule) errors to HTTP. Preserves the historic
    contract of the send gate: `{"detail": {"code": ..., ...}}` at 402."""
    return JSONResponse(
        status_code=exc.http_status,
        content={"detail": {"code": exc.code, **exc.detail}},
    )


app.add_middleware(SecurityHeadersMiddleware)
# Allow the apex frontend origin and its www variant (the edge routes both to the
# web app; a visitor on www.* must not have their XHR rejected by CORS).
_cors_origins = [settings.FRONTEND_URL]
if "://" in settings.FRONTEND_URL:
    _scheme, _host = settings.FRONTEND_URL.split("://", 1)
    _www = f"{_scheme}://www.{_host}" if not _host.startswith("www.") else f"{_scheme}://{_host[4:]}"
    _cors_origins.append(_www)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Added last → outermost: the correlation id is bound before any other
# middleware or route logs, and the response carries it back for tracing.
app.add_middleware(RequestIdMiddleware)


@app.get("/health", tags=["system"])
async def health() -> JSONResponse:
    """Liveness — the process is up. Cheap; never touches dependencies."""
    return JSONResponse({"status": "ok", "service": "bulkreach-api", "version": "2.0.0"})


@app.get("/health/ready", tags=["system"])
async def health_ready() -> JSONResponse:
    """Readiness — can we actually serve traffic? Pings the core datastores
    (Postgres + Redis). Returns 503 if either is unreachable so orchestrators
    and the deploy smoke-test can gate on real capability, not just liveness.
    ClickHouse/MinIO are intentionally excluded — they are feature-gated and the
    app degrades gracefully without them."""
    from sqlalchemy import text  # local import keeps module import light

    from app.core.database import LiveSessionLocal
    from app.core.redis import redis

    checks: dict[str, str] = {}

    try:
        async with LiveSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as exc:  # noqa: BLE001 — report, don't leak the traceback
        checks["postgres"] = f"error: {type(exc).__name__}"

    try:
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = f"error: {type(exc).__name__}"

    ready = all(v == "ok" for v in checks.values())
    return JSONResponse(
        {"status": "ready" if ready else "not_ready", "checks": checks},
        status_code=200 if ready else 503,
    )


# --- Routers (registered per milestone) ---
from app.api.v1.admin import router as admin_router  # noqa: E402
from app.api.v1.auth import router as auth_router  # noqa: E402
from app.api.v1.sessions import router as sessions_router  # noqa: E402
from app.api.v1.billing import router as billing_router  # noqa: E402
from app.api.v1.campaigns import router as campaigns_router  # noqa: E402
from app.api.v1.contacts import router as contacts_router  # noqa: E402
from app.api.v1.deliveries import router as deliveries_router  # noqa: E402
from app.api.v1.deliveries import inbound_router as inbound_sms_router  # noqa: E402
from app.api.v1.content import router as content_router  # noqa: E402
from app.api.v1.invitations import router as invitations_router  # noqa: E402
from app.api.v1.managed_portal import router as managed_portal_router  # noqa: E402
from app.api.v1.notifications import router as notifications_router  # noqa: E402
from app.api.v1.payments import router as payments_router  # noqa: E402
from app.api.v1.reports import router as reports_router  # noqa: E402
from app.api.v1.suppressions import router as suppressions_router  # noqa: E402
from app.api.v1.templates import router as templates_router  # noqa: E402
from app.api.v1.redirect import router as redirect_router  # noqa: E402
from app.api.v1.subscription import router as subscription_router  # noqa: E402

app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(sessions_router, prefix=settings.API_V1_PREFIX)
app.include_router(contacts_router, prefix=settings.API_V1_PREFIX)
app.include_router(content_router, prefix=settings.API_V1_PREFIX)
app.include_router(campaigns_router, prefix=settings.API_V1_PREFIX)
app.include_router(reports_router, prefix=settings.API_V1_PREFIX)
app.include_router(payments_router, prefix=settings.API_V1_PREFIX)
app.include_router(deliveries_router, prefix=settings.API_V1_PREFIX)
app.include_router(inbound_sms_router, prefix=settings.API_V1_PREFIX)
app.include_router(suppressions_router, prefix=settings.API_V1_PREFIX)
app.include_router(templates_router, prefix=settings.API_V1_PREFIX)
app.include_router(redirect_router)  # /r/{slug} — root-mounted, short tracking links
app.include_router(subscription_router, prefix=settings.API_V1_PREFIX)
app.include_router(billing_router, prefix=settings.API_V1_PREFIX)
app.include_router(invitations_router, prefix=settings.API_V1_PREFIX)
app.include_router(managed_portal_router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications_router, prefix=settings.API_V1_PREFIX)
app.include_router(admin_router, prefix=settings.API_V1_PREFIX)
