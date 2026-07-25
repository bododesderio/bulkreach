"""End-to-end auth flow test (M1) against the ASGI app + real Postgres/Redis."""
from __future__ import annotations

import asyncio

import httpx
from httpx import ASGITransport

from app.main import app


async def run() -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        # health
        r = await c.get("/health")
        assert r.status_code == 200, r.text

        email = f"grace_{asyncio.get_event_loop().time():.0f}@example.com"

        # register without consent -> 422
        r = await c.post("/api/v1/auth/register", json={
            "account_name": "Grace Co", "email": email, "password": "supersecret1",
            "accept_terms": True, "accept_privacy": True, "accept_data_retention": False,
        })
        assert r.status_code == 422, f"expected consent rejection, got {r.status_code}"

        # register with consent -> 201 + token + refresh cookie
        r = await c.post("/api/v1/auth/register", json={
            "account_name": "Grace Co", "email": email, "password": "supersecret1",
            "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
        })
        assert r.status_code == 201, r.text
        token = r.json()["access_token"]
        assert "bulkreach_refresh" in r.cookies

        # duplicate register -> 409
        r2 = await c.post("/api/v1/auth/register", json={
            "account_name": "Dup", "email": email, "password": "supersecret1",
            "accept_terms": True, "accept_privacy": True, "accept_data_retention": True,
        })
        assert r2.status_code == 409, r2.text

        # /me with bearer
        r = await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user"]["email"] == email
        assert body["user"]["role"] == "owner"
        assert body["account"]["plan"] == "trial"
        assert body["account"]["trial_messages_remaining"] == 500

        # /me without token -> 401
        r = await c.get("/api/v1/auth/me")
        assert r.status_code == 401

        # login wrong password -> 401
        r = await c.post("/api/v1/auth/login", json={"email": email, "password": "wrong"})
        assert r.status_code == 401

        # login correct -> 200
        r = await c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret1"})
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]

        # forgot-password always 202
        r = await c.post("/api/v1/auth/forgot-password", json={"email": email})
        assert r.status_code == 202

        print("OK — full auth flow passed (register/consent/dup/me/authz/login/forgot)")


if __name__ == "__main__":
    asyncio.run(run())
