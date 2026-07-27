"""M8 — subscription quota enforcement (Section K)."""
from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.core.database import LiveSessionLocal
from app.models.account import Account
from app.models.campaign import Campaign
from app.services.subscription import enforce

pytestmark = pytest.mark.asyncio(loop_scope="session")

_CONSENT = {"accept_terms": True, "accept_privacy": True, "accept_data_retention": True}


async def test_quota_endpoint_shape(client, owner_headers):
    r = await client.get("/api/v1/subscription/quota", headers=owner_headers)
    assert r.status_code == 200
    b = r.json()
    for k in ("plan", "active", "monthly_used", "monthly_limit", "pct", "monthly_resets_at"):
        assert k in b


async def test_quota_requires_auth(client):
    r = await client.get("/api/v1/subscription/quota")
    assert r.status_code in (401, 403)


async def test_trial_account_state_and_gate(client):
    email = f"m8sub_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post("/api/v1/auth/register", json={
        "account_name": "M8 Sub Co", "email": email, "password": "supersecret1", **_CONSENT,
    })
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    hdr = {"Authorization": f"Bearer {token}"}
    acct_id = (await client.get("/api/v1/auth/me", headers=hdr)).json()["account"]["id"]

    q = (await client.get("/api/v1/subscription/quota", headers=hdr)).json()
    assert q["is_trial"] is True
    assert q["monthly_limit"] >= 1  # trial free allowance

    # Direct gate check: exceeding the trial allowance is refused; within it passes
    # and decrements. (Full send e2e is exercised elsewhere; this isolates the gate.)
    async with LiveSessionLocal() as db:
        acct = await db.get(Account, uuid.UUID(acct_id))
        remaining = acct.trial_messages_remaining
        camp = Campaign(account_id=acct.id, name="gate", type="sms", status="draft")

        with pytest.raises(HTTPException) as ei:
            await enforce.enforce_send(db, acct, camp, remaining + 1)
        assert ei.value.status_code == 402
        assert ei.value.detail["code"] == "MONTHLY_QUOTA_EXCEEDED"

        await enforce.enforce_send(db, acct, camp, 1)
        assert acct.trial_messages_remaining == remaining - 1
        await db.rollback()


async def test_paid_plan_resolves_limits(client, owner_headers):
    """The owner account has a paid plan → quota state is active, not trial."""
    q = (await client.get("/api/v1/subscription/quota", headers=owner_headers)).json()
    assert q["active"] is True
    # monthly_limit is an int (capped plan) or None (unlimited) — never errors
    assert q["monthly_limit"] is None or isinstance(q["monthly_limit"], int)
