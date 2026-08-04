# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""M8 — managed pipeline: transition graph + admin-driven forward flow (no sign-off)."""
from __future__ import annotations

import pytest

from app.services.managed import pipeline

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ── Transition graph (pure) ──
def test_forward_jumps_allowed():
    assert pipeline.can_transition("briefed", "approved")      # skip forward
    assert pipeline.can_transition("drafting", "internal_review")
    assert pipeline.can_transition("sent", "report_issued")


def test_backward_blocked():
    assert not pipeline.can_transition("approved", "briefed")
    assert not pipeline.can_transition("sent", "drafting")
    assert not pipeline.can_transition("briefed", "briefed")   # no-op is not a transition


def test_approval_loop_edges():
    assert pipeline.can_transition("awaiting_approval", "changes_requested")
    assert pipeline.can_transition("changes_requested", "drafting")
    assert pipeline.can_transition("changes_requested", "awaiting_approval")
    # But you can't jump straight from the loop state to approved.
    assert not pipeline.can_transition("changes_requested", "approved")


def test_unknown_state_rejected():
    assert not pipeline.can_transition("briefed", "nonsense")
    assert not pipeline.is_valid("nonsense")
    assert pipeline.is_valid("awaiting_approval")


# ── End-to-end approval flow ──
async def _new_job(client, super_headers) -> str:
    account_id = (await client.get(
        "/api/v1/admin/accounts?limit=1", headers=super_headers
    )).json()["items"][0]["id"]
    created = await client.post("/api/v1/admin/managed", headers=super_headers, json={
        "account_id": account_id, "brief_text": "pipeline test brief",
    })
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def test_admin_drives_job_forward(client, super_headers):
    """The admin advances a job through the linear path solo — no client sign-off."""
    mid = await _new_job(client, super_headers)

    # Draft copy, then walk forward: briefed → drafting → scheduled → sent.
    await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                       json={"copy_sms": "Hello {{first_name}}."})
    for target in ("drafting", "scheduled", "sent"):
        r = await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                               json={"status": target})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == target

    # The client sign-off endpoint no longer exists.
    gone = await client.post(f"/api/v1/admin/managed/{mid}/request-approval", headers=super_headers)
    assert gone.status_code == 404


async def test_hold_and_cancel_flags(client, super_headers):
    mid = await _new_job(client, super_headers)
    h = await client.post(f"/api/v1/admin/managed/{mid}/hold", headers=super_headers)
    assert h.status_code == 200 and h.json()["on_hold"] is True
    u = await client.post(f"/api/v1/admin/managed/{mid}/unhold", headers=super_headers)
    assert u.json()["on_hold"] is False
    c = await client.post(f"/api/v1/admin/managed/{mid}/cancel", headers=super_headers)
    assert c.json()["cancelled"] is True


# ── Real dispatch from the managed workspace ──
async def test_send_dispatches_linked_campaign(client, super_headers, owner_headers):
    """POST /admin/managed/{id}/send actually materialises + dispatches the linked
    campaign (not just a status flip) and moves the job to 'sending'."""
    # Owner creates a draft SMS campaign against their contact list.
    me = (await client.get("/api/v1/auth/me", headers=owner_headers)).json()
    account_id = me["account"]["id"]
    lists = (await client.get("/api/v1/contacts/lists", headers=owner_headers)).json()
    list_id = (lists[0]["id"] if isinstance(lists, list) and lists
               else lists.get("items", [{}])[0].get("id"))
    camp = await client.post("/api/v1/campaigns", headers=owner_headers, json={
        "name": "Managed send test", "type": "sms",
        "contact_list_id": list_id, "sms_body": "Hi {{name|there}} from your team.",
    })
    assert camp.status_code == 201, camp.text
    cid = camp.json()["id"]

    # Admin creates a managed job for that account and links the campaign.
    mid = (await client.post("/api/v1/admin/managed", headers=super_headers, json={
        "account_id": account_id, "brief_text": "dispatch test", "campaign_id": cid,
    })).json()["id"]

    # Send it — should dispatch and move to 'sending'.
    sent = await client.post(f"/api/v1/admin/managed/{mid}/send", headers=super_headers)
    assert sent.status_code == 200, sent.text
    assert sent.json()["status"] == "sending"

    # The campaign left draft — it was really dispatched (inline simulator in tests).
    detail = (await client.get(f"/api/v1/campaigns/{cid}", headers=owner_headers)).json()
    assert detail["status"] != "draft"

    # Sending again is refused (already dispatched).
    again = await client.post(f"/api/v1/admin/managed/{mid}/send", headers=super_headers)
    assert again.status_code == 409, again.text


async def test_send_requires_linked_campaign(client, super_headers):
    """A job with no linked campaign can't be dispatched."""
    mid = await _new_job(client, super_headers)
    r = await client.post(f"/api/v1/admin/managed/{mid}/send", headers=super_headers)
    assert r.status_code == 409
    assert "link the campaign" in r.json()["detail"].lower()


async def test_cancel_stops_inflight_campaign(client, super_headers, owner_headers):
    """Cancelling a managed job whose campaign is in flight also STOPS the
    campaign — not just flips a flag (the mirror of the send bug)."""
    import uuid as _uuid
    from app.core.database import LiveSessionLocal
    from app.models.campaign import Campaign

    me = (await client.get("/api/v1/auth/me", headers=owner_headers)).json()
    lists = (await client.get("/api/v1/contacts/lists", headers=owner_headers)).json()
    list_id = (lists[0]["id"] if isinstance(lists, list) and lists
               else lists.get("items", [{}])[0].get("id"))
    cid = (await client.post("/api/v1/campaigns", headers=owner_headers, json={
        "name": "Cancel test", "type": "sms", "contact_list_id": list_id,
        "sms_body": "Hi {{name|there}}.",
    })).json()["id"]
    mid = (await client.post("/api/v1/admin/managed", headers=super_headers, json={
        "account_id": me["account"]["id"], "brief_text": "cancel test", "campaign_id": cid,
    })).json()["id"]

    # Simulate an in-flight dispatch (what a real async worker leaves it at).
    async with LiveSessionLocal() as db:
        camp = await db.get(Campaign, _uuid.UUID(cid))
        camp.status = "queued"
        await db.commit()

    c = await client.post(f"/api/v1/admin/managed/{mid}/cancel", headers=super_headers)
    assert c.status_code == 200 and c.json()["cancelled"] is True
    # The in-flight campaign was actually cancelled, not left running.
    detail = (await client.get(f"/api/v1/campaigns/{cid}", headers=owner_headers)).json()
    assert detail["status"] == "cancelled"
