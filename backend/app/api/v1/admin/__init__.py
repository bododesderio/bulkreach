"""Admin (superadmin) API surface. Subrouters register here per subsystem."""
from fastapi import APIRouter

from app.api.v1.admin.billing import router as billing_router
from app.api.v1.admin.payments import router as payments_router

router = APIRouter()
router.include_router(payments_router)
router.include_router(billing_router)

__all__ = ["router"]
