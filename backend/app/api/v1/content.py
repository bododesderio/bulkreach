"""Public content API — powers the marketing site. No auth; published rows only.

These endpoints are read by the public (marketing) pages as server components, so
they must stay unauthenticated and cheap. Drafts (is_published=False) are never
exposed here — only through the admin content API.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.cms import CmsFaq, CmsFeature, CmsPageSection, CmsTestimonial
from app.schemas.cms import FaqOut, FeatureOut, TestimonialOut

router = APIRouter(prefix="/content", tags=["content"])


@router.get("/faqs", response_model=list[FaqOut])
async def public_faqs(db: Annotated[AsyncSession, Depends(get_db)]) -> list[FaqOut]:
    rows = (await db.execute(
        select(CmsFaq).where(CmsFaq.is_published.is_(True))
        .order_by(CmsFaq.sort_order.asc(), CmsFaq.created_at.asc())
    )).scalars().all()
    return [FaqOut.model_validate(r) for r in rows]


@router.get("/features", response_model=list[FeatureOut])
async def public_features(db: Annotated[AsyncSession, Depends(get_db)]) -> list[FeatureOut]:
    rows = (await db.execute(
        select(CmsFeature).where(CmsFeature.is_published.is_(True))
        .order_by(CmsFeature.sort_order.asc(), CmsFeature.created_at.asc())
    )).scalars().all()
    return [FeatureOut.model_validate(r) for r in rows]


@router.get("/testimonials", response_model=list[TestimonialOut])
async def public_testimonials(db: Annotated[AsyncSession, Depends(get_db)]) -> list[TestimonialOut]:
    rows = (await db.execute(
        select(CmsTestimonial).where(CmsTestimonial.is_published.is_(True))
        .order_by(CmsTestimonial.sort_order.asc(), CmsTestimonial.created_at.asc())
    )).scalars().all()
    return [TestimonialOut.model_validate(r) for r in rows]


@router.get("/sections")
async def public_sections(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[str, Query(min_length=1, max_length=60)],
) -> dict[str, str]:
    """Published section copy for one page as a flat {key: value} map — the shape the
    marketing pages consume directly (e.g. sections['hero_title'])."""
    rows = (await db.execute(
        select(CmsPageSection).where(
            CmsPageSection.page == page, CmsPageSection.is_published.is_(True)
        ).order_by(CmsPageSection.sort_order.asc())
    )).scalars().all()
    return {r.key: r.value for r in rows}
