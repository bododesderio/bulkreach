"""M8 — managed portal: provision → temp login → forced activate → portal."""
from __future__ import annotations

import uuid

import pytest

from app.core.redis import redis

pytestmark = pytest.mark.asyncio(loop_scope="session")

_CONSENT = {"accept_terms": True, "accept_privacy": True, "accept_data_retention": True}


async def test_provision_activate_portal(client, super_headers):
    # Clear login rate-limit so the two logins in this test don't trip the window.
    keys = await redis.keys("rl:login:*")
    if keys:
        await redis.delete(*keys)

    email = f"m8mp_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post("/api/v1/auth/register", json={
        "account_name": "Managed Client Co", "email": email, "password": "supersecret1", **_CONSENT,
    })
    assert reg.status_code == 201
    account_id = (await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {reg.json()['access_token']}"},
    )).json()["account"]["id"]

    # Superadmin grants portal access → temp password (dev)
    g = await client.post(f"/api/v1/admin/accounts/{account_id}/portal-access", headers=super_headers)
    assert g.status_code == 200, g.text
    temp = g.json()["temp_password"]
    assert temp

    # Login with the temp password → managed_client + must_change_password
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": temp})
    assert login.status_code == 200, login.text
    hdr = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = (await client.get("/api/v1/auth/me", headers=hdr)).json()
    assert me["user"]["user_type"] == "managed_client"
    assert me["user"]["must_change_password"] is True

    # Activate: set a new password → flag clears
    act = await client.post("/api/v1/auth/activate-password", headers=hdr,
                            json={"new_password": "NewManaged1!"})
    assert act.status_code == 200
    me2 = (await client.get("/api/v1/auth/me", headers=hdr)).json()
    assert me2["user"]["must_change_password"] is False

    # Portal campaigns endpoint works (empty list is fine)
    pc = await client.get("/api/v1/managed-portal/campaigns", headers=hdr)
    assert pc.status_code == 200 and isinstance(pc.json(), list)

    # The old temp password no longer works
    old = await client.post("/api/v1/auth/login", json={"email": email, "password": temp})
    assert old.status_code == 401


async def test_portal_access_requires_superadmin(client, owner_headers):
    r = await client.post(
        "/api/v1/admin/accounts/00000000-0000-0000-0000-000000000000/portal-access",
        headers=owner_headers,
    )
    assert r.status_code == 403
