"""Append-only audit logging (Section 4.1 audit_logs — no UPDATE/DELETE ever)."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import AuditLog


async def record_audit(
    db: AsyncSession,
    *,
    actor_id: UUID | None,
    actor_email: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip_address=ip_address,
        )
    )
    await db.flush()
