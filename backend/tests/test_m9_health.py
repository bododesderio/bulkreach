# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Phase 5 — liveness and readiness probes."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_health_liveness(client):
    r = await client.get("/health")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"


async def test_health_readiness_pings_datastores(client):
    r = await client.get("/health/ready")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ready"
    # Core datastores must be probed and healthy against the throwaway stack.
    assert body["checks"]["postgres"] == "ok"
    assert body["checks"]["redis"] == "ok"
