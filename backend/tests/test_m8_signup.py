"""M8 — multi-step signup: complete → verify email → onboarding."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")

_CONSENT = {"accept_terms": True, "accept_privacy": True, "accept_data_retention": True}


async def test_signup_complete_verify_onboarding(client):
    email = f"m8signup_{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/api/v1/auth/signup/complete", json={
        "account_name": "Step Co", "email": email, "password": "supersecret1",
        "contact_name": "Grace N", "phone": "+256770000000", "accept_marketing": True,
        **_CONSENT,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    token = body["access_token"]
    hdr = {"Authorization": f"Bearer {token}"}
    assert body["dev_code"] and len(body["dev_code"]) == 6  # surfaced in non-prod

    # Not yet verified
    me = (await client.get("/api/v1/auth/me", headers=hdr)).json()
    assert me["user"]["email_verified"] is False

    # Wrong code is rejected
    bad = await client.post("/api/v1/auth/verify-email", headers=hdr, json={"code": "000000"})
    assert bad.status_code == 400

    # Correct code verifies
    ok = await client.post("/api/v1/auth/verify-email", headers=hdr, json={"code": body["dev_code"]})
    assert ok.status_code == 200 and ok.json()["email_verified"] is True
    me2 = (await client.get("/api/v1/auth/me", headers=hdr)).json()
    assert me2["user"]["email_verified"] is True

    # Onboarding saves (all optional)
    ob = await client.patch("/api/v1/auth/onboarding", headers=hdr, json={
        "industry": "microfinance", "use_case": ["sms", "email"], "referral_source": "referral",
    })
    assert ob.status_code == 200


async def test_signup_complete_requires_consent(client):
    email = f"m8signup_{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/api/v1/auth/signup/complete", json={
        "account_name": "No Consent Co", "email": email, "password": "supersecret1",
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": False,
    })
    assert r.status_code == 422


async def test_resend_verification(client):
    email = f"m8resend_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post("/api/v1/auth/signup/complete", json={
        "account_name": "Resend Co", "email": email, "password": "supersecret1", **_CONSENT,
    })
    hdr = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    r = await client.post("/api/v1/auth/resend-verification", headers=hdr)
    assert r.status_code == 200
    new_code = r.json()["dev_code"]
    assert new_code and len(new_code) == 6
    # the resent code verifies
    ok = await client.post("/api/v1/auth/verify-email", headers=hdr, json={"code": new_code})
    assert ok.status_code == 200
