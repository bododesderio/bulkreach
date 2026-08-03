# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Message templates — reusable saved composer messages, scoped to the account."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.campaign import MessageTemplate

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: Literal["sms", "email", "both"] = "sms"
    sms_body: str | None = None
    email_subject: str | None = None
    email_html_body: str | None = None


class TemplateOut(BaseModel):
    id: UUID
    name: str
    type: str
    sms_body: str | None = None
    email_subject: str | None = None
    email_html_body: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MessageTemplate]:
    rows = (await db.execute(
        select(MessageTemplate)
        .where(MessageTemplate.account_id == user.account_id)
        .order_by(MessageTemplate.created_at.desc())
    )).scalars().all()
    return list(rows)


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageTemplate:
    tpl = MessageTemplate(
        account_id=user.account_id,
        name=body.name.strip(),
        type=body.type,
        sms_body=body.sms_body or None,
        email_subject=body.email_subject or None,
        email_html_body=body.email_html_body or None,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return tpl


@router.delete("/{template_id}")
async def delete_template(
    template_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    tpl = await db.get(MessageTemplate, template_id)
    if tpl is None or tpl.account_id != user.account_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    await db.delete(tpl)
    await db.commit()
    return {"deleted": True}
