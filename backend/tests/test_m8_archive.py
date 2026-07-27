"""M8 — data archive: ingest, contacts, anonymise, legal holds, erasure,
retention dry-run, export, append-only access log."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_ingest_and_overview(client, super_headers):
    ing = await client.post("/api/v1/admin/archive/ingest", headers=super_headers)
    assert ing.status_code == 200
    for k in ("campaigns_ingested", "payments_ingested", "contacts_upserted"):
        assert k in ing.json()

    ov = await client.get("/api/v1/admin/archive/overview", headers=super_headers)
    assert ov.status_code == 200
    body = ov.json()
    assert body["live_retention_months"] >= 1
    assert body["archived_campaigns"] >= 0
    # ClickHouse analytics count is present (int when CH is up, null when infra-gated)
    assert "clickhouse_events" in body
    assert body["clickhouse_events"] is None or body["clickhouse_events"] >= 0


async def test_retention_dry_run_is_nondestructive(client, super_headers):
    r = await client.post("/api/v1/admin/archive/retention/run?dry_run=true", headers=super_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["dry_run"] is True
    assert body["campaigns_purged"] == 0 and body["contacts_anonymised"] == 0


async def test_contact_search_and_anonymise(client, super_headers):
    # ensure some contacts exist
    await client.post("/api/v1/admin/archive/ingest", headers=super_headers)
    contacts = (await client.get("/api/v1/admin/archive/contacts?limit=100",
                                 headers=super_headers)).json()
    target = next((c for c in contacts if c["anonymised_at"] is None and not c["legal_hold"]), None)
    if target is None:
        return  # nothing anonymisable in this dev DB; skip gracefully
    r = await client.post(f"/api/v1/admin/archive/contacts/{target['id']}/anonymise",
                          headers=super_headers)
    assert r.status_code == 200
    assert r.json()["anonymised_at"] is not None
    # phone (if any) must now be a 64-char sha256 hex, not the original
    if r.json()["phone"]:
        assert len(r.json()["phone"]) == 64 and r.json()["phone"] != target["phone"]


async def test_legal_hold_place_and_lift(client, super_headers):
    rid = str(uuid.uuid4())
    place = await client.post("/api/v1/admin/archive/legal-holds", headers=super_headers, json={
        "resource_type": "campaign", "resource_id": rid, "reason": "M8 litigation hold",
    })
    assert place.status_code == 201, place.text
    hid = place.json()["id"]
    assert place.json()["is_active"] is True

    lift = await client.post(f"/api/v1/admin/archive/legal-holds/{hid}/lift",
                             headers=super_headers, json={"reason": "M8 resolved"})
    assert lift.status_code == 200 and lift.json()["is_active"] is False


async def test_erasure_create_and_execute(client, super_headers):
    email = f"m8erase_{uuid.uuid4().hex[:8]}@example.com"
    create = await client.post("/api/v1/admin/archive/erasures", headers=super_headers,
                               json={"contact_email": email, "requested_by": "dpo@bulkreach.ug"})
    assert create.status_code == 201, create.text
    assert create.json()["status"] == "pending"
    rid = create.json()["id"]

    ex = await client.post(f"/api/v1/admin/archive/erasures/{rid}/execute", headers=super_headers)
    assert ex.status_code == 200 and ex.json()["status"] == "completed"


async def test_erasure_requires_identifier(client, super_headers):
    r = await client.post("/api/v1/admin/archive/erasures", headers=super_headers, json={})
    assert r.status_code == 400


async def test_export_and_access_log(client, super_headers):
    exp = await client.post("/api/v1/admin/archive/exports", headers=super_headers,
                            json={"domain": "campaigns"})
    assert exp.status_code == 201, exp.text
    assert exp.json()["format"] == "export" and exp.json()["size_bytes"] >= 0

    # every read/action above is written to the append-only access log
    log = await client.get("/api/v1/admin/archive/access-log?limit=50", headers=super_headers)
    assert log.status_code == 200
    actions = {e["action"] for e in log.json()}
    assert {"ingest", "export"} <= actions
