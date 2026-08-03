# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Contacts endpoints (Section 5.3): upload, paste, map-columns, list, rows, delete."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import cast, func, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.core.redis import sliding_window_allow
from app.models.contact import Contact, ContactList
from app.schemas.contact import (
    ContactListOut,
    ContactRow,
    ImportResult,
    MapColumnsRequest,
    PaginatedContacts,
    PasteRequest,
)
from app.services import contact_service
from app.services.audit import record_audit
from app.services.parsers import contact_parser

router = APIRouter(prefix="/contacts", tags=["contacts"])

_ALLOWED_FORMATS = {"csv", "xlsx", "xls", "docx", "pdf"}


def _preview(result) -> list[dict]:
    return [
        {"phone": c["phone"], "email": c["email"], **c["raw_data"]}
        for c in result.contacts[:5]
    ]


async def _get_owned_list(db: AsyncSession, list_id: UUID, account_id: UUID) -> ContactList:
    cl = await db.get(ContactList, list_id)
    if not cl or cl.account_id != account_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact list not found.")
    return cl


@router.post("/upload", response_model=ImportResult, status_code=status.HTTP_201_CREATED)
async def upload_contacts(
    user: CurrentUser,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File()],
    name: Annotated[str | None, Form()] = None,
) -> ImportResult:
    # Rate limit: 10 uploads/hour/account (Section 13.4)
    allowed = await sliding_window_allow(
        f"rl:upload:{user.account_id}", settings.RATE_LIMIT_UPLOAD_MAX_PER_HOUR, 3600
    )
    if not allowed:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Upload limit reached. Try again later.")

    filename = file.filename or "upload"
    fmt = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if fmt not in _ALLOWED_FORMATS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported file type '.{fmt}'.")

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds 50MB limit.")

    try:
        result = contact_parser.parse_upload(content, fmt)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Could not parse file: {exc}")

    cl = await contact_service.persist_import(
        db, account_id=user.account_id, name=name or filename, result=result,
        source_format=fmt, source_filename=filename, raw_file=content,
    )
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="contacts.upload",
        resource_type="contact_list", resource_id=str(cl.id),
        details={"format": fmt, "valid": result.valid_contacts},
    )
    return ImportResult(
        list=ContactListOut.model_validate(cl),
        error_count=result.error_count, errors=result.errors[:50], preview=_preview(result),
    )


@router.post("/paste", response_model=ImportResult, status_code=status.HTTP_201_CREATED)
async def paste_contacts(
    data: PasteRequest, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> ImportResult:
    result = contact_parser.parse_pasted(data.text)
    cl = await contact_service.persist_import(
        db, account_id=user.account_id, name=data.name, result=result, source_format="paste",
    )
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="contacts.paste",
        resource_type="contact_list", resource_id=str(cl.id),
        details={"valid": result.valid_contacts},
    )
    return ImportResult(
        list=ContactListOut.model_validate(cl),
        error_count=result.error_count, errors=result.errors[:50], preview=_preview(result),
    )


@router.post("/lists/{list_id}/map-columns", response_model=ContactListOut)
async def map_columns(
    list_id: UUID, data: MapColumnsRequest, user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContactListOut:
    cl = await _get_owned_list(db, list_id, user.account_id)
    for col in (data.phone_column, data.email_column):
        if col and col not in cl.columns:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown column '{col}'.")
    cl = await contact_service.remap_columns(
        db, cl, phone_column=data.phone_column, email_column=data.email_column
    )
    return ContactListOut.model_validate(cl)


@router.get("/lists", response_model=list[ContactListOut])
async def list_lists(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> list[ContactListOut]:
    rows = (
        await db.execute(
            select(ContactList)
            .where(ContactList.account_id == user.account_id)
            .order_by(ContactList.created_at.desc())
        )
    ).scalars().all()
    return [ContactListOut.model_validate(r) for r in rows]


@router.get("/lists/{list_id}", response_model=ContactListOut)
async def get_list(
    list_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> ContactListOut:
    cl = await _get_owned_list(db, list_id, user.account_id)
    return ContactListOut.model_validate(cl)


@router.get("/lists/{list_id}/rows", response_model=PaginatedContacts)
async def get_rows(
    list_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1, page_size: int = 50,
) -> PaginatedContacts:
    await _get_owned_list(db, list_id, user.account_id)
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    total = await contact_service.count_contacts(db, list_id)
    rows = (
        await db.execute(
            select(Contact).where(Contact.list_id == list_id)
            .order_by(Contact.created_at).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
    return PaginatedContacts(
        items=[ContactRow.model_validate(r) for r in rows],
        total=total, page=page, page_size=page_size,
    )


@router.get("/lists/{list_id}/tags")
async def list_tags(
    list_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, int]:
    """Distinct tags used in this list, each with its contact count (for the picker)."""
    await _get_owned_list(db, list_id, user.account_id)
    rows = (await db.execute(
        select(func.jsonb_array_elements_text(Contact.tags).label("tag"), func.count())
        .where(Contact.list_id == list_id)
        .group_by(func.jsonb_array_elements_text(Contact.tags))
    )).all()
    return {tag: count for tag, count in rows}


@router.get("/lists/{list_id}/count")
async def audience_count(
    list_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
    tags: Annotated[str | None, Query()] = None,
) -> dict[str, int]:
    """Count valid contacts in the list, optionally narrowed to a tag segment."""
    await _get_owned_list(db, list_id, user.account_id)
    wanted = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    stmt = select(func.count()).select_from(Contact).where(
        Contact.list_id == list_id, Contact.is_valid.is_(True)
    )
    if wanted:
        stmt = stmt.where(or_(*[Contact.tags.contains([t]) for t in wanted]))
    return {"count": int(await db.scalar(stmt) or 0)}


@router.post("/lists/{list_id}/tags", status_code=status.HTTP_200_OK)
async def add_tag_to_list(
    list_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)],
    tag: Annotated[str, Body(embed=True, min_length=1, max_length=64)],
) -> dict[str, int]:
    """Add a tag to every valid contact in the list that doesn't already have it."""
    await _get_owned_list(db, list_id, user.account_id)
    t = tag.strip()
    result = await db.execute(
        update(Contact)
        .where(
            Contact.list_id == list_id, Contact.is_valid.is_(True),
            ~Contact.tags.contains([t]),
        )
        .values(tags=Contact.tags.op("||")(cast([t], JSONB)))
    )
    await db.commit()
    return {"tagged": result.rowcount or 0}


@router.patch("/lists/{list_id}/contacts/{contact_id}", response_model=ContactRow)
async def set_contact_tags(
    list_id: UUID, contact_id: UUID, user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    tags: Annotated[list[str], Body(embed=True)],
) -> Contact:
    """Replace a single contact's tags."""
    await _get_owned_list(db, list_id, user.account_id)
    contact = await db.get(Contact, contact_id)
    if contact is None or contact.list_id != list_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    clean = sorted({t.strip() for t in tags if t.strip()})[:20]
    contact.tags = clean
    await db.commit()
    await db.refresh(contact)
    return contact


@router.delete("/lists/{list_id}", status_code=status.HTTP_200_OK)
async def delete_list(
    list_id: UUID, user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> dict[str, str]:
    cl = await _get_owned_list(db, list_id, user.account_id)
    await db.delete(cl)
    await record_audit(
        db, actor_id=user.id, actor_email=user.email, action="contacts.delete",
        resource_type="contact_list", resource_id=str(list_id),
    )
    return {"message": "Contact list deleted."}
