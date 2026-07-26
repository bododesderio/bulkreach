"""Admin (superadmin) API surface. Subrouters register here per subsystem."""
from fastapi import APIRouter

from app.api.v1.admin.payments import router as payments_router

router = APIRouter()
router.include_router(payments_router)

__all__ = ["router"]
