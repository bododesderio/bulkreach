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
