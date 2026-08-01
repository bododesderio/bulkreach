# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""M9 — delivery-report (DLR) ingestion + suppression."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.database import LiveSessionLocal
from app.models.account import Account
from app.models.campaign import Campaign, Message
from app.services import deliveries, dlr_providers


async def _mk_message(db, account_id, channel, recipient, pmid):
    camp = Campaign(account_id=account_id, name="DLR test", type=channel, status="completed")
    db.add(camp)
    await db.flush()
    msg = Message(
        campaign_id=camp.id, channel=channel, recipient=recipient,
        status="sent", provider_message_id=pmid, max_attempts=1,
    )
    db.add(msg)
    await db.flush()
    return camp, msg


async def _any_account_id(db):
    return (await db.execute(select(Account.id).limit(1))).scalar_one()


# ── record_delivery ──────────────────────────────────────────────────────────
@pytest.mark.asyncio(loop_scope="session")
async def test_record_delivery_marks_delivered_idempotently():
    async with LiveSessionLocal() as db:
        acct_id = await _any_account_id(db)
        pmid = f"pm-{uuid.uuid4().hex[:12]}"
        camp, msg = await _mk_message(db, acct_id, "sms", "+256700000001", pmid)

        assert await deliveries.record_delivery(
            db, provider="africastalking", provider_message_id=pmid, outcome="delivered", commit=True)
        await db.refresh(msg); await db.refresh(camp)
        assert msg.status == "delivered" and msg.delivered_at is not None
        assert camp.delivered == 1

        # A repeated/out-of-order DLR must not double-count.
        assert await deliveries.record_delivery(
            db, provider="africastalking", provider_message_id=pmid, outcome="delivered", commit=True)
        await db.refresh(camp)
        assert camp.delivered == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_record_delivery_bounce_suppresses_recipient():
    async with LiveSessionLocal() as db:
        acct_id = await _any_account_id(db)
        pmid = f"pm-{uuid.uuid4().hex[:12]}"
        email = f"Bounce-{uuid.uuid4().hex[:8]}@Example.com"
        camp, msg = await _mk_message(db, acct_id, "email", email, pmid)

        await deliveries.record_delivery(
            db, provider="mailgun", provider_message_id=pmid, outcome="bounced", commit=True)
        await db.refresh(msg); await db.refresh(camp)
        assert msg.status == "bounced" and camp.bounced == 1
        # Suppression is case-insensitive for email.
        assert await deliveries.is_suppressed(db, acct_id, "email", email.lower())
        assert email.lower() in await deliveries.suppressed_addresses(db, acct_id, "email")


@pytest.mark.asyncio(loop_scope="session")
async def test_record_delivery_unknown_message_ignored():
    async with LiveSessionLocal() as db:
        ok = await deliveries.record_delivery(
            db, provider="mailgun", provider_message_id=f"nope-{uuid.uuid4().hex}", outcome="delivered")
        assert ok is False


# ── parsers ──────────────────────────────────────────────────────────────────
def test_parse_simulator():
    verified, events = dlr_providers.parse(
        "simulator", b"", {"provider_message_id": "x", "outcome": "delivered"}, None)
    assert verified and events and events[0]["outcome"] == "delivered"


def test_parse_africastalking_form():
    verified, events = dlr_providers.parse(
        "africastalking", b"", None, {"id": "ATid123", "status": "Success", "phoneNumber": "+256700000002"})
    assert verified and events[0] == {
        "provider_message_id": "ATid123", "outcome": "delivered",
        "recipient": "+256700000002", "raw": {"failureReason": None}}


def test_parse_mailgun_rejects_bad_signature(monkeypatch):
    from app.core.config import settings as s
    monkeypatch.setattr(s, "MAILGUN_API_KEY", "signing-secret", raising=False)
    verified, events = dlr_providers.parse(
        "mailgun", b"",
        {"signature": {"token": "t", "timestamp": "1", "signature": "deadbeef"},
         "event-data": {"event": "delivered"}}, None)
    assert verified is False


