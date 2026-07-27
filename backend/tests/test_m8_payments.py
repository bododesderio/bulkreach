"""M8 — payments: plans, simulated checkout → verify, history."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_plans_and_methods(client, owner_headers):
    plans = await client.get("/api/v1/payments/plans", headers=owner_headers)
    assert plans.status_code == 200
    assert isinstance(plans.json(), list) and len(plans.json()) >= 1

    methods = await client.get("/api/v1/payments/methods", headers=owner_headers)
    assert methods.status_code == 200
    assert {m["method"] for m in methods.json()} <= {"mtn_momo", "airtel_money", "card"}


async def test_simulated_checkout_then_verify(client, owner_headers):
    plans = (await client.get("/api/v1/payments/plans", headers=owner_headers)).json()
    priced = next((p for p in plans if p["price_ugx"] > 0), plans[0])

    r = await client.post("/api/v1/payments/checkout", headers=owner_headers, json={
        "plan_id": priced["id"], "method": "mtn_momo",
        "phone": "+256770000000", "purpose": "subscription",
    })
    assert r.status_code == 200, r.text
    intent = r.json()
    assert intent["mode"] == "simulated"
    assert intent["status"] in ("pending", "created")
    tx_ref = intent["tx_ref"]

    # Simulator settles successful on first verify.
    v = await client.get(f"/api/v1/payments/{tx_ref}/verify", headers=owner_headers)
    assert v.status_code == 200, v.text
    assert v.json()["status"] == "successful"
    assert v.json()["amount_ugx"] == priced["price_ugx"]  # server-authoritative amount


async def test_checkout_requires_phone_for_momo(client, owner_headers):
    plans = (await client.get("/api/v1/payments/plans", headers=owner_headers)).json()
    r = await client.post("/api/v1/payments/checkout", headers=owner_headers, json={
        "plan_id": plans[0]["id"], "method": "mtn_momo", "phone": "", "purpose": "subscription",
    })
    assert r.status_code == 422


async def test_history(client, owner_headers):
    r = await client.get("/api/v1/payments/history", headers=owner_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
