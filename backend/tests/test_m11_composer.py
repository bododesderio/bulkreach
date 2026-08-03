# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""M11 — composer cluster: merge-tag fallbacks, message templates, duplication."""
from __future__ import annotations

import pytest

from app.services import template_engine as te

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ── merge-tag fallbacks (pure) ──
def test_fallback_used_when_missing():
    assert te.render_sms("Hi {{name|there}}!", {}) == "Hi there!"
    assert te.render_sms("Hi {{name|there}}!", {"name": ""}) == "Hi there!"
    assert te.render_sms("Hi {{name|there}}!", {"name": "Grace"}) == "Hi Grace!"


def test_fallback_makes_tag_optional_for_validation():
    # A defaulted tag is always valid; a bare unknown tag is flagged.
    assert te.validate_template("{{name|there}}", []) == []
    assert te.validate_template("{{name}}", []) == ["name"]


def test_email_fallback_is_escaped():
    assert te.render_email_body("{{n|<b>x</b>}}", {}) == "&lt;b&gt;x&lt;/b&gt;"


# ── message templates + duplication (API) ──
async def test_template_crud_and_scope(client, owner_headers):
    created = await client.post("/api/v1/templates", headers=owner_headers, json={
        "name": "Payday reminder", "type": "sms", "sms_body": "Hi {{name|there}}",
    })
    assert created.status_code == 201, created.text
    tid = created.json()["id"]

    listed = await client.get("/api/v1/templates", headers=owner_headers)
    assert listed.status_code == 200
    assert any(t["id"] == tid for t in listed.json())

    gone = await client.delete(f"/api/v1/templates/{tid}", headers=owner_headers)
    assert gone.status_code == 200
    after = await client.get("/api/v1/templates", headers=owner_headers)
    assert all(t["id"] != tid for t in after.json())


async def test_duplicate_campaign(client, owner_headers):
    lists = (await client.get("/api/v1/contacts/lists", headers=owner_headers)).json()
    list_id = (lists[0]["id"] if isinstance(lists, list) and lists
               else lists.get("items", [{}])[0].get("id"))
    src = await client.post("/api/v1/campaigns", headers=owner_headers, json={
        "name": "Original", "type": "sms",
        "contact_list_id": list_id, "sms_body": "Hi {{name|there}}",
    })
    assert src.status_code == 201, src.text
    sid = src.json()["id"]

    dup = await client.post(f"/api/v1/campaigns/{sid}/duplicate", headers=owner_headers)
    assert dup.status_code == 201, dup.text
    body = dup.json()
    assert body["id"] != sid
    assert body["status"] == "draft"
    assert body["name"].endswith("(copy)")


# ── link/click tracking ──
def test_url_extract_and_rewrite():
    from app.services import tracking
    assert tracking.extract_urls("a https://x.co/p?q=1. b") == {"https://x.co/p?q=1"}
    m = {"https://x.co/p?q=1": "https://api/r/abc"}
    assert tracking.rewrite("Go https://x.co/p?q=1. now", m) == "Go https://api/r/abc. now"


async def test_click_redirect_and_stats(client, owner_headers):
    import uuid as _uuid
    from app.core.database import LiveSessionLocal
    from app.models.campaign import TrackedLink

    lists = (await client.get("/api/v1/contacts/lists", headers=owner_headers)).json()
    list_id = (lists[0]["id"] if isinstance(lists, list) and lists
               else lists.get("items", [{}])[0].get("id"))
    camp = await client.post("/api/v1/campaigns", headers=owner_headers, json={
        "name": "Tracked", "type": "sms", "contact_list_id": list_id,
        "sms_body": "Offer: https://example.com/x",
    })
    cid = camp.json()["id"]

    slug = "tst" + _uuid.uuid4().hex[:7]
    async with LiveSessionLocal() as db:
        db.add(TrackedLink(campaign_id=_uuid.UUID(cid), slug=slug, url="https://example.com/x"))
        await db.commit()

    r = await client.get(f"/r/{slug}", follow_redirects=False)
    assert r.status_code in (302, 307), r.text
    assert r.headers["location"] == "https://example.com/x"

    detail = await client.get(f"/api/v1/campaigns/{cid}", headers=owner_headers)
    assert detail.json()["stats"]["clicks"] == 1
