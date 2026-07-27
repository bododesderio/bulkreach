"""Pytest fixtures for the M8 integration suite.

Runs the real ASGI app in-process (httpx ASGITransport) against the throwaway
brtest Postgres (55432) + Redis (63799), same infra the manual tests use. Env
defaults are set BEFORE importing the app so pydantic settings pick them up.
The suite is resilient to pre-existing data (asserts >=, membership, shapes)."""
from __future__ import annotations

import os

# --- env must be set before app import (pydantic BaseSettings reads at import) ---
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://bulkreach:pw@localhost:55432/bulkreach")
os.environ.setdefault("ARCHIVE_DATABASE_URL", "postgresql+asyncpg://bulkreach:pw@localhost:55432/bulkreach_archive")
os.environ.setdefault("REDIS_URL", "redis://localhost:63799/0")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-m8-suite-0123456789abcdef")
os.environ.setdefault("DISPATCH_INLINE", "true")
os.environ.setdefault("DISPATCH_FORCE_SIMULATOR", "true")

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport  # noqa: E402

from app.core.redis import redis  # noqa: E402
from app.main import app  # noqa: E402

SUPERADMIN = {"email": "super@bulkreach.ug", "password": "SuperPass123!"}
OWNER = {"email": "verify+m7@bulkreach.ug", "password": "TestPass123!"}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _clear_login_rate_limit():
    """Clear login rate-limit keys so the suite (and repeated runs) can log in."""
    keys = await redis.keys("rl:login:*")
    if keys:
        await redis.delete(*keys)
    yield


@pytest_asyncio.fixture
async def client():
    async with _client() as c:
        yield c


async def _login(creds: dict) -> str:
    async with _client() as c:
        r = await c.post("/api/v1/auth/login", json=creds)
        assert r.status_code == 200, f"login failed for {creds['email']}: {r.text}"
        return r.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def super_token() -> str:
    return await _login(SUPERADMIN)


@pytest_asyncio.fixture(scope="session")
async def owner_token() -> str:
    return await _login(OWNER)


@pytest.fixture
def super_headers(super_token: str) -> dict:
    return {"Authorization": f"Bearer {super_token}"}


@pytest.fixture
def owner_headers(owner_token: str) -> dict:
    return {"Authorization": f"Bearer {owner_token}"}
