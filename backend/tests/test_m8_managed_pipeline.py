"""M8 — managed 15-state pipeline: transition graph + client copy-approval token flow."""
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


async def test_request_approval_requires_copy(client, super_headers):
    mid = await _new_job(client, super_headers)
    r = await client.post(f"/api/v1/admin/managed/{mid}/request-approval", headers=super_headers)
    assert r.status_code == 409  # no draft copy yet


async def test_full_copy_approval_cycle(client, super_headers):
    mid = await _new_job(client, super_headers)

    # Manager drafts copy.
    upd = await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers, json={
        "copy_sms": "Hello {{first_name}}, your statement is ready.",
    })
    assert upd.status_code == 200 and upd.json()["copy_sms"]

    # Send for approval → awaiting_approval, token minted server-side.
    sent = await client.post(f"/api/v1/admin/managed/{mid}/request-approval", headers=super_headers)
    assert sent.status_code == 200
    assert sent.json()["status"] == "awaiting_approval"
    assert sent.json()["approval_sent_at"]

    # Fetch the token from the DB (the client would get it by email link).
    from app.core.database import LiveSessionLocal
    from app.models.campaign import ManagedCampaign
    import uuid as _uuid
    async with LiveSessionLocal() as db:
        mc = await db.get(ManagedCampaign, _uuid.UUID(mid))
        assert mc.approval_token_hash is not None

    # An invalid token 404s (indistinguishable failure modes).
    assert (await client.get("/api/v1/managed-approve/deadbeef")).status_code == 404

    # Client requests changes → loop state + note recorded, token burned.
    #   (We drive it via the token we recreate below.)


async def test_request_changes_then_approve(client, super_headers, monkeypatch):
    """Exercise the public token endpoints by intercepting the minted token."""
    import app.services.managed.pipeline as pl

    captured: dict = {}
    real_new = pl.new_token

    def _capture():
        tok, h = real_new()
        captured["token"] = tok
        return tok, h

    monkeypatch.setattr(pl, "new_token", _capture)

    mid = await _new_job(client, super_headers)
    await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                       json={"copy_email_subject": "Q3 update", "copy_email_body": "<p>Hi</p>"})
    await client.post(f"/api/v1/admin/managed/{mid}/request-approval", headers=super_headers)
    token = captured["token"]

    # Client views the copy.
    view = await client.get(f"/api/v1/managed-approve/{token}")
    assert view.status_code == 200
    assert view.json()["copy_email_subject"] == "Q3 update"

    # Client requests changes → loop state, note stored, token single-use.
    rc = await client.post(f"/api/v1/managed-approve/{token}/request-changes",
                           json={"note": "Please soften the tone."})
    assert rc.status_code == 200
    assert rc.json()["status"] == "changes_requested"
    assert rc.json()["change_request_note"] == "Please soften the tone."
    # Token is burned — replay 404s.
    assert (await client.get(f"/api/v1/managed-approve/{token}")).status_code == 404

    # Manager revises + re-sends, client approves this time.
    await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                       json={"status": "drafting", "copy_email_body": "<p>Hi there</p>"})
    await client.post(f"/api/v1/admin/managed/{mid}/request-approval", headers=super_headers)
    token2 = captured["token"]
    appr = await client.post(f"/api/v1/managed-approve/{token2}/approve")
    assert appr.status_code == 200
    assert appr.json()["status"] == "approved"
    assert appr.json()["approved_at"]


async def test_hold_and_cancel_flags(client, super_headers):
    mid = await _new_job(client, super_headers)
    h = await client.post(f"/api/v1/admin/managed/{mid}/hold", headers=super_headers)
    assert h.status_code == 200 and h.json()["on_hold"] is True
    u = await client.post(f"/api/v1/admin/managed/{mid}/unhold", headers=super_headers)
    assert u.json()["on_hold"] is False
    c = await client.post(f"/api/v1/admin/managed/{mid}/cancel", headers=super_headers)
    assert c.json()["cancelled"] is True
