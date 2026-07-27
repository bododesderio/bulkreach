"""Admin (superadmin) API surface. Subrouters register here per subsystem.

The superadmin guard is applied structurally at this router so a future handler
added without the per-route `SuperadminUser` dependency still can't be reached
unauthenticated (defense-in-depth against drift)."""
from fastapi import APIRouter, Depends

from app.core.dependencies import require_superadmin

from app.api.v1.admin.accounts import router as accounts_router
from app.api.v1.admin.archive import router as archive_router
from app.api.v1.admin.audit import router as audit_router
from app.api.v1.admin.billing import router as billing_router
from app.api.v1.admin.campaigns import router as campaigns_router
from app.api.v1.admin.health import router as health_router
from app.api.v1.admin.managed import router as managed_router
from app.api.v1.admin.overview import router as overview_router
from app.api.v1.admin.payments import router as payments_router
from app.api.v1.admin.plans import router as plans_router
from app.api.v1.admin.revenue import router as revenue_router

router = APIRouter(dependencies=[Depends(require_superadmin)])
router.include_router(payments_router)
router.include_router(billing_router)
router.include_router(plans_router)
router.include_router(overview_router)
router.include_router(accounts_router)
router.include_router(campaigns_router)
router.include_router(audit_router)
router.include_router(managed_router)
router.include_router(health_router)
router.include_router(revenue_router)
router.include_router(archive_router)

__all__ = ["router"]
