"""M8 — auth & account contract."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_register_requires_consent(client):
    email = f"m8_{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/api/v1/auth/register", json={
        "account_name": "M8 Co", "email": email, "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": False,
    })
    assert r.status_code == 422


async def test_register_login_me(client):
    email = f"m8_{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/api/v1/auth/register", json={
        "account_name": "M8 Co", "email": email, "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]

    # duplicate -> 409
    r2 = await client.post("/api/v1/auth/register", json={
        "account_name": "Dup", "email": email, "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert r2.status_code == 409

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["user"]["email"] == email
    assert body["account"]["plan"] == "trial"


async def test_me_requires_auth(client):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code in (401, 403)


async def test_admin_route_forbidden_for_owner(client, owner_headers):
    """A non-superadmin must not reach admin endpoints."""
    r = await client.get("/api/v1/admin/overview", headers=owner_headers)
    assert r.status_code == 403


async def test_admin_route_unauth(client):
    r = await client.get("/api/v1/admin/overview")
    assert r.status_code in (401, 403)
