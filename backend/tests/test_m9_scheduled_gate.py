# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Phase 6 — the send gate raises a domain error (not HTTPException), so the ARQ
worker can catch it and react (pause + notify) instead of silently dropping a
scheduled campaign. This asserts the contract the worker relies on."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.database import LiveSessionLocal
from app.domain.exceptions import SendNotAllowed
from app.models.account import Account
from app.models.campaign import Campaign
from app.models.contact import Contact, ContactList
from app.services import campaign_service

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_scheduled_over_quota_raises_domain_error(client):
    # A trial account with only 1 message of allowance left.
    email = f"m9sched_{uuid.uuid4().hex[:10]}@example.com"
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "account_name": "Sched Co", "email": email, "password": "Sched1234!",
            "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
        },
    )
    assert reg.status_code == 201, reg.text
    me = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {reg.json()['access_token']}"},
    )
    account_id = uuid.UUID(me.json()["account"]["id"])

    async with LiveSessionLocal() as db:
        acct = await db.get(Account, account_id)
        acct.trial_messages_remaining = 1  # 3 recipients below will exceed this

        clist = ContactList(
            account_id=account_id, name="sched-list", source_format="paste",
            phone_column="phone", total_contacts=3, valid_contacts=3,
        )
        db.add(clist)
        await db.flush()
        for i in range(3):
            db.add(Contact(list_id=clist.id, phone=f"+25670000000{i}", is_valid=True))

        due = datetime.now(timezone.utc) - timedelta(minutes=1)
        camp = Campaign(
            account_id=account_id, contact_list_id=clist.id, name="Sched blast",
            type="sms", status="scheduled", scheduled_at=due,
        )
        db.add(camp)
        await db.commit()

        # The gate the worker calls per scheduled campaign now raises a domain
        # error — which promote_scheduled catches to pause + notify (rather than
        # the old HTTPException that its broad `except` silently swallowed).
        with pytest.raises(SendNotAllowed) as ei:
            await campaign_service.materialise_and_queue(db, camp)
        assert ei.value.code == "MONTHLY_QUOTA_EXCEEDED"
        assert ei.value.http_status == 402
        # The gate must reject BEFORE materialising rows or flipping status.
        assert camp.status == "scheduled"
