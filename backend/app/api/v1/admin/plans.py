"""Admin plan manager (superadmin): CRUD over the plans that drive checkout.

Edits here flow straight through to the public pricing page and the client
billing/checkout (which read active plans by display_order). Only one plan may be
`featured` at a time. A plan with active subscribers can't be deleted — hide it.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import SuperadminUser
from app.models.billing import Plan, Subscription
from app.schemas.payment import AdminPlanOut, PlanCreate, PlanUpdate
from app.services.audit import record_audit

router = APIRouter(prefix="/admin/plans", tags=["admin:plans"])


async def _subscriber_counts(db: AsyncSession) -> dict[UUID, int]:
    rows = (await db.execute(
        select(Subscription.plan_id, func.count())
        .where(Subscription.status == "active")
        .group_by(Subscription.plan_id)
    )).all()
    return {pid: c for pid, c in rows}


def _out(plan: Plan, subs: int) -> AdminPlanOut:
    return AdminPlanOut(
        id=plan.id, name=plan.name, price_ugx=plan.price_ugx,
        messages_per_month=plan.messages_per_month, batch_size=plan.batch_size,
        features=plan.features or {}, period=plan.period, status=plan.status,
        featured=plan.featured, display_order=plan.display_order, subscriber_count=subs,
    )


async def _unfeature_others(db: AsyncSession, keep_id: UUID | None) -> None:
    res = await db.execute(select(Plan).where(Plan.featured.is_(True)))
    for other in res.scalars():
        if other.id != keep_id:
            other.featured = False


@router.get("", response_model=list[AdminPlanOut])
async def list_plans(
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AdminPlanOut]:
    counts = await _subscriber_counts(db)
    plans = (await db.execute(
        select(Plan).order_by(Plan.display_order.asc(), Plan.price_ugx.asc())
    )).scalars().all()
    return [_out(p, counts.get(p.id, 0)) for p in plans]


@router.post("", response_model=AdminPlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    body: PlanCreate,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminPlanOut:
    plan = Plan(
        name=body.name, price_ugx=body.price_ugx, messages_per_month=body.messages_per_month,
        batch_size=body.batch_size, period=body.period, status=body.status,
        featured=body.featured, display_order=body.display_order, features=body.features,
    )
    db.add(plan)
    if body.featured:
        await db.flush()
        await _unfeature_others(db, plan.id)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A plan with that name already exists") from exc
    await db.refresh(plan)
    await record_audit(db, actor_id=admin.id, actor_email=admin.email, action="plan.create",
                       resource_type="plan", resource_id=str(plan.id), details={"name": plan.name})
    await db.commit()
    return _out(plan, 0)


@router.patch("/{plan_id}", response_model=AdminPlanOut)
async def update_plan(
    plan_id: UUID,
    body: PlanUpdate,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminPlanOut:
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(plan, field, value)
    if data.get("featured") is True:
        await _unfeature_others(db, plan.id)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A plan with that name already exists") from exc
    await db.refresh(plan)
    counts = await _subscriber_counts(db)
    await record_audit(db, actor_id=admin.id, actor_email=admin.email, action="plan.update",
                       resource_type="plan", resource_id=str(plan.id), details=data)
    await db.commit()
    return _out(plan, counts.get(plan.id, 0))


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: UUID,
    admin: SuperadminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    plan = await db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    counts = await _subscriber_counts(db)
    if counts.get(plan.id, 0) > 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Plan has active subscribers — hide it instead of deleting",
        )
    await record_audit(db, actor_id=admin.id, actor_email=admin.email, action="plan.delete",
                       resource_type="plan", resource_id=str(plan.id), details={"name": plan.name})
    await db.delete(plan)
    await db.commit()
    return {"status": "deleted"}
