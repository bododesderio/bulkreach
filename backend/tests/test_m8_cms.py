"""M8 — CMS: public content API (published only) + superadmin CRUD + auth gating."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ── Public API ──
async def test_public_lists_seeded_content(client):
    faqs = (await client.get("/api/v1/content/faqs")).json()
    features = (await client.get("/api/v1/content/features")).json()
    tms = (await client.get("/api/v1/content/testimonials")).json()
    assert len(faqs) >= 10 and len(features) >= 6 and len(tms) >= 3
    # Ordered by sort_order.
    assert [f["sort_order"] for f in faqs] == sorted(f["sort_order"] for f in faqs)


async def test_public_sections_returns_key_value_map(client):
    sections = (await client.get("/api/v1/content/sections", params={"page": "faq"})).json()
    assert sections["hero_title"] == "Frequently asked questions."


async def test_public_endpoints_need_no_auth(client):
    assert (await client.get("/api/v1/content/faqs")).status_code == 200


# ── Admin CRUD ──
async def test_admin_crud_faq_and_public_visibility(client, super_headers):
    # Create as draft → not visible publicly.
    created = await client.post("/api/v1/admin/content/faqs", headers=super_headers, json={
        "question": f"Q {uuid.uuid4().hex[:6]}?", "answer": "A draft answer.",
        "is_published": False, "sort_order": 999,
    })
    assert created.status_code == 201, created.text
    fid = created.json()["id"]

    pub = (await client.get("/api/v1/content/faqs")).json()
    assert fid not in [f["id"] for f in pub]

    # Publish → becomes visible.
    upd = await client.patch(f"/api/v1/admin/content/faqs/{fid}", headers=super_headers,
                             json={"is_published": True})
    assert upd.status_code == 200
    pub2 = (await client.get("/api/v1/content/faqs")).json()
    assert fid in [f["id"] for f in pub2]

    # Delete → gone.
    d = await client.delete(f"/api/v1/admin/content/faqs/{fid}", headers=super_headers)
    assert d.status_code == 200
    pub3 = (await client.get("/api/v1/content/faqs")).json()
    assert fid not in [f["id"] for f in pub3]


async def test_admin_section_upsert_conflict(client, super_headers):
    page = f"tmp_{uuid.uuid4().hex[:6]}"
    body = {"page": page, "key": "hero_title", "value": "Hello"}
    first = await client.post("/api/v1/admin/content/sections", headers=super_headers, json=body)
    assert first.status_code == 201
    dup = await client.post("/api/v1/admin/content/sections", headers=super_headers, json=body)
    assert dup.status_code == 409


async def test_admin_content_requires_superadmin(client, owner_headers):
    # A normal account owner is not a superadmin.
    r = await client.get("/api/v1/admin/content/faqs", headers=owner_headers)
    assert r.status_code in (401, 403)
    r2 = await client.post("/api/v1/admin/content/features", headers=owner_headers, json={
        "icon": "Zap", "title": "x", "description": "y",
    })
    assert r2.status_code in (401, 403)