# ── webhook route ─────────────────────────────────────────────────────────────
@pytest.mark.asyncio(loop_scope="session")
async def test_dlr_webhook_applies(client):
    async with LiveSessionLocal() as db:
        acct_id = await _any_account_id(db)
        pmid = f"pm-{uuid.uuid4().hex[:12]}"
        camp, _ = await _mk_message(db, acct_id, "sms", "+256700000003", pmid)
        camp_id = camp.id
        await db.commit()  # persist so the webhook's own session can see it

    r = await client.post(f"/api/v1/webhooks/dlr/simulator",
                          json={"provider_message_id": pmid, "outcome": "delivered"})
    assert r.status_code == 200, r.text
    assert r.json()["applied"] == 1

    async with LiveSessionLocal() as db:
        camp = await db.get(Campaign, camp_id)
        assert camp.delivered == 1


@pytest.mark.asyncio(loop_scope="session")
async def test_suppressions_crud(client, owner_headers):
    email = f"manual-{uuid.uuid4().hex[:8]}@example.com"
    r = await client.post("/api/v1/suppressions", headers=owner_headers,
                          json={"channel": "email", "address": email})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["reason"] == "manual"

    r = await client.get("/api/v1/suppressions?channel=email", headers=owner_headers)
    assert r.status_code == 200
    assert any(s["id"] == sid for s in r.json())

    r = await client.delete(f"/api/v1/suppressions/{sid}", headers=owner_headers)
    assert r.status_code == 204


@pytest.mark.asyncio(loop_scope="session")
async def test_compute_stats_dlr_counts_survive_the_schema():
    """compute_stats derives delivered/bounced from DLRs — and the CampaignStats
    response schema must expose them (they were silently dropped before)."""
    from app.schemas.campaign import CampaignStats
    from app.services import campaign_service

    async with LiveSessionLocal() as db:
        acct_id = await _any_account_id(db)
        pmid = f"pm-{uuid.uuid4().hex[:12]}"
        camp, _ = await _mk_message(db, acct_id, "sms", "+256700000009", pmid)
        await deliveries.record_delivery(
            db, provider="africastalking", provider_message_id=pmid,
            outcome="delivered", commit=True)

        stats = await campaign_service.compute_stats(db, camp.id)
        assert stats["delivered"] == 1
        assert "bounced" in stats and "delivered_rate" in stats

        # The API response model must retain the DLR counts, not drop them.
        model = CampaignStats(**stats)
        assert model.delivered == 1 and model.bounced == 0


# ── inbound STOP / opt-out ────────────────────────────────────────────────────
@pytest.mark.asyncio(loop_scope="session")
async def test_inbound_stop_suppresses_for_sending_account():
    async with LiveSessionLocal() as db:
        acct_id = await _any_account_id(db)
        number = f"+2567{uuid.uuid4().int % 10**8:08d}"
        await _mk_message(db, acct_id, "sms", number, f"pm-{uuid.uuid4().hex[:10]}")
        await db.commit()

        # A STOP reply opts the sender out for the account that messaged them.
        res = await deliveries.handle_inbound_sms(db, from_number=number, text="STOP", commit=True)
        assert res == "suppressed"
        assert await deliveries.is_suppressed(db, acct_id, "sms", number)

        # Idempotent — a second STOP doesn't create a duplicate.
        assert await deliveries.handle_inbound_sms(db, from_number=number, text="stop", commit=True) == "already_suppressed"

        # A non-STOP reply is ignored; an unknown number (never messaged) is a no-op.
        assert await deliveries.handle_inbound_sms(db, from_number=number, text="hello there", commit=True) is None
        never = f"+2567{uuid.uuid4().int % 10**8:08d}"
        assert await deliveries.handle_inbound_sms(db, from_number=never, text="STOP", commit=True) is None


@pytest.mark.asyncio(loop_scope="session")
async def test_inbound_webhook_route_suppresses(client):
    async with LiveSessionLocal() as db:
        acct_id = await _any_account_id(db)
        number = f"+2567{uuid.uuid4().int % 10**8:08d}"
        await _mk_message(db, acct_id, "sms", number, f"pm-{uuid.uuid4().hex[:10]}")
        await db.commit()

    r = await client.post("/api/v1/webhooks/inbound/simulator",
                          json={"from": number, "text": "STOP"})
    assert r.status_code == 200, r.text
    assert r.json()["suppressed"] == 1

    async with LiveSessionLocal() as db:
        assert await deliveries.is_suppressed(db, acct_id, "sms", number)
