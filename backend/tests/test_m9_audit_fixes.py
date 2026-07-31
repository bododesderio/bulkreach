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
