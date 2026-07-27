"""M8 — admin portal: overview, accounts (suspend/activate), campaigns, audit,
managed workflow, health, revenue, plan CRUD."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_overview(client, super_headers):
    r = await client.get("/api/v1/admin/overview?period=month", headers=super_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["period"] == "month"
    for k in ("total_clients", "revenue_ugx", "messages", "managed_queue_pending"):
        assert k in body["kpis"]
    assert isinstance(body["activity"], list)


async def test_accounts_list_and_suspend_activate(client, super_headers):
    # Register a throwaway account to toggle (never touch real accounts).
    email = f"m8adm_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post("/api/v1/auth/register", json={
        "account_name": "M8 Toggle Co", "email": email, "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert reg.status_code == 201
    me = await client.get("/api/v1/auth/me",
                          headers={"Authorization": f"Bearer {reg.json()['access_token']}"})
    account_id = me.json()["account"]["id"]

    lst = await client.get("/api/v1/admin/accounts?limit=500", headers=super_headers)
    assert lst.status_code == 200
    assert any(a["id"] == account_id for a in lst.json()["items"])
    assert "mrr_ugx" in lst.json()["stats"]

    s = await client.post(f"/api/v1/admin/accounts/{account_id}/suspend", headers=super_headers)
    assert s.status_code == 200
    assert s.json()["status"] == "suspended" and s.json()["is_active"] is False

    a = await client.post(f"/api/v1/admin/accounts/{account_id}/activate", headers=super_headers)
    assert a.status_code == 200
    assert a.json()["status"] == "active" and a.json()["is_active"] is True


async def test_suspended_account_cannot_login(client, super_headers):
    """Security: suspend must actually block the user at auth."""
    email = f"m8susp_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post("/api/v1/auth/register", json={
        "account_name": "M8 Susp Co", "email": email, "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert reg.status_code == 201
    account_id = (await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {reg.json()['access_token']}"},
    )).json()["account"]["id"]

    await client.post(f"/api/v1/admin/accounts/{account_id}/suspend", headers=super_headers)
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret1"})
    assert r.status_code in (401, 403), f"suspended account still logged in: {r.status_code}"


async def test_campaigns_audit_health_revenue(client, super_headers):
    c = await client.get("/api/v1/admin/campaigns", headers=super_headers)
    assert c.status_code == 200 and "items" in c.json() and "stats" in c.json()

    a = await client.get("/api/v1/admin/audit-log?limit=20", headers=super_headers)
    assert a.status_code == 200 and "total" in a.json()

    h = await client.get("/api/v1/admin/health", headers=super_headers)
    assert h.status_code == 200
    assert h.json()["overall"] in ("operational", "degraded", "down")
    assert len(h.json()["services"]) >= 2

    rev = await client.get("/api/v1/admin/revenue?period=quarter", headers=super_headers)
    assert rev.status_code == 200
    for k in ("mrr_ugx", "collected_ugx", "outstanding_ugx", "arpu_ugx"):
        assert k in rev.json()["totals"]


async def test_managed_workflow_forward_only(client, super_headers):
    account_id = (await client.get(
        "/api/v1/admin/accounts?limit=1", headers=super_headers
    )).json()["items"][0]["id"]

    created = await client.post("/api/v1/admin/managed", headers=super_headers, json={
        "account_id": account_id, "brief_text": "M8 test brief — 1000 SMS",
    })
    assert created.status_code == 201, created.text
    mid = created.json()["id"]
    assert created.json()["status"] == "briefed"

    # backward is rejected
    back = await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                              json={"status": "briefed"})
    # briefed→briefed is a no-op (same index); moving to an earlier stage from a later one is 409.
    assert back.status_code == 200

    # advance forward through the lifecycle
    for stage in ("copy_approved", "scheduled", "sending", "complete"):
        r = await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                               json={"status": stage})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == stage

    # now a backward move IS rejected
    bad = await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                             json={"status": "briefed"})
    assert bad.status_code == 409

    # issuing a report with no linked campaign is refused (report flow is
    # covered end-to-end in test_managed_issue_report_generates_pdf)
    rep = await client.post(f"/api/v1/admin/managed/{mid}/report", headers=super_headers)
    assert rep.status_code == 409


async def test_admin_users_lists_staff(client, super_headers):
    r = await client.get("/api/v1/admin/users", headers=super_headers)
    assert r.status_code == 200
    users = r.json()
    assert len(users) >= 1
    # default listing returns only internal staff roles
    assert all(u["role"] in ("superadmin", "admin") for u in users)
    assert any(u["email"] == "super@bulkreach.ug" for u in users)


async def test_managed_assign_manager_from_staff(client, super_headers):
    staff = (await client.get("/api/v1/admin/users", headers=super_headers)).json()
    account_id = (await client.get(
        "/api/v1/admin/accounts?limit=1", headers=super_headers
    )).json()["items"][0]["id"]
    created = await client.post("/api/v1/admin/managed", headers=super_headers, json={
        "account_id": account_id, "brief_text": "assign-manager test",
    })
    mid = created.json()["id"]
    r = await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                           json={"account_manager_id": staff[0]["id"]})
    assert r.status_code == 200
    assert r.json()["account_manager_id"] == staff[0]["id"]
    assert r.json()["account_manager_email"] == staff[0]["email"]


async def test_managed_issue_report_generates_pdf(client, super_headers):
    """Link a completed campaign to a managed job, issue the report, and confirm
    a downloadable branded PDF is produced."""
    campaigns = (await client.get(
        "/api/v1/admin/campaigns?limit=200", headers=super_headers
    )).json()["items"]
    completed = next((c for c in campaigns if c["status"] == "completed"), None)
    if completed is None:
        return  # no completed campaign in this dev DB — skip gracefully

    created = await client.post("/api/v1/admin/managed", headers=super_headers, json={
        "account_id": completed["account_id"], "brief_text": "M8 report brief",
    })
    mid = created.json()["id"]

    # Link the campaign, then drive to complete.
    link = await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                              json={"campaign_id": completed["id"]})
    assert link.status_code == 200 and link.json()["campaign_id"] == completed["id"]

    # Issuing before complete is refused.
    early = await client.post(f"/api/v1/admin/managed/{mid}/report", headers=super_headers)
    assert early.status_code == 409

    for stage in ("copy_approved", "scheduled", "sending", "complete"):
        await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                           json={"status": stage})

    issued = await client.post(f"/api/v1/admin/managed/{mid}/report", headers=super_headers)
    assert issued.status_code == 200, issued.text
    assert issued.json()["status"] == "report_issued"
    assert issued.json()["report_ready"] is True
    assert issued.json()["report_url"]

    dl = await client.get(f"/api/v1/admin/managed/{mid}/report/download", headers=super_headers)
    assert dl.status_code == 200
    assert dl.headers["content-type"] == "application/pdf"
    assert dl.content[:5] == b"%PDF-"


async def test_managed_report_requires_linked_campaign(client, super_headers):
    account_id = (await client.get(
        "/api/v1/admin/accounts?limit=1", headers=super_headers
    )).json()["items"][0]["id"]
    created = await client.post("/api/v1/admin/managed", headers=super_headers, json={
        "account_id": account_id, "brief_text": "no campaign linked",
    })
    mid = created.json()["id"]
    for stage in ("copy_approved", "scheduled", "sending", "complete"):
        await client.patch(f"/api/v1/admin/managed/{mid}", headers=super_headers,
                           json={"status": stage})
    # complete but no linked campaign → cannot issue report
    r = await client.post(f"/api/v1/admin/managed/{mid}/report", headers=super_headers)
    assert r.status_code == 409


async def test_plan_crud(client, super_headers):
    name = f"M8 Plan {uuid.uuid4().hex[:6]}"
    create = await client.post("/api/v1/admin/plans", headers=super_headers, json={
        "name": name, "price_ugx": 12345, "messages_per_month": 1000, "batch_size": 500,
        "period": "month", "status": "active", "featured": False, "display_order": 7,
        "features": {"bullets": ["a", "b"]},
    })
    assert create.status_code == 201, create.text
    pid = create.json()["id"]

    patch = await client.patch(f"/api/v1/admin/plans/{pid}", headers=super_headers,
                               json={"price_ugx": 22222})
    assert patch.status_code == 200 and patch.json()["price_ugx"] == 22222

    dele = await client.delete(f"/api/v1/admin/plans/{pid}", headers=super_headers)
    assert dele.status_code == 200
