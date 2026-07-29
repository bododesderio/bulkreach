# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""M8 — superadmin impersonation ("log in as"): mint a short-lived token that
authenticates as the account owner, surfaces the acting admin on /auth/me, and is
still blocked from /admin/* by role. Start and stop are both audited."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _register(client) -> tuple[str, str, str]:
    """Register a throwaway account; return (account_id, owner_email, owner_token)."""
    email = f"m8imp_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post("/api/v1/auth/register", json={
        "account_name": "M8 Impersonate Co", "email": email, "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]
    me = await client.get("/api/v1/auth/me",
                          headers={"Authorization": f"Bearer {token}"})
    return me.json()["account"]["id"], email, token


async def test_impersonate_flow(client, super_headers):
    account_id, owner_email, _ = await _register(client)

    # Superadmin mints an impersonation token for the account.
    r = await client.post(
        f"/api/v1/admin/accounts/{account_id}/impersonate", headers=super_headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["account_id"] == account_id
    assert body["owner_email"] == owner_email
    assert body["expires_in"] == 30 * 60
    imp_token = body["access_token"]
    imp_headers = {"Authorization": f"Bearer {imp_token}"}

    # The token authenticates AS the owner, and /auth/me surfaces the acting admin.
    me = await client.get("/api/v1/auth/me", headers=imp_headers)
    assert me.status_code == 200, me.text
    assert me.json()["account"]["id"] == account_id
    assert me.json()["user"]["email"] == owner_email
    assert me.json()["user"]["impersonated_by"] == "super@bulkreach.ug"

    # Full access as the client — but /admin/* stays blocked by role (owner ≠ superadmin).
    admin_probe = await client.get("/api/v1/admin/accounts", headers=imp_headers)
    assert admin_probe.status_code == 403, admin_probe.text

    # Stop is called with the admin's REAL token and is accepted.
    stop = await client.post(
        "/api/v1/admin/accounts/impersonate-stop",
        headers=super_headers, json={"account_id": account_id},
    )
    assert stop.status_code == 200, stop.text
    assert stop.json()["ok"] is True


async def test_impersonate_missing_account(client, super_headers):
    r = await client.post(
        f"/api/v1/admin/accounts/{uuid.uuid4()}/impersonate", headers=super_headers
    )
    assert r.status_code == 404, r.text


async def test_impersonate_requires_superadmin(client, owner_headers):
    """A non-superadmin cannot mint an impersonation token."""
    account_id, _, _ = await _register(client)
    r = await client.post(
        f"/api/v1/admin/accounts/{account_id}/impersonate", headers=owner_headers
    )
    assert r.status_code == 403, r.text


async def test_impersonate_start_and_stop_audited(client, super_headers):
    account_id, _, _ = await _register(client)
    await client.post(
        f"/api/v1/admin/accounts/{account_id}/impersonate", headers=super_headers
    )
    await client.post(
        "/api/v1/admin/accounts/impersonate-stop",
        headers=super_headers, json={"account_id": account_id},
    )
    # Audit log should carry both the start and stop for this account.
    audit = await client.get(
        "/api/v1/admin/audit-log?resource_type=account&limit=500", headers=super_headers
    )
    assert audit.status_code == 200, audit.text
    actions = {
        (e["action"], e.get("resource_id"))
        for e in audit.json()["items"]
    }
    assert ("admin.impersonate.start", account_id) in actions
    assert ("admin.impersonate.stop", account_id) in actions
