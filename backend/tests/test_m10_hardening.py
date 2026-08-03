# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""M10 — security hardening regressions:
- webhook callback-secret gate (fail-closed in prod; simulator prod-gated)
- Mailgun DLR signature fails closed in prod when the key is unset
- impersonating a superadmin-owned account is refused (would mint an admin token)
"""
from __future__ import annotations

import pytest

from app.core.config import settings
from app.services import dlr_providers

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ── webhook callback-secret gate (pure function) ─────────────────────────────
def test_callback_secret_simulator_dev_ok(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    assert dlr_providers.verify_callback_secret("simulator", None) is True


def test_callback_secret_simulator_blocked_in_prod(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert dlr_providers.verify_callback_secret("simulator", None) is False


def test_callback_secret_unconfigured_fails_closed_in_prod(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "WEBHOOK_CALLBACK_SECRET", "")
    # No secret configured in prod → unsigned provider is rejected, not waved through.
    assert dlr_providers.verify_callback_secret("africastalking", None) is False


def test_callback_secret_configured_requires_match(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "WEBHOOK_CALLBACK_SECRET", "s3cr3t")
    assert dlr_providers.verify_callback_secret("africastalking", "s3cr3t") is True
    assert dlr_providers.verify_callback_secret("africastalking", "wrong") is False
    assert dlr_providers.verify_callback_secret("africastalking", None) is False


def test_mailgun_dlr_fails_closed_in_prod_without_key(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "MAILGUN_API_KEY", "")
    verified, _ = dlr_providers.parse("mailgun", b"{}", {"event-data": {}}, None)
    assert verified is False


# ── impersonation: superadmin account is off-limits ──────────────────────────
async def test_cannot_impersonate_superadmin_account(client, super_headers):
    me = await client.get("/api/v1/auth/me", headers=super_headers)
    super_account_id = me.json()["account"]["id"]

    r = await client.post(
        f"/api/v1/admin/accounts/{super_account_id}/impersonate",
        headers=super_headers,
    )
    assert r.status_code == 403, r.text
