"""BulkReach API — FastAPI application factory.

Routers are registered per milestone as the corresponding domain is implemented.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.middleware import SecurityHeadersMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup / shutdown hooks (Redis pool, etc.) go here as subsystems come online.
    yield


app = FastAPI(
    title=f"{settings.PROJECT_NAME} API",
    version="2.0.0",
    description="Bulk SMS & Email platform for Uganda / East Africa.",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "bulkreach-api", "version": "2.0.0"})


# --- Routers (registered per milestone) ---
from app.api.v1.admin import router as admin_router  # noqa: E402
from app.api.v1.auth import router as auth_router  # noqa: E402
from app.api.v1.billing import router as billing_router  # noqa: E402
from app.api.v1.campaigns import router as campaigns_router  # noqa: E402
from app.api.v1.contacts import router as contacts_router  # noqa: E402
from app.api.v1.invitations import router as invitations_router  # noqa: E402
from app.api.v1.managed_portal import router as managed_portal_router  # noqa: E402
from app.api.v1.payments import router as payments_router  # noqa: E402
from app.api.v1.reports import router as reports_router  # noqa: E402
from app.api.v1.subscription import router as subscription_router  # noqa: E402

app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(contacts_router, prefix=settings.API_V1_PREFIX)
app.include_router(campaigns_router, prefix=settings.API_V1_PREFIX)
app.include_router(reports_router, prefix=settings.API_V1_PREFIX)
app.include_router(payments_router, prefix=settings.API_V1_PREFIX)
app.include_router(subscription_router, prefix=settings.API_V1_PREFIX)
app.include_router(billing_router, prefix=settings.API_V1_PREFIX)
app.include_router(invitations_router, prefix=settings.API_V1_PREFIX)
app.include_router(managed_portal_router, prefix=settings.API_V1_PREFIX)
app.include_router(admin_router, prefix=settings.API_V1_PREFIX)
