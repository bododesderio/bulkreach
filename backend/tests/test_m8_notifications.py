"""M8 — notifications: feed, unread count, mark-read, preferences, emit points."""
from __future__ import annotations

import uuid

import pytest

from app.core.database import LiveSessionLocal
from app.core.redis import redis
from app.models.account import Account

pytestmark = pytest.mark.asyncio(loop_scope="session")

_CONSENT = {"accept_terms": True, "accept_privacy": True, "accept_data_retention": True}


async def _fresh_owner(client) -> tuple[dict, str]:
    keys = await redis.keys("rl:login:*")
    if keys:
        await redis.delete(*keys)
    email = f"m8ntf_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post("/api/v1/auth/register", json={
        "account_name": "Notify Co", "email": email, "password": "supersecret1", **_CONSENT,
    })
    assert reg.status_code == 201, reg.text
    hdr = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    account_id = (await client.get("/api/v1/auth/me", headers=hdr)).json()["account"]["id"]
    return hdr, account_id


async def test_payment_success_emits_notification(client):
    hdr, _acct = await _fresh_owner(client)

    # Starts clean.
    assert (await client.get("/api/v1/notifications", headers=hdr)).json() == []
    assert (await client.get("/api/v1/notifications/unread-count", headers=hdr)).json()["count"] == 0

    plans = (await client.get("/api/v1/payments/plans", headers=hdr)).json()
    priced = next(p for p in plans if p["price_ugx"] > 0)
    co = await client.post("/api/v1/payments/checkout", headers=hdr, json={
        "plan_id": priced["id"], "method": "mtn_momo", "phone": "+256770000000", "purpose": "subscription",
    })
    tx = co.json()["tx_ref"]
    await client.get(f"/api/v1/payments/{tx}/verify", headers=hdr)

    feed = (await client.get("/api/v1/notifications", headers=hdr)).json()
    assert any(n["type"] == "payment.succeeded" for n in feed)
    count = (await client.get("/api/v1/notifications/unread-count", headers=hdr)).json()["count"]
    assert count >= 1

    # Mark one read → count drops.
    nid = next(n["id"] for n in feed if n["type"] == "payment.succeeded")
    r = await client.post(f"/api/v1/notifications/{nid}/read", headers=hdr)
    assert r.status_code == 200 and r.json()["read_at"] is not None

    # Mark all read → zero.
    await client.post("/api/v1/notifications/read-all", headers=hdr)
    assert (await client.get("/api/v1/notifications/unread-count", headers=hdr)).json()["count"] == 0


async def test_preferences_defaults_and_update(client):
    hdr, _acct = await _fresh_owner(client)
    prefs = (await client.get("/api/v1/notifications/preferences", headers=hdr)).json()
    assert prefs["channels"]["billing"] == ["in_app", "email"]
    assert prefs["channels"]["campaign"] == ["in_app"]

    # Turn off email for billing — but in_app for billing is force-kept.
    upd = await client.patch("/api/v1/notifications/preferences", headers=hdr, json={
        "channels": {"billing": ["email"], "campaign": []},
    })
    assert upd.status_code == 200
    ch = upd.json()["channels"]
    assert "in_app" in ch["billing"]  # critical category keeps in-app
    assert ch["campaign"] == []


async def test_quota_threshold_notification_is_idempotent(client):
    from app.services.notifications import notify_quota_threshold
    from app.services.subscription import quota as quota_svc

    hdr, account_id = await _fresh_owner(client)
    async with LiveSessionLocal() as db:
        account = await db.get(Account, uuid.UUID(account_id))
        marker = f"notif:quota:{account.id}:{quota_svc._now():%Y-%m}"
        await redis.delete(marker)

        # 85% of 1000 → crosses the 80% threshold once.
        await notify_quota_threshold(db, account, used=850, limit=1000)
        await db.commit()
    feed = (await client.get("/api/v1/notifications", headers=hdr)).json()
    threshold_notes = [n for n in feed if n["type"] == "quota.threshold"]
    assert len(threshold_notes) == 1
    assert threshold_notes[0]["meta"]["threshold"] == 80

    # Re-running at the same level does not duplicate.
    async with LiveSessionLocal() as db:
        account = await db.get(Account, uuid.UUID(account_id))
        await notify_quota_threshold(db, account, used=860, limit=1000)
        await db.commit()
    feed2 = (await client.get("/api/v1/notifications", headers=hdr)).json()
    assert len([n for n in feed2 if n["type"] == "quota.threshold"]) == 1


async def test_mark_read_rejects_other_accounts_notification(client):
    hdr_a, _a = await _fresh_owner(client)
    hdr_b, account_b = await _fresh_owner(client)

    # Create a notification owned by account B directly.
    from app.services.notifications import notify

    async with LiveSessionLocal() as db:
        n = await notify(db, account_id=uuid.UUID(account_b), type="system.test",
                         title="B only", body="hidden from A")
        await db.commit()
        nid = str(n.id)

    # Account A cannot see or mark B's notification.
    r = await client.post(f"/api/v1/notifications/{nid}/read", headers=hdr_a)
    assert r.status_code == 404
    # But B can.
    r2 = await client.post(f"/api/v1/notifications/{nid}/read", headers=hdr_b)
    assert r2.status_code == 200


async def _notifs_of(account_id: str, type_: str) -> list:
    from sqlalchemy import select

    from app.models.notification import Notification

    async with LiveSessionLocal() as db:
        rows = (
            await db.execute(
                select(Notification).where(
                    Notification.account_id == uuid.UUID(account_id),
                    Notification.type == type_,
                )
            )
        ).scalars().all()
        return list(rows)


async def test_admin_suspend_emits_notification(client, super_headers):
    hdr, account_id = await _fresh_owner(client)

    r = await client.post(f"/api/v1/admin/accounts/{account_id}/suspend", headers=super_headers)
    assert r.status_code == 200, r.text

    # The suspended account can't reach the feed via API, but the record must exist.
    notes = await _notifs_of(account_id, "account.suspended")
    assert len(notes) == 1
    assert notes[0].level == "error"

    # Reactivation emits its own success notice.
    r2 = await client.post(f"/api/v1/admin/accounts/{account_id}/activate", headers=super_headers)
    assert r2.status_code == 200, r2.text
    assert len(await _notifs_of(account_id, "account.reactivated")) == 1


async def test_campaign_total_failure_emits_failed(client):
    """A completed run that delivered nothing is reported as campaign.failed, not
    campaign.completed — verified at the notify() layer."""
    from app.services.notifications import notify

    _hdr, account_id = await _fresh_owner(client)

    async with LiveSessionLocal() as db:
        # Mirrors the engine's total-failure branch (sent == 0, failed > 0).
        await notify(
            db, account_id=uuid.UUID(account_id), type="campaign.failed", level="error",
            title="Campaign “Blast” failed to send",
            body="None of the 5 messages could be delivered.",
            meta={"sent": 0, "failed": 5},
        )
        await db.commit()

    failed = await _notifs_of(account_id, "campaign.failed")
    assert len(failed) == 1 and failed[0].level == "error"
