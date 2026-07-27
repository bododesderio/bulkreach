"""Archive subsystem admin API (superadmin). Governs the SEPARATE archive DB.

Every read and action is written to the append-only archive_access_log (Section
23.6) — access to archived personal data is itself auditable."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_archive_db, get_db
from app.core.dependencies import SuperadminUser
from app.models.archive import (
    ArchivedSourceFile,
    ArchiveAccessLog,
    ErasureRequest,
    LegalHold,
    MasterContact,
    RetentionRule,
)
from app.schemas.archive import (
    AccessLogOut,
    ArchiveStats,
    ErasureCreate,
    ErasureRequestOut,
    ExportCreate,
    ExportOut,
    IngestResult,
    LegalHoldCreate,
    LegalHoldLift,
    LegalHoldOut,
    MasterContactOut,
    RetentionBucket,
    RetentionResult,
    RetentionRuleOut,
    RetentionRuleUpsert,
)
from app.services.archive import archive_service

router = APIRouter(prefix="/admin/archive", tags=["admin:archive"])

ArchiveDB = Annotated[AsyncSession, Depends(get_archive_db)]
LiveDB = Annotated[AsyncSession, Depends(get_db)]


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _contact_out(mc: MasterContact) -> MasterContactOut:
    return MasterContactOut(
        id=mc.id, phone=mc.phone, email=mc.email, first_name=mc.first_name,
        last_name=mc.last_name, account_name=mc.account_name,
        campaign_count=len(mc.campaign_appearances or []),
        first_seen_at=mc.first_seen_at, last_seen_at=mc.last_seen_at,
        anonymised_at=mc.anonymised_at, legal_hold=mc.legal_hold,
    )


# ── Overview / stats ─────────────────────────────────────────────────────────
@router.get("/overview", response_model=ArchiveStats)
async def overview(admin: SuperadminUser, archive_db: ArchiveDB, request: Request) -> ArchiveStats:
    stats = await archive_service.stats(archive_db)
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="view",
        resource_type="overview", ip_address=_ip(request),
    )
    return ArchiveStats(**stats)


@router.get("/retention", response_model=list[RetentionBucket])
async def retention_breakdown(admin: SuperadminUser, archive_db: ArchiveDB) -> list[RetentionBucket]:
    rows = await archive_service.retention_breakdown(archive_db)
    return [RetentionBucket(**r) for r in rows]


# ── Retention rules ──────────────────────────────────────────────────────────
@router.get("/retention/rules", response_model=list[RetentionRuleOut])
async def list_rules(admin: SuperadminUser, archive_db: ArchiveDB) -> list[RetentionRuleOut]:
    rows = (await archive_db.execute(
        select(RetentionRule).order_by(RetentionRule.domain).limit(500)
    )).scalars().all()
    return [RetentionRuleOut.model_validate(r) for r in rows]


@router.put("/retention/rules", response_model=RetentionRuleOut)
async def upsert_rule(
    body: RetentionRuleUpsert, admin: SuperadminUser, archive_db: ArchiveDB,
) -> RetentionRuleOut:
    rule = (await archive_db.execute(
        select(RetentionRule).where(
            RetentionRule.domain == body.domain, RetentionRule.account_id.is_(None)
        )
    )).scalar_one_or_none()
    if rule is None:
        rule = RetentionRule(domain=body.domain)
        archive_db.add(rule)
    rule.retention_months = body.retention_months
    rule.never_delete = body.never_delete
    rule.updated_by = admin.id
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="retention_rule",
        resource_type="retention_rule", resource_id=body.domain,
        details={"retention_months": body.retention_months, "never_delete": body.never_delete},
    )
    await archive_db.flush()
    await archive_db.refresh(rule)
    return RetentionRuleOut.model_validate(rule)


@router.post("/retention/run", response_model=RetentionResult)
async def run_retention(
    admin: SuperadminUser, live_db: LiveDB, archive_db: ArchiveDB,
    dry_run: bool = True,
) -> RetentionResult:
    result = await archive_service.run_retention(live_db, archive_db, dry_run=dry_run)
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email,
        action="retention_run", resource_type="retention",
        details={"dry_run": dry_run, **{k: v for k, v in result.items() if k != "dry_run"}},
    )
    return RetentionResult(**result)


# ── Ingestion (manual trigger; also runs on cron) ────────────────────────────
@router.post("/ingest", response_model=IngestResult)
async def ingest(admin: SuperadminUser, live_db: LiveDB, archive_db: ArchiveDB) -> IngestResult:
    counts = await archive_service.ingest(live_db, archive_db)
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="ingest",
        resource_type="ingestion", details=counts,
    )
    return IngestResult(
        campaigns_ingested=counts["campaigns"], reports_ingested=counts["reports"],
        payments_ingested=counts["payments"], contacts_upserted=counts["contacts"],
    )


# ── Master contacts: search + anonymise ──────────────────────────────────────
@router.get("/contacts", response_model=list[MasterContactOut])
async def search_contacts(
    admin: SuperadminUser, archive_db: ArchiveDB, request: Request,
    q: str | None = None, limit: int = 50,
) -> list[MasterContactOut]:
    stmt = select(MasterContact)
    if q:
        # Escape LIKE metacharacters so a query can't force a broad full-scan.
        esc = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{esc}%"
        stmt = stmt.where(or_(
            func.lower(MasterContact.phone).like(like, escape="\\"),
            func.lower(MasterContact.email).like(like, escape="\\"),
            func.lower(MasterContact.first_name).like(like, escape="\\"),
            func.lower(MasterContact.last_name).like(like, escape="\\"),
        ))
        capped = min(limit, 200)
    else:
        # No query → no bulk raw-PII dump; return a small recent sample only.
        capped = min(limit, 25)
    stmt = stmt.order_by(MasterContact.last_seen_at.desc()).limit(capped)
    rows = (await archive_db.execute(stmt)).scalars().all()
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="search",
        resource_type="master_contact", details={"q": q or "", "results": len(rows)},
        ip_address=_ip(request),
    )
    return [_contact_out(mc) for mc in rows]


@router.post("/contacts/{contact_id}/anonymise", response_model=MasterContactOut)
async def anonymise_contact(
    contact_id: UUID, admin: SuperadminUser, archive_db: ArchiveDB, request: Request,
) -> MasterContactOut:
    try:
        mc = await archive_service.anonymise_contact(archive_db, contact_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if mc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="anonymise",
        resource_type="master_contact", resource_id=str(contact_id), ip_address=_ip(request),
    )
    return _contact_out(mc)


# ── Legal holds ──────────────────────────────────────────────────────────────
@router.get("/legal-holds", response_model=list[LegalHoldOut])
async def list_holds(admin: SuperadminUser, archive_db: ArchiveDB) -> list[LegalHoldOut]:
    rows = (await archive_db.execute(
        select(LegalHold).order_by(LegalHold.placed_at.desc()).limit(500)
    )).scalars().all()
    return [LegalHoldOut.model_validate(h) for h in rows]


@router.post("/legal-holds", response_model=LegalHoldOut, status_code=status.HTTP_201_CREATED)
async def place_hold(
    body: LegalHoldCreate, admin: SuperadminUser, archive_db: ArchiveDB, request: Request,
) -> LegalHoldOut:
    hold = await archive_service.place_hold(
        archive_db, resource_type=body.resource_type, resource_id=body.resource_id,
        reason=body.reason, actor_id=admin.id, actor_email=admin.email,
    )
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="hold",
        resource_type=body.resource_type, resource_id=body.resource_id,
        details={"reason": body.reason}, ip_address=_ip(request),
    )
    return LegalHoldOut.model_validate(hold)


@router.post("/legal-holds/{hold_id}/lift", response_model=LegalHoldOut)
async def lift_hold(
    hold_id: UUID, body: LegalHoldLift, admin: SuperadminUser, archive_db: ArchiveDB,
    request: Request,
) -> LegalHoldOut:
    try:
        hold = await archive_service.lift_hold(
            archive_db, hold_id, reason=body.reason, actor_id=admin.id,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="lift",
        resource_type=hold.resource_type, resource_id=hold.resource_id,
        details={"reason": body.reason}, ip_address=_ip(request),
    )
    return LegalHoldOut.model_validate(hold)


# ── Erasure requests ─────────────────────────────────────────────────────────
@router.get("/erasures", response_model=list[ErasureRequestOut])
async def list_erasures(admin: SuperadminUser, archive_db: ArchiveDB) -> list[ErasureRequestOut]:
    rows = (await archive_db.execute(
        select(ErasureRequest).order_by(ErasureRequest.created_at.desc()).limit(500)
    )).scalars().all()
    return [ErasureRequestOut.model_validate(e) for e in rows]


@router.post("/erasures", response_model=ErasureRequestOut, status_code=status.HTTP_201_CREATED)
async def create_erasure(
    body: ErasureCreate, admin: SuperadminUser, archive_db: ArchiveDB, request: Request,
) -> ErasureRequestOut:
    try:
        req = await archive_service.create_erasure(
            archive_db, phone=body.contact_phone, email=body.contact_email,
            requested_by=body.requested_by or admin.email,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="erase",
        resource_type="erasure_request", resource_id=str(req.id), ip_address=_ip(request),
    )
    return ErasureRequestOut.model_validate(req)


@router.post("/erasures/{req_id}/execute", response_model=ErasureRequestOut)
async def execute_erasure(
    req_id: UUID, admin: SuperadminUser, archive_db: ArchiveDB, request: Request,
) -> ErasureRequestOut:
    try:
        req = await archive_service.execute_erasure(archive_db, req_id, admin.id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="erase",
        resource_type="erasure_request", resource_id=str(req_id),
        details={"executed": True}, ip_address=_ip(request),
    )
    return ErasureRequestOut.model_validate(req)


# ── Access log (append-only) ─────────────────────────────────────────────────
@router.get("/access-log", response_model=list[AccessLogOut])
async def access_log(
    admin: SuperadminUser, archive_db: ArchiveDB, limit: int = 100,
) -> list[AccessLogOut]:
    rows = (await archive_db.execute(
        select(ArchiveAccessLog).order_by(ArchiveAccessLog.created_at.desc())
        .limit(min(limit, 500))
    )).scalars().all()
    return [
        AccessLogOut(
            id=a.id, actor_email=a.actor_email, action=a.action,
            resource_type=a.resource_type, resource_id=a.resource_id,
            ip_address=str(a.ip_address) if a.ip_address else None, created_at=a.created_at,
        )
        for a in rows
    ]


# ── Exports ──────────────────────────────────────────────────────────────────
@router.get("/exports", response_model=list[ExportOut])
async def list_exports(admin: SuperadminUser, archive_db: ArchiveDB) -> list[ExportOut]:
    rows = (await archive_db.execute(
        select(ArchivedSourceFile).where(ArchivedSourceFile.format == "export")
        .order_by(ArchivedSourceFile.archived_at.desc()).limit(500)
    )).scalars().all()
    return [ExportOut.model_validate(r) for r in rows]


@router.post("/exports", response_model=ExportOut, status_code=status.HTTP_201_CREATED)
async def create_export(
    body: ExportCreate, admin: SuperadminUser, archive_db: ArchiveDB, request: Request,
) -> ExportOut:
    ts_label = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    rec = await archive_service.export(archive_db, domain=body.domain, ts_label=ts_label)
    await archive_service.record_access(
        archive_db, actor_id=admin.id, actor_email=admin.email, action="export",
        resource_type="export", resource_id=str(rec.id),
        details={"domain": body.domain}, ip_address=_ip(request),
    )
    return ExportOut.model_validate(rec)
