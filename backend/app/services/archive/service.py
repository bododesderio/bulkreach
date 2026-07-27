"""Archive subsystem service implementation. See package docstring."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Account
from app.models.archive import (
    ArchiveAccessLog,
    ArchivedCampaign,
    ArchivedPayment,
    ArchivedReport,
    ArchivedSourceFile,
    ErasureRequest,
    LegalHold,
    MasterContact,
    RetentionRule,
)
from app.core import clickhouse
from app.models.billing import Payment
from app.models.campaign import Campaign, CampaignContact, Message, Report
from app.services.storage import get_storage

log = logging.getLogger("bulkreach.archive")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _anon_hash(value: str) -> str:
    """Keyed HMAC-SHA256 for anonymising identifiers. The pepper is held only in
    app config (never in the archive DB), so an attacker with archive rows cannot
    brute-force the small MSISDN space offline. Deterministic → still dedups."""
    pepper = (settings.ANON_PEPPER or settings.SECRET_KEY).encode("utf-8")
    return hmac.new(pepper, value.encode("utf-8"), hashlib.sha256).hexdigest()


class ArchiveService:
    # ── Access log (append-only) ─────────────────────────────────────────────
    async def record_access(
        self,
        archive_db: AsyncSession,
        *,
        actor_id: UUID | None,
        actor_email: str | None,
        action: str,
        resource_type: str | None = None,
        resource_id: str | None = None,
        details: dict | None = None,
        ip_address: str | None = None,
    ) -> None:
        archive_db.add(ArchiveAccessLog(
            actor_id=actor_id, actor_email=actor_email, action=action,
            resource_type=resource_type, resource_id=resource_id,
            details=details or {}, ip_address=ip_address,
        ))
        await archive_db.flush()

    # ── Ingestion: live → archive (idempotent by live PK) ────────────────────
    async def ingest(self, live_db: AsyncSession, archive_db: AsyncSession) -> dict:
        counts = {"campaigns": 0, "reports": 0, "payments": 0, "contacts": 0, "events": 0}
        analytics_rows: list[list] = []

        campaigns = (await live_db.execute(
            select(Campaign).where(
                Campaign.status == "completed", Campaign.archived.is_(False)
            ).limit(settings.ARCHIVE_BATCH_SIZE)
        )).scalars().all()

        for c in campaigns:
            account = await live_db.get(Account, c.account_id)
            aname = account.name if account else None
            recipients = (await live_db.execute(
                select(func.count()).select_from(CampaignContact)
                .where(CampaignContact.campaign_id == c.id)
            )).scalar_one() or 0

            if await archive_db.get(ArchivedCampaign, c.id) is None:
                archive_db.add(ArchivedCampaign(
                    id=c.id, account_id=c.account_id, account_name=aname or "",
                    name=c.name, type=c.type, status=c.status, sms_body=c.sms_body,
                    email_subject=c.email_subject, email_html_body=c.email_html_body,
                    email_plain_body=c.email_plain_body, from_name=c.from_name,
                    from_email=c.from_email, sms_sender_id=c.sms_sender_id,
                    messages_sent=c.messages_sent, sms_sent=c.sms_sent, sms_failed=c.sms_failed,
                    email_sent=c.email_sent, email_failed=c.email_failed,
                    contact_count=recipients, created_at=c.created_at, completed_at=c.completed_at,
                ))
                counts["campaigns"] += 1

            # Reports for this campaign
            reports = (await live_db.execute(
                select(Report).where(Report.campaign_id == c.id)
            )).scalars().all()
            for r in reports:
                if await archive_db.get(ArchivedReport, r.id) is None:
                    archive_db.add(ArchivedReport(
                        id=r.id, campaign_id=r.campaign_id, account_id=c.account_id,
                        type=r.type, file_url=r.file_url, emailed_to=r.emailed_to,
                        emailed_at=r.emailed_at, generated_at=r.created_at,
                    ))
                    counts["reports"] += 1

            # Master-contact dedup from this campaign's recipients
            contacts = (await live_db.execute(
                select(CampaignContact).where(CampaignContact.campaign_id == c.id)
            )).scalars().all()
            for cc in contacts:
                if not cc.phone and not cc.email:
                    continue
                if await self._upsert_master_contact(archive_db, cc, c, aname):
                    counts["contacts"] += 1

            # Collect per-recipient delivery events for the ClickHouse analytics
            # store (7-year TTL). Best-effort; skipped if CH is unreachable.
            messages = (await live_db.execute(
                select(Message).where(Message.campaign_id == c.id)
            )).scalars().all()
            for m in messages:
                when = m.sent_at or m.created_at
                analytics_rows.append([
                    when.date(), when.replace(tzinfo=None), c.account_id, c.id,
                    m.channel, m.status, m.provider or "", int(m.attempts or 0), m.recipient,
                ])

            c.archived = True  # committed on the live session

        counts["events"] = await clickhouse.insert_delivery_events(analytics_rows)

        # Successful payments not yet archived
        payments = (await live_db.execute(
            select(Payment).where(Payment.status == "successful")
            .limit(settings.ARCHIVE_BATCH_SIZE)
        )).scalars().all()
        for p in payments:
            if await archive_db.get(ArchivedPayment, p.id) is None:
                account = await live_db.get(Account, p.account_id)
                archive_db.add(ArchivedPayment(
                    id=p.id, account_id=p.account_id,
                    account_name=account.name if account else None,
                    amount_ugx=p.amount_ugx, currency=p.currency, method=p.method,
                    status=p.status, flutterwave_tx_id=p.flutterwave_tx_id,
                    created_at=p.created_at,
                ))
                counts["payments"] += 1

        await live_db.flush()
        await archive_db.flush()
        return counts

    async def _upsert_master_contact(
        self, archive_db: AsyncSession, cc: CampaignContact, campaign: Campaign,
        account_name: str | None,
    ) -> bool:
        """Returns True if a new master contact was created."""
        existing = None
        if cc.phone:
            existing = (await archive_db.execute(
                select(MasterContact).where(MasterContact.phone == cc.phone)
            )).scalar_one_or_none()
        if existing is None and cc.email:
            existing = (await archive_db.execute(
                select(MasterContact).where(MasterContact.email == cc.email)
            )).scalar_one_or_none()

        if existing is not None:
            appearances = list(existing.campaign_appearances or [])
            if campaign.id not in appearances:
                appearances.append(campaign.id)
                existing.campaign_appearances = appearances
            existing.last_seen_at = _now()
            return False

        name_parts = (cc.merge_data or {})
        archive_db.add(MasterContact(
            phone=cc.phone, email=cc.email,
            first_name=str(name_parts.get("first_name")) if name_parts.get("first_name") else None,
            last_name=str(name_parts.get("last_name")) if name_parts.get("last_name") else None,
            raw_data=name_parts if isinstance(name_parts, dict) else {},
            account_id=campaign.account_id, account_name=account_name,
            campaign_appearances=[campaign.id],
        ))
        return True

    # ── Retention / purge ────────────────────────────────────────────────────
    async def _domain_rule(self, archive_db: AsyncSession, domain: str) -> RetentionRule | None:
        """Global (account_id IS NULL) retention rule for a data domain, if any."""
        return (await archive_db.execute(
            select(RetentionRule).where(
                RetentionRule.domain == domain, RetentionRule.account_id.is_(None)
            )
        )).scalar_one_or_none()

    def _cutoff_for(self, rule: RetentionRule | None) -> datetime | None:
        """None => never delete (rule says so). Otherwise the age cutoff."""
        if rule is not None:
            if rule.never_delete or rule.retention_months is None:
                return None
            months = rule.retention_months
        else:
            months = settings.ARCHIVE_LIVE_RETENTION_MONTHS
        return _now() - timedelta(days=30 * months)

    async def run_retention(
        self, live_db: AsyncSession, archive_db: AsyncSession, *, dry_run: bool = True,
    ) -> dict:
        # Per-domain retention rules override the global policy; a never_delete /
        # null-months rule disables purge/anonymise for that domain entirely.
        camp_rule = await self._domain_rule(archive_db, "campaigns")
        contact_rule = await self._domain_rule(archive_db, "contacts")
        camp_cutoff = self._cutoff_for(camp_rule)
        contact_cutoff = self._cutoff_for(contact_rule)

        # Campaigns under an active legal hold must never be purged.
        held = (await archive_db.execute(
            select(LegalHold.resource_id).where(
                LegalHold.is_active.is_(True),
                LegalHold.resource_type.in_(("campaign", "archived_campaign")),
            )
        )).scalars().all()
        held_ids = {str(h) for h in held}

        purge_candidates: list[Campaign] = []
        if camp_cutoff is not None:
            purge_candidates = (await live_db.execute(
                select(Campaign).where(
                    Campaign.status == "completed",
                    Campaign.archived.is_(True),
                    Campaign.completed_at.is_not(None),
                    Campaign.completed_at < camp_cutoff,
                )
            )).scalars().all()
            purge_candidates = [c for c in purge_candidates if str(c.id) not in held_ids]

        anon_candidates: list[MasterContact] = []
        if contact_cutoff is not None:
            anon_candidates = (await archive_db.execute(
                select(MasterContact).where(
                    MasterContact.anonymised_at.is_(None),
                    MasterContact.legal_hold.is_(False),
                    MasterContact.never_delete.is_(False),
                    MasterContact.last_seen_at < contact_cutoff,
                )
            )).scalars().all()

        result = {
            "dry_run": dry_run,
            "campaigns_purgeable": len(purge_candidates),
            "contacts_anonymisable": len(anon_candidates),
            "campaigns_purged": 0,
            "contacts_anonymised": 0,
        }
        if dry_run:
            return result

        for c in purge_candidates:
            await live_db.delete(c)  # messages/recipients cascade
            result["campaigns_purged"] += 1
        for mc in anon_candidates:
            self._anonymise(mc)
            result["contacts_anonymised"] += 1

        await live_db.flush()
        await archive_db.flush()
        return result

    def _anonymise(self, mc: MasterContact) -> None:
        if mc.phone:
            mc.phone = _anon_hash(mc.phone)
        if mc.email:
            mc.email = _anon_hash(mc.email)
        mc.first_name = None
        mc.last_name = None
        mc.raw_data = {}
        mc.anonymised_at = _now()

    async def anonymise_contact(self, archive_db: AsyncSession, contact_id: UUID) -> MasterContact | None:
        mc = await archive_db.get(MasterContact, contact_id)
        if mc is None or mc.anonymised_at is not None:
            return mc
        if mc.legal_hold or mc.never_delete:
            raise ValueError("Contact is under legal hold and cannot be anonymised")
        self._anonymise(mc)
        await archive_db.flush()
        return mc

    # ── Erasure (DPA/GDPR right to erasure) ──────────────────────────────────
    async def create_erasure(
        self, archive_db: AsyncSession, *, phone: str | None, email: str | None,
        requested_by: str | None,
    ) -> ErasureRequest:
        if not phone and not email:
            raise ValueError("A phone or email is required")
        mc = None
        if phone:
            mc = (await archive_db.execute(
                select(MasterContact).where(MasterContact.phone == phone)
            )).scalar_one_or_none()
        if mc is None and email:
            mc = (await archive_db.execute(
                select(MasterContact).where(MasterContact.email == email)
            )).scalar_one_or_none()
        req = ErasureRequest(
            contact_phone=phone, contact_email=email,
            master_contact_id=mc.id if mc else None, requested_by=requested_by,
        )
        archive_db.add(req)
        await archive_db.flush()
        return req

    async def execute_erasure(
        self, archive_db: AsyncSession, req_id: UUID, actor_id: UUID | None,
    ) -> ErasureRequest:
        req = await archive_db.get(ErasureRequest, req_id)
        if req is None:
            raise ValueError("Erasure request not found")
        if req.status == "completed":
            return req

        # Re-resolve the target if it wasn't linked at creation time — a contact
        # matching the request may have been ingested since.
        mc = None
        if req.master_contact_id:
            mc = await archive_db.get(MasterContact, req.master_contact_id)
        if mc is None and req.contact_phone:
            mc = (await archive_db.execute(
                select(MasterContact).where(MasterContact.phone == req.contact_phone)
            )).scalar_one_or_none()
        if mc is None and req.contact_email:
            mc = (await archive_db.execute(
                select(MasterContact).where(MasterContact.email == req.contact_email)
            )).scalar_one_or_none()

        if mc is not None and mc.anonymised_at is None:
            if mc.legal_hold or mc.never_delete:
                raise ValueError("Target contact is under legal hold")
            self._anonymise(mc)
            req.master_contact_id = mc.id

        # The erasure record itself must not retain the subject's plaintext PII —
        # keep only a keyed hash for dedup/audit.
        if req.contact_phone:
            req.contact_phone = _anon_hash(req.contact_phone)[:32]
        if req.contact_email:
            req.contact_email = _anon_hash(req.contact_email)[:32]
        req.status = "completed"
        req.executed_by = actor_id
        req.executed_at = _now()
        await archive_db.flush()
        return req

    # ── Legal holds ──────────────────────────────────────────────────────────
    async def place_hold(
        self, archive_db: AsyncSession, *, resource_type: str, resource_id: str,
        reason: str, actor_id: UUID | None, actor_email: str | None,
    ) -> LegalHold:
        hold = LegalHold(
            resource_type=resource_type, resource_id=resource_id, reason=reason,
            placed_by=actor_id, placed_by_email=actor_email,
        )
        archive_db.add(hold)
        await self._set_hold_flag(archive_db, resource_type, resource_id, True)
        await archive_db.flush()
        return hold

    async def lift_hold(
        self, archive_db: AsyncSession, hold_id: UUID, *, reason: str,
        actor_id: UUID | None,
    ) -> LegalHold:
        hold = await archive_db.get(LegalHold, hold_id)
        if hold is None:
            raise ValueError("Legal hold not found")
        if not hold.is_active:
            return hold
        hold.is_active = False
        hold.lifted_by = actor_id
        hold.lifted_reason = reason
        hold.lifted_at = _now()
        # Only clear the flag if no other active hold covers the same resource.
        others = (await archive_db.execute(
            select(func.count()).select_from(LegalHold).where(
                LegalHold.is_active.is_(True), LegalHold.id != hold_id,
                LegalHold.resource_type == hold.resource_type,
                LegalHold.resource_id == hold.resource_id,
            )
        )).scalar_one()
        if not others:
            await self._set_hold_flag(archive_db, hold.resource_type, hold.resource_id, False)
        await archive_db.flush()
        return hold

    async def _set_hold_flag(
        self, archive_db: AsyncSession, resource_type: str, resource_id: str, value: bool,
    ) -> None:
        try:
            rid = UUID(resource_id)
        except (ValueError, TypeError):
            return
        if resource_type in ("campaign", "archived_campaign"):
            obj = await archive_db.get(ArchivedCampaign, rid)
        elif resource_type in ("contact", "master_contact"):
            obj = await archive_db.get(MasterContact, rid)
        else:
            obj = None
        if obj is not None:
            obj.legal_hold = value

    # ── Export (real via storage service; local-fs fallback in dev) ──────────
    async def export(
        self, archive_db: AsyncSession, *, domain: str, ts_label: str,
    ) -> ArchivedSourceFile:
        if domain == "campaigns":
            rows = (await archive_db.execute(select(ArchivedCampaign))).scalars().all()
            payload = [{"id": str(r.id), "account": r.account_name, "name": r.name,
                        "type": r.type, "messages_sent": r.messages_sent,
                        "archived_at": r.archived_at.isoformat()} for r in rows]
        elif domain == "payments":
            rows = (await archive_db.execute(select(ArchivedPayment))).scalars().all()
            payload = [{"id": str(r.id), "account": r.account_name,
                        "amount_ugx": r.amount_ugx, "method": r.method,
                        "status": r.status} for r in rows]
        else:  # contacts — anonymised projection only (never export raw PII in bulk)
            rows = (await archive_db.execute(select(MasterContact))).scalars().all()
            payload = [{"id": str(r.id), "anonymised": r.anonymised_at is not None,
                        "account": r.account_name,
                        "campaigns": len(r.campaign_appearances or [])} for r in rows]

        data = json.dumps(payload, indent=2).encode("utf-8")
        key = f"exports/{domain}-{ts_label}.json"
        storage = get_storage()
        try:
            s3_uri = storage.put(key, data, content_type="application/json")
        except Exception as exc:  # noqa: BLE001
            log.warning("archive export storage failed: %s", exc)
            s3_uri = None

        rec = ArchivedSourceFile(
            filename=f"{domain}-{ts_label}.json", format="export",
            size_bytes=len(data), s3_key=s3_uri or key, storage_class="standard",
            checksum_sha256=_sha256(data.decode("utf-8")),
        )
        archive_db.add(rec)
        await archive_db.flush()
        return rec

    async def glacier_transition(self, archive_db: AsyncSession) -> dict:
        """Transition aged standard-class exports to the Glacier storage tier.

        We flip the `storage_class` metadata on eligible rows (the archive's
        source of truth for lifecycle state). True AWS Glacier object-tiering
        additionally requires an S3 lifecycle policy on a real AWS bucket —
        MinIO/dev has no Glacier tier, so the physical object stays put while the
        catalog correctly reflects the lifecycle decision."""
        cutoff = _now() - timedelta(days=settings.ARCHIVE_GLACIER_TRANSITION_DAYS)
        eligible = (await archive_db.execute(
            select(ArchivedSourceFile).where(
                ArchivedSourceFile.storage_class == "standard",
                ArchivedSourceFile.archived_at < cutoff,
            )
        )).scalars().all()
        for f in eligible:
            f.storage_class = "glacier"
        await archive_db.flush()
        log.info("glacier_transition: %d file(s) → glacier tier", len(eligible))
        return {"eligible": len(eligible), "transitioned": len(eligible)}

    # ── Stats + breakdowns ───────────────────────────────────────────────────
    async def stats(self, archive_db: AsyncSession) -> dict:
        async def _count(model, *where) -> int:
            stmt = select(func.count()).select_from(model)
            for w in where:
                stmt = stmt.where(w)
            return int((await archive_db.execute(stmt)).scalar_one() or 0)

        oldest = (await archive_db.execute(
            select(func.min(ArchivedCampaign.archived_at))
        )).scalar_one()
        storage_bytes = int((await archive_db.execute(
            select(func.coalesce(func.sum(ArchivedSourceFile.size_bytes), 0))
        )).scalar_one() or 0)

        return {
            "archived_campaigns": await _count(ArchivedCampaign),
            "master_contacts": await _count(MasterContact),
            "anonymised_contacts": await _count(MasterContact, MasterContact.anonymised_at.is_not(None)),
            "archived_payments": await _count(ArchivedPayment),
            "archived_reports": await _count(ArchivedReport),
            "active_legal_holds": await _count(LegalHold, LegalHold.is_active.is_(True)),
            "pending_erasures": await _count(ErasureRequest, ErasureRequest.status == "pending"),
            "oldest_archived_at": oldest,
            "storage_estimate_bytes": storage_bytes,
            "live_retention_months": settings.ARCHIVE_LIVE_RETENTION_MONTHS,
            "clickhouse_events": await clickhouse.count_events(),  # None if CH unreachable
        }

    async def retention_breakdown(self, archive_db: AsyncSession) -> list[dict]:
        """Archived campaigns bucketed by quarter, with a hot/warm/glacier state
        derived from age (mirrors lifecycle policy)."""
        rows = (await archive_db.execute(
            select(
                func.date_trunc("quarter", ArchivedCampaign.archived_at).label("q"),
                func.count(),
            ).group_by("q").order_by("q")
        )).all()
        now = _now()
        out: list[dict] = []
        for q, cnt in rows:
            if q is None:
                continue
            age_days = (now - q).days
            state = "hot" if age_days < 90 else "warm" if age_days < 365 else "glacier"
            out.append({
                "period": f"{q.year} Q{(q.month - 1) // 3 + 1}",
                "campaigns": int(cnt), "state": state,
            })
        return out


archive_service = ArchiveService()
