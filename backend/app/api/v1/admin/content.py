"""Admin CMS manager (superadmin): CRUD over the marketing-site content.

Edits flow straight to the public marketing pages, which read published rows from
the public /content API. Covers FAQs, features, testimonials, and per-page section
copy. Every mutation is audit-logged.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.cms import CmsFaq, CmsFeature, CmsPageSection, CmsTestimonial
from app.models.account import User
from app.schemas.cms import (
    FaqCreate, FaqOut, FaqUpdate,
    FeatureCreate, FeatureOut, FeatureUpdate,
    PageSectionCreate, PageSectionOut, PageSectionUpdate,
    TestimonialCreate, TestimonialOut, TestimonialUpdate,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/admin/content", tags=["admin:content"])


async def _audit(db: AsyncSession, admin: User, action: str, obj) -> None:
    await record_audit(
        db, actor_id=admin.id, actor_email=admin.email, action=action,
        resource_type="cms", resource_id=str(obj.id),
    )


async def _apply_update(db: AsyncSession, obj, body, admin: User, action: str):
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    await _audit(db, admin, action, obj)
    await db.commit()
    return obj


async def _delete(db: AsyncSession, model, obj_id: UUID, admin: User, action: str) -> dict:
    obj = await db.get(model, obj_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content not found")
    await _audit(db, admin, action, obj)
    await db.delete(obj)
    await db.commit()
    return {"status": "deleted"}


# ─────────────────────────── FAQs ───────────────────────────
@router.get("/faqs", response_model=list[FaqOut])
async def list_faqs(admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    rows = (await db.execute(
        select(CmsFaq).order_by(CmsFaq.sort_order.asc(), CmsFaq.created_at.asc())
    )).scalars().all()
    return [FaqOut.model_validate(r) for r in rows]


@router.post("/faqs", response_model=FaqOut, status_code=status.HTTP_201_CREATED)
async def create_faq(body: FaqCreate, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    obj = CmsFaq(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    await _audit(db, admin, "cms.faq.create", obj)
    await db.commit()
    return FaqOut.model_validate(obj)


@router.patch("/faqs/{obj_id}", response_model=FaqOut)
async def update_faq(obj_id: UUID, body: FaqUpdate, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    obj = await db.get(CmsFaq, obj_id)
    return FaqOut.model_validate(await _apply_update(db, obj, body, admin, "cms.faq.update"))


@router.delete("/faqs/{obj_id}")
async def delete_faq(obj_id: UUID, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _delete(db, CmsFaq, obj_id, admin, "cms.faq.delete")


# ───────────────────────── Features ─────────────────────────
@router.get("/features", response_model=list[FeatureOut])
async def list_features(admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    rows = (await db.execute(
        select(CmsFeature).order_by(CmsFeature.sort_order.asc(), CmsFeature.created_at.asc())
    )).scalars().all()
    return [FeatureOut.model_validate(r) for r in rows]


@router.post("/features", response_model=FeatureOut, status_code=status.HTTP_201_CREATED)
async def create_feature(body: FeatureCreate, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    obj = CmsFeature(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    await _audit(db, admin, "cms.feature.create", obj)
    await db.commit()
    return FeatureOut.model_validate(obj)


@router.patch("/features/{obj_id}", response_model=FeatureOut)
async def update_feature(obj_id: UUID, body: FeatureUpdate, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    obj = await db.get(CmsFeature, obj_id)
    return FeatureOut.model_validate(await _apply_update(db, obj, body, admin, "cms.feature.update"))


@router.delete("/features/{obj_id}")
async def delete_feature(obj_id: UUID, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _delete(db, CmsFeature, obj_id, admin, "cms.feature.delete")


# ─────────────────────── Testimonials ───────────────────────
@router.get("/testimonials", response_model=list[TestimonialOut])
async def list_testimonials(admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    rows = (await db.execute(
        select(CmsTestimonial).order_by(CmsTestimonial.sort_order.asc(), CmsTestimonial.created_at.asc())
    )).scalars().all()
    return [TestimonialOut.model_validate(r) for r in rows]


@router.post("/testimonials", response_model=TestimonialOut, status_code=status.HTTP_201_CREATED)
async def create_testimonial(body: TestimonialCreate, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    obj = CmsTestimonial(**body.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    await _audit(db, admin, "cms.testimonial.create", obj)
    await db.commit()
    return TestimonialOut.model_validate(obj)


@router.patch("/testimonials/{obj_id}", response_model=TestimonialOut)
async def update_testimonial(obj_id: UUID, body: TestimonialUpdate, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    obj = await db.get(CmsTestimonial, obj_id)
    return TestimonialOut.model_validate(await _apply_update(db, obj, body, admin, "cms.testimonial.update"))


@router.delete("/testimonials/{obj_id}")
async def delete_testimonial(obj_id: UUID, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _delete(db, CmsTestimonial, obj_id, admin, "cms.testimonial.delete")


# ─────────────────────── Page sections ──────────────────────
@router.get("/sections", response_model=list[PageSectionOut])
async def list_sections(admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    rows = (await db.execute(
        select(CmsPageSection).order_by(
            CmsPageSection.page.asc(), CmsPageSection.sort_order.asc(), CmsPageSection.key.asc()
        )
    )).scalars().all()
    return [PageSectionOut.model_validate(r) for r in rows]


@router.post("/sections", response_model=PageSectionOut, status_code=status.HTTP_201_CREATED)
async def create_section(body: PageSectionCreate, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    obj = CmsPageSection(**body.model_dump())
    db.add(obj)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That page/key already exists") from exc
    await db.refresh(obj)
    await _audit(db, admin, "cms.section.create", obj)
    await db.commit()
    return PageSectionOut.model_validate(obj)


@router.patch("/sections/{obj_id}", response_model=PageSectionOut)
async def update_section(obj_id: UUID, body: PageSectionUpdate, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    obj = await db.get(CmsPageSection, obj_id)
    return PageSectionOut.model_validate(await _apply_update(db, obj, body, admin, "cms.section.update"))


@router.delete("/sections/{obj_id}")
async def delete_section(obj_id: UUID, admin: SuperadminUser, db: Annotated[AsyncSession, Depends(get_db)]):
    return await _delete(db, CmsPageSection, obj_id, admin, "cms.section.delete")
