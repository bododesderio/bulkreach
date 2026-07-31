# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""M8 — session infrastructure: DB-backed refresh rotation with reuse (theft)
detection, the active-sessions API (list / revoke / revoke-others / logout), and
an RS256 sign→verify round-trip. Functional tests run on the HS256 fallback
(no keypair configured in brtest); RS256 is covered by a focused unit test."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")

PW = "supersecret1"


async def _register(client) -> tuple[str, str]:
    """Register a throwaway account. Returns (email, access_token). The client's
    cookie jar receives the refresh cookie (one session)."""
    email = f"sess_{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/api/v1/auth/register", json={
        "account_name": "Session Co", "email": email, "password": PW,
        "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert r.status_code == 201, r.text
    return email, r.json()["access_token"]


async def test_login_creates_listable_session(client):
    _email, token = await _register(client)
    h = {"Authorization": f"Bearer {token}"}
    r = await client.get("/api/v1/auth/sessions", headers=h)
    assert r.status_code == 200, r.text
    sessions = r.json()
    assert len(sessions) >= 1
    assert any(s["current"] for s in sessions)  # the registering cookie is "current"


async def test_refresh_rotates_and_detects_reuse(client, monkeypatch):
    # Pin the grace window to 0 so any replay of a rotated token is treated as
    # theft (the concurrent-double-submit leeway is exercised separately below).
    from app.core.config import settings
    monkeypatch.setattr(settings, "REFRESH_ROTATION_GRACE_SECONDS", 0)

    r = await client.post("/api/v1/auth/register", json={
        "account_name": "Rotate Co", "email": f"rot_{uuid.uuid4().hex[:10]}@example.com",
        "password": PW, "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert r.status_code == 201
    c0 = r.cookies.get("bulkreach_refresh")
    assert c0

    # Rotate: refresh issues a NEW cookie value.
    r1 = await client.post("/api/v1/auth/refresh")
    assert r1.status_code == 200, r1.text
    c1 = r1.cookies.get("bulkreach_refresh")
    assert c1 and c1 != c0

    # Replay the pre-rotation cookie → 401 AND the whole family is burned.
    client.cookies.delete("bulkreach_refresh")
    reuse = await client.post("/api/v1/auth/refresh", cookies={"bulkreach_refresh": c0})
    assert reuse.status_code == 401, reuse.text

    # The rotated-to token is now dead too (theft response revokes the family).
    dead = await client.post("/api/v1/auth/refresh", cookies={"bulkreach_refresh": c1})
    assert dead.status_code == 401, dead.text


async def test_concurrent_rotation_within_grace_is_benign(client, monkeypatch):
    """Two tabs sharing one cookie can rotate almost together; the loser presents
    the just-rotated token. Inside the grace window that must NOT burn the family —
    it re-issues, and the winner's fresh token stays alive."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "REFRESH_ROTATION_GRACE_SECONDS", 30)

    r = await client.post("/api/v1/auth/register", json={
        "account_name": "Grace Co", "email": f"grace_{uuid.uuid4().hex[:10]}@example.com",
        "password": PW, "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
    })
    assert r.status_code == 201
    c0 = r.cookies.get("bulkreach_refresh")

    r1 = await client.post("/api/v1/auth/refresh")  # winner rotates c0 → c1
    assert r1.status_code == 200
    c1 = r1.cookies.get("bulkreach_refresh")

    # Loser replays c0 within grace → benign reissue (200), family intact.
    client.cookies.delete("bulkreach_refresh")
    benign = await client.post("/api/v1/auth/refresh", cookies={"bulkreach_refresh": c0})
    assert benign.status_code == 200, benign.text

    # The winner's token c1 is still usable — the family was not burned.
    alive = await client.post("/api/v1/auth/refresh", cookies={"bulkreach_refresh": c1})
    assert alive.status_code == 200, alive.text


async def test_revoke_others_keeps_current(client):
    email, token = await _register(client)  # session A (current cookie)
    # A second login for the same user → session B.
    r2 = await client.post("/api/v1/auth/login", json={"email": email, "password": PW})
    assert r2.status_code == 200, r2.text
    token_b = r2.json()["access_token"]
    hb = {"Authorization": f"Bearer {token_b}"}

    before = (await client.get("/api/v1/auth/sessions", headers=hb)).json()
    assert len(before) >= 2

    revoked = await client.post("/api/v1/auth/sessions/revoke-others", headers=hb)
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["revoked"] >= 1

    after = (await client.get("/api/v1/auth/sessions", headers=hb)).json()
    assert len(after) == 1
    assert after[0]["current"] is True


async def test_revoke_single_session(client):
    email, token = await _register(client)
    h = {"Authorization": f"Bearer {token}"}
    # create a second session to revoke
    await client.post("/api/v1/auth/login", json={"email": email, "password": PW})
    sessions = (await client.get("/api/v1/auth/sessions", headers=h)).json()
    non_current = next((s for s in sessions if not s["current"]), None)
    assert non_current is not None
    rev = await client.post(f"/api/v1/auth/sessions/{non_current['id']}/revoke", headers=h)
    assert rev.status_code == 200 and rev.json()["ok"] is True
    # revoking a bogus id → 404
    bogus = await client.post(f"/api/v1/auth/sessions/{uuid.uuid4()}/revoke", headers=h)
    assert bogus.status_code == 404


async def test_logout_revokes_session(client):
    _email, token = await _register(client)
    h = {"Authorization": f"Bearer {token}"}
    assert len((await client.get("/api/v1/auth/sessions", headers=h)).json()) >= 1
    out = await client.post("/api/v1/auth/logout")
    assert out.status_code == 200
    # the access token still works for 15m, but the session is gone from the live list
    remaining = (await client.get("/api/v1/auth/sessions", headers=h)).json()
    assert all(not s["current"] for s in remaining)


def test_rs256_sign_verify_roundtrip(monkeypatch):
    """RS256 path: with a keypair configured, tokens sign with the private key and
    verify with the public key, and the JWT header advertises alg=RS256."""
    import jwt
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    from app.core import security
    from app.core.config import settings

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode()
    pub = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()

    monkeypatch.setattr(settings, "JWT_PRIVATE_KEY", priv)
    monkeypatch.setattr(settings, "JWT_PUBLIC_KEY", pub)
    assert settings.use_rs256 is True

    sub = str(uuid.uuid4())
    tok = security.create_access_token(sub)
    assert jwt.get_unverified_header(tok)["alg"] == "RS256"
    payload = security.decode_token(tok)
    assert payload is not None and payload["sub"] == sub and payload["type"] == "access"
