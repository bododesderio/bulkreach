# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Link/click tracking — rewrite URLs in a campaign body to short redirects that
count clicks. One TrackedLink row per distinct URL, shared across recipients."""
from __future__ import annotations

import re
import secrets
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.campaign import TrackedLink

# http/https URLs; trailing sentence punctuation is trimmed on lookup (below).
_URL_RE = re.compile(r"https?://[^\s<>\"'()]+")
_TRAILING = ".,;:!?"


def extract_urls(text: str | None) -> set[str]:
    if not text:
        return set()
    return {m.group(0).rstrip(_TRAILING) for m in _URL_RE.finditer(text)}


def _new_slug() -> str:
    return secrets.token_urlsafe(8)[:10]


async def ensure_links(
    db: AsyncSession, campaign_id: UUID, texts: list[str | None]
) -> dict[str, str]:
    """Create TrackedLinks for every distinct URL across `texts` (idempotent per
    campaign) and return {original_url: tracking_url}."""
    urls: set[str] = set()
    for t in texts:
        urls |= extract_urls(t)
    existing = {
        link.url: link.slug
        for link in (
            await db.execute(select(TrackedLink).where(TrackedLink.campaign_id == campaign_id))
        ).scalars()
    }
    for u in urls:
        if u not in existing:
            slug = _new_slug()
            db.add(TrackedLink(campaign_id=campaign_id, slug=slug, url=u))
            existing[u] = slug
    if urls:
        await db.flush()
    base = settings.BASE_URL.rstrip("/")
    return {u: f"{base}/r/{existing[u]}" for u in urls}


def rewrite(text: str | None, url_map: dict[str, str]) -> str | None:
    """Replace each tracked URL in `text` with its tracking URL, preserving any
    trailing sentence punctuation."""
    if not text or not url_map:
        return text

    def _sub(m: re.Match) -> str:
        raw = m.group(0)
        stripped = raw.rstrip(_TRAILING)
        tail = raw[len(stripped):]
        return url_map[stripped] + tail if stripped in url_map else raw

    return _URL_RE.sub(_sub, text)
