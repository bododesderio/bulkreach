# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Append-only audit logging (Section 4.1 audit_logs — no UPDATE/DELETE ever)."""
from __future__ import annotations

from contextvars import ContextVar
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import AuditLog

# Set per-request by the auth dependency when the principal is a superadmin acting
# under an impersonation token. record_audit stamps it into every entry so a write
# made while impersonating is attributed to BOTH the owner (actor) and the real
# admin — the impersonation start/stop audit alone doesn't cover per-action writes.
_impersonator: ContextVar[str | None] = ContextVar("audit_impersonator", default=None)


def set_impersonator(email: str | None) -> None:
    _impersonator.set(email)


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
    details = dict(details or {})
    imp = _impersonator.get()
    if imp and "impersonated_by" not in details:
        details["impersonated_by"] = imp
    db.add(
        AuditLog(
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
        )
    )
    await db.flush()
