"""M8 — billing slice 3: invoices/VAT, gapless numbering, proration, dunning."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.database import LiveSessionLocal
from app.core.redis import redis
from app.models.account import Account
from app.models.billing import Plan, Subscription

pytestmark = pytest.mark.asyncio(loop_scope="session")

_CONSENT = {"accept_terms": True, "accept_privacy": True, "accept_data_retention": True}


async def _fresh_owner(client) -> tuple[dict, str, str]:
    keys = await redis.keys("rl:login:*")
    if keys:
        await redis.delete(*keys)
    email = f"m8inv_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post("/api/v1/auth/register", json={
        "account_name": "Invoice Co", "email": email, "password": "supersecret1", **_CONSENT,
    })
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]
    hdr = {"Authorization": f"Bearer {token}"}
    account_id = (await client.get("/api/v1/auth/me", headers=hdr)).json()["account"]["id"]
    return hdr, account_id, email


async def _pay(client, hdr, plan_id: str) -> dict:
    """Simulated successful subscription payment → returns the verified payment."""
    r = await client.post("/api/v1/payments/checkout", headers=hdr, json={
        "plan_id": plan_id, "method": "mtn_momo", "phone": "+256770000000", "purpose": "subscription",
    })
    assert r.status_code == 200, r.text
    tx_ref = r.json()["tx_ref"]
    v = await client.get(f"/api/v1/payments/{tx_ref}/verify", headers=hdr)
    assert v.status_code == 200, v.text
    assert v.json()["status"] == "successful"
    return v.json()


async def test_payment_success_issues_invoice_with_vat(client):
    hdr, _acct, _email = await _fresh_owner(client)
    plans = (await client.get("/api/v1/payments/plans", headers=hdr)).json()
    priced = next(p for p in plans if p["price_ugx"] > 0)

    await _pay(client, hdr, priced["id"])

    invs = await client.get("/api/v1/billing/invoices", headers=hdr)
    assert invs.status_code == 200, invs.text
    items = invs.json()
    assert len(items) == 1
    inv = items[0]
    assert inv["number"].startswith("BR-INV-")
    assert inv["status"] == "paid"
    # VAT is backed out of the (inclusive) price, exact split.
    assert inv["subtotal_ugx"] + inv["vat_ugx"] == inv["total_ugx"] == priced["price_ugx"]
    assert inv["vat_rate"] == pytest.approx(0.18)

    # PDF endpoint: 200 if WeasyPrint native libs present, 503 if absent — never 500.
    pdf = await client.get(f"/api/v1/billing/invoices/{inv['id']}/pdf", headers=hdr)
    assert pdf.status_code in (200, 503), pdf.text
    if pdf.status_code == 200:
        assert pdf.headers["content-type"] == "application/pdf"


async def test_invoice_numbers_are_gapless_and_unique(client):
    numbers = []
    for _ in range(2):
        hdr, _a, _e = await _fresh_owner(client)
        plans = (await client.get("/api/v1/payments/plans", headers=hdr)).json()
        priced = next(p for p in plans if p["price_ugx"] > 0)
        await _pay(client, hdr, priced["id"])
        inv = (await client.get("/api/v1/billing/invoices", headers=hdr)).json()[0]
        numbers.append(inv["number"])
    assert len(set(numbers)) == 2  # unique
    year = datetime.now(timezone.utc).year
    assert all(n.startswith(f"BR-INV-{year}-") for n in numbers)
    seqs = sorted(int(n.rsplit("-", 1)[1]) for n in numbers)
    assert seqs[1] == seqs[0] + 1  # gapless


async def test_proration_preview_and_upgrade_charge(client):
    hdr, _acct, _email = await _fresh_owner(client)
    plans = sorted(
        [p for p in (await client.get("/api/v1/payments/plans", headers=hdr)).json() if p["price_ugx"] > 0],
        key=lambda p: p["price_ugx"],
    )
    if len(plans) < 2:
        pytest.skip("need two priced plans to test proration")
    cheap, pricey = plans[0], plans[-1]

    # Fresh account: no subscription yet → nothing to prorate.
    pre0 = await client.get(f"/api/v1/billing/proration-preview?plan_id={pricey['id']}", headers=hdr)
    assert pre0.status_code == 200
    assert pre0.json()["applies"] is False
    assert pre0.json()["amount_due_ugx"] == pricey["price_ugx"]

    # Buy the cheap plan → active subscription.
    await _pay(client, hdr, cheap["id"])

    # Now an upgrade preview credits unused time on the cheap plan.
    pre1 = (await client.get(
        f"/api/v1/billing/proration-preview?plan_id={pricey['id']}", headers=hdr)).json()
    assert pre1["applies"] is True
    assert pre1["credit_ugx"] > 0
    assert pre1["amount_due_ugx"] == pricey["price_ugx"] - pre1["credit_ugx"]
    assert pre1["amount_due_ugx"] < pricey["price_ugx"]

    # The actual upgrade charge equals the prorated amount, not the list price.
    pay = await _pay(client, hdr, pricey["id"])
    assert pay["amount_ugx"] < pricey["price_ugx"]


async def test_auto_renew_toggle(client):
    hdr, _acct, _email = await _fresh_owner(client)
    plans = (await client.get("/api/v1/payments/plans", headers=hdr)).json()
    priced = next(p for p in plans if p["price_ugx"] > 0)
    await _pay(client, hdr, priced["id"])

    st = (await client.get("/api/v1/billing/subscription", headers=hdr)).json()
    assert st["status"] == "active"
    assert st["auto_renew"] is True

    off = await client.patch("/api/v1/billing/auto-renew", headers=hdr, json={"auto_renew": False})
    assert off.status_code == 200
    assert off.json()["auto_renew"] is False


async def test_renewal_sweep_and_dunning_suspend(client):
    """A subscription whose period ended goes past_due; 31 days past due → suspended."""
    from app.services.billing.dunning import run_dunning_sweep, run_renewal_sweep

    hdr, account_id, _email = await _fresh_owner(client)
    plans = (await client.get("/api/v1/payments/plans", headers=hdr)).json()
    plan_id = plans[0]["id"]

    now = datetime.now(timezone.utc)
    # Seed an active subscription that expired an hour ago.
    async with LiveSessionLocal() as db:
        db.add(Subscription(
            account_id=uuid.UUID(account_id), plan_id=uuid.UUID(plan_id), status="active",
            current_period_start=now - timedelta(days=30, hours=1),
            current_period_end=now - timedelta(hours=1),
            auto_renew=True,
        ))
        await db.commit()

    # Renewal sweep → past_due, dunning opened at stage 1.
    async with LiveSessionLocal() as db:
        res = await run_renewal_sweep(db)
        await db.commit()
    assert res["past_due_opened"] >= 1
    async with LiveSessionLocal() as db:
        sub = (await db.execute(
            select(Subscription).where(Subscription.account_id == uuid.UUID(account_id))
        )).scalar_one()
        assert sub.status == "past_due"
        assert sub.dunning_stage == 1
        # Backdate past_due to beyond the grace window.
        sub.past_due_since = now - timedelta(days=31)
        await db.commit()

    # Dunning sweep → suspended + downgraded to trial, subscription cancelled.
    async with LiveSessionLocal() as db:
        res2 = await run_dunning_sweep(db)
        await db.commit()
    assert res2["suspended"] >= 1
    async with LiveSessionLocal() as db:
        acct = await db.get(Account, uuid.UUID(account_id))
        sub = (await db.execute(
            select(Subscription).where(Subscription.account_id == uuid.UUID(account_id))
        )).scalar_one()
        assert acct.status == "suspended"
        assert acct.plan == "trial"
        assert sub.status == "cancelled"
