# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""M9 — deep profile settings + per-client plan controls."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.subscription.enforce import Limits

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _fresh_account(client) -> tuple[str, str]:
    """Register a throwaway account; return (token, account_id)."""
    email = f"m9_{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/api/v1/auth/register", json={
        "account_name": "M9 Co", "email": email, "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    return token, me.json()["account"]["id"]


# ── Feature A: profile ───────────────────────────────────────────────────────
async def test_update_profile(client):
    token, _ = await _fresh_account(client)
    h = {"Authorization": f"Bearer {token}"}
    r = await client.patch("/api/v1/auth/me", headers=h, json={
        "name": "Renamed Co", "contact_name": "Ada", "phone": "+256700000000",
        "timezone": "Africa/Nairobi", "report_header": "Ada Ltd — Reports",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Renamed Co"
    assert body["timezone"] == "Africa/Nairobi"
    # Persisted
    me = await client.get("/api/v1/auth/me", headers=h)
    assert me.json()["account"]["contact_name"] == "Ada"


async def test_change_password(client):
    token, _ = await _fresh_account(client)
    h = {"Authorization": f"Bearer {token}"}
    # wrong current
    r = await client.post("/api/v1/auth/change-password", headers=h, json={
        "current_password": "wrongwrong", "new_password": "brandnew12345",
    })
    assert r.status_code == 400
    # new == current is rejected
    r = await client.post("/api/v1/auth/change-password", headers=h, json={
        "current_password": "supersecret1", "new_password": "supersecret1",
    })
    assert r.status_code == 400
    # success
    r = await client.post("/api/v1/auth/change-password", headers=h, json={
        "current_password": "supersecret1", "new_password": "brandnew12345",
    })
    assert r.status_code == 200, r.text


async def test_delete_account_closes_and_blocks_login(client):
    token, _ = await _fresh_account(client)
    h = {"Authorization": f"Bearer {token}"}
    me = await client.get("/api/v1/auth/me", headers=h)
    email = me.json()["user"]["email"]
    name = me.json()["account"]["name"]

    # wrong password
    r = await client.post("/api/v1/auth/delete-account", headers=h,
                          json={"password": "nope", "confirm": name})
    assert r.status_code == 400
    # confirm text mismatch
    r = await client.post("/api/v1/auth/delete-account", headers=h,
                          json={"password": "supersecret1", "confirm": "not the name"})
    assert r.status_code == 400
    # success
    r = await client.post("/api/v1/auth/delete-account", headers=h,
                          json={"password": "supersecret1", "confirm": name})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "closed"
    # a closed account can no longer authenticate
    login = await client.post("/api/v1/auth/login",
                              json={"email": email, "password": "supersecret1"})
    assert login.status_code == 403


# ── Feature B: per-client plan controls ──────────────────────────────────────
async def test_assign_plan_requires_super(client, owner_headers):
    r = await client.post(f"/api/v1/admin/accounts/{uuid.uuid4()}/plan",
                          headers=owner_headers, json={"plan_id": str(uuid.uuid4())})
    assert r.status_code == 403


async def test_assign_plan_with_overrides(client, super_headers):
    token, account_id = await _fresh_account(client)
    plans = await client.get("/api/v1/admin/plans", headers=super_headers)
    assert plans.status_code == 200, plans.text
    plan_id = plans.json()[0]["id"] if isinstance(plans.json(), list) else plans.json()["items"][0]["id"]

    r = await client.post(f"/api/v1/admin/accounts/{account_id}/plan", headers=super_headers, json={
        "plan_id": plan_id,
        "custom_messages_per_month": 99999,
        "custom_daily_limit": 321,
        "custom_price_ugx": 150000,
        "period_days": 45,
        "note": "Enterprise pilot",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["manually_assigned"] is True
    assert body["custom_messages_per_month"] == 99999
    assert body["custom_daily_limit"] == 321

    # Detail reflects the override + custom-deal flag
    detail = await client.get(f"/api/v1/admin/accounts/{account_id}", headers=super_headers)
    assert detail.status_code == 200
    sub = detail.json()["subscription"]
    assert sub["manually_assigned"] is True
    assert sub["custom_messages_per_month"] == 99999


# ── Feature B: enforcement layering (unit) ───────────────────────────────────
def test_limits_layers_overrides_over_plan():
    plan = SimpleNamespace(
        name="Starter", messages_per_month=1000,
        features={"gates": {"daily_limit": 50, "simultaneous_limit": 2, "scheduling": False}},
    )
    # No sub → inherits plan
    base = Limits(plan, is_trial=False)
    assert base.monthly_limit == 1000
    assert base.daily_limit == 50
    assert base.scheduling is False

    # Overrides win; -1 monthly = unlimited; custom_features merges gates
    sub = SimpleNamespace(
        custom_messages_per_month=-1, custom_daily_limit=500,
        custom_features={"gates": {"scheduling": True, "simultaneous_limit": 9}},
    )
    over = Limits(plan, is_trial=False, sub=sub)
    assert over.monthly_limit is None            # -1 → unlimited
    assert over.daily_limit == 500
    assert over.scheduling is True
    assert over.simultaneous_limit == 9

    # NULL overrides fall back to the plan
    partial = SimpleNamespace(
        custom_messages_per_month=None, custom_daily_limit=None, custom_features=None,
    )
    fell_back = Limits(plan, is_trial=False, sub=partial)
    assert fell_back.monthly_limit == 1000
    assert fell_back.daily_limit == 50
