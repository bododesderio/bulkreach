# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Admin audit-log viewer (superadmin, read-only over the append-only table)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.account import AuditLog
from app.schemas.admin import AuditEntryOut, AuditResponse

router = APIRouter(prefix="/admin/audit-log", tags=["admin:audit"])

# Derive a display severity from the action verb.
_CRITICAL = ("delete", "suspend", "refund", "retry.exhausted", "exhausted")
_WARN = ("update", "activate", "hidden", "cancel", "impersonate", "refund")


def _severity(action: str) -> str:
    a = action.lower()
    if any(k in a for k in _CRITICAL):
        return "critical" if "delete" in a or "exhausted" in a else "warn"
    if any(k in a for k in _WARN):
        return "warn"
    return "info"


@router.get("", response_model=AuditResponse)
async def list_audit(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    resource_type: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> AuditResponse:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    count_stmt = select(func.count()).select_from(AuditLog)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
        count_stmt = count_stmt.where(AuditLog.resource_type == resource_type)

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (await db.execute(stmt.limit(min(limit, 500)).offset(offset))).scalars().all()

    items = [
        AuditEntryOut(
            id=a.id, actor_email=a.actor_email, action=a.action,
            resource_type=a.resource_type, resource_id=a.resource_id,
            ip_address=str(a.ip_address) if a.ip_address else None,
            severity=_severity(a.action), created_at=a.created_at,
        )
        for a in rows
    ]
    return AuditResponse(items=items, total=total)
