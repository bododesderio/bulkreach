# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""A hardened WeasyPrint `url_fetcher` that blocks SSRF / local-file reads.

WeasyPrint's default fetcher resolves `http(s)://` AND `file://` server-side when
rendering a PDF. Because a tenant supplies `account.logo_url`, an unhardened
fetcher lets them point the renderer at `file:///etc/passwd`, cloud-metadata
(`169.254.169.254`), or internal hosts. This fetcher allows only http(s) to
publicly-routable addresses.

Note: there is a small resolve-then-fetch (DNS-rebind) window; for full closure
the resolved IP would need to be pinned into the request. Acceptable for the
current threat model (authenticated tenant, no attacker-controlled DNS TTL race
guarantee) and a large improvement over the default fetcher.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


def _is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    return True


def safe_url_fetcher(url: str, timeout: int = 10):
    """WeasyPrint `url_fetcher` restricted to http(s) + public IPs."""
    from weasyprint import default_url_fetcher  # lazy — native deps

    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()
    if scheme in ("data",):  # inline data: URIs are safe (no network/file)
        return default_url_fetcher(url, timeout=timeout)
    if scheme not in ("http", "https"):
        raise ValueError(f"Blocked URL scheme for PDF asset: {scheme or '(none)'}")
    host = parsed.hostname
    if not host or not _is_public(host):
        raise ValueError("Blocked non-public URL for PDF asset")
    return default_url_fetcher(url, timeout=timeout)
