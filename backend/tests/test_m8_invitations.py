"""M8 — team invitations: create → preview → accept (joins the account)."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_invite_lifecycle(client, owner_headers):
    invitee = f"m8team_{uuid.uuid4().hex[:10]}@example.com"

    # Owner creates an invite; dev_link carries the token in non-prod
    r = await client.post("/api/v1/invitations", headers=owner_headers,
                          json={"email": invitee, "role": "member"})
    assert r.status_code == 201, r.text
    assert r.json()["dev_link"]
    token = r.json()["dev_link"].rsplit("/", 1)[-1]

    # Appears in the pending list
    lst = await client.get("/api/v1/invitations", headers=owner_headers)
    assert any(i["email"] == invitee for i in lst.json())

    # Public preview is valid
    pv = await client.get(f"/api/v1/invitations/{token}")
    assert pv.status_code == 200 and pv.json()["valid"] is True
    assert pv.json()["email"] == invitee and pv.json()["existing_account"] is False

    # Accept without consent → 422
    bad = await client.post(f"/api/v1/invitations/{token}/accept", json={
        "password": "supersecret1", "accept_terms": True, "accept_privacy": True,
        "accept_data_retention": False,
    })
    assert bad.status_code == 422

    # Accept → creates a member user under the account, returns a token
    acc = await client.post(f"/api/v1/invitations/{token}/accept", json={
        "full_name": "Team Member", "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert acc.status_code == 201, acc.text
    member_token = acc.json()["access_token"]

    # The new member is a real user (email_verified via the invite link) with role member
    me = await client.get("/api/v1/auth/me",
                          headers={"Authorization": f"Bearer {member_token}"})
    assert me.status_code == 200
    assert me.json()["user"]["email"] == invitee
    assert me.json()["user"]["role"] == "member"
    assert me.json()["user"]["email_verified"] is True

    # Token is single-use → second accept fails, preview now invalid
    again = await client.post(f"/api/v1/invitations/{token}/accept", json={
        "password": "supersecret1", "accept_terms": True, "accept_privacy": True,
        "accept_data_retention": True,
    })
    assert again.status_code in (400, 409)
    pv2 = await client.get(f"/api/v1/invitations/{token}")
    assert pv2.json()["valid"] is False


async def test_invite_existing_email_conflict(client, owner_headers):
    # Inviting an email that already has an account is refused
    r = await client.post("/api/v1/invitations", headers=owner_headers,
                          json={"email": "super@bulkreach.ug", "role": "member"})
    assert r.status_code == 409


async def test_preview_unknown_token(client):
    r = await client.get("/api/v1/invitations/deadbeef")
    assert r.status_code == 200 and r.json()["valid"] is False


async def test_create_invite_requires_admin(client):
    r = await client.post("/api/v1/invitations", json={"email": "x@example.com"})
    assert r.status_code in (401, 403)
