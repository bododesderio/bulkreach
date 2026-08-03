# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Public click-tracking redirect: GET /r/{slug} → count the click → 302 to the
original URL. Mounted at the app root (not under /api/v1) so tracking links stay
short enough for SMS."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.campaign import TrackedLink

router = APIRouter(tags=["redirect"])


@router.get("/r/{slug}", include_in_schema=False)
async def redirect_link(
    slug: str, db: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    url = await db.scalar(select(TrackedLink.url).where(TrackedLink.slug == slug))
    if url is None:
        # Unknown/expired link — send the visitor to the site rather than 404.
        return RedirectResponse(settings.FRONTEND_URL, status_code=302)
    await db.execute(
        update(TrackedLink).where(TrackedLink.slug == slug)
        .values(click_count=TrackedLink.click_count + 1)
    )
    await db.commit()
    return RedirectResponse(url, status_code=302)
