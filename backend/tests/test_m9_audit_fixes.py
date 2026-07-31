# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""M9 — audit-hardening fixes (SSRF-safe PDF fetcher)."""
from __future__ import annotations

import pytest

from app.core.pdf_safety import safe_url_fetcher


def test_pdf_fetcher_blocks_file_scheme():
    with pytest.raises(ValueError):
        safe_url_fetcher("file:///etc/passwd")


def test_pdf_fetcher_blocks_non_http_scheme():
    with pytest.raises(ValueError):
        safe_url_fetcher("ftp://example.com/x")


def test_pdf_fetcher_blocks_loopback_host():
    with pytest.raises(ValueError):
        safe_url_fetcher("http://localhost/logo.png")


def test_pdf_fetcher_blocks_cloud_metadata_ip():
    with pytest.raises(ValueError):
        safe_url_fetcher("http://169.254.169.254/latest/meta-data/")


def test_pdf_fetcher_blocks_private_ip():
    with pytest.raises(ValueError):
        safe_url_fetcher("http://10.0.0.5/logo.png")


@pytest.mark.asyncio(loop_scope="session")
async def test_quota_reserve_accumulates_and_releases():
    """Reserve is an atomic INCRBY: concurrent reservations accumulate, so the
    post-reserve limit check sees the true total (closes the overspend TOCTOU).
    Release rolls a reservation back to zero."""
    from uuid import uuid4

    from app.services.subscription import quota

    acct = uuid4()
    m1, d1 = await quota.reserve(acct, 5)
    assert m1 == 5 and d1 == 5
    m2, d2 = await quota.reserve(acct, 3)          # a second concurrent-style reserve
    assert m2 == 8 and d2 == 8                     # accumulated, not stale-read
    await quota.release(acct, 8)
    assert await quota.get_monthly_used(acct) == 0
    assert await quota.get_daily_used(acct) == 0


def test_reset_token_single_use_fingerprint():
    """A reset token is bound to the password hash it was minted against; once the
    password changes the fingerprint no longer matches, so the link can't be replayed."""
    from app.core.security import (
        create_reset_token, decode_token, hash_password, reset_fingerprint,
    )

    h1 = hash_password("originalpass1")
    payload = decode_token(create_reset_token("user-123", h1))
    assert payload and payload["type"] == "reset"
    assert payload["pwf"] == reset_fingerprint(h1)          # valid against current hash
    h2 = hash_password("changedpass2")
    assert payload["pwf"] != reset_fingerprint(h2)          # stale after a password change
