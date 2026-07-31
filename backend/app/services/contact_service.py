# @author Bodo Desderio <rooiboktechltd@gmail.com>
# @copyright 2026 Rooibok Technologies. All rights reserved.
"""Contact import persistence: turn a ParseResult into ContactList + Contact rows."""
from __future__ import annotations

import re
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import sha256_hex
from app.models.contact import Contact, ContactList
from app.services.parsers.contact_parser import (
    ParseResult,
    is_valid_email,
    normalise_phone,
)
from app.services.storage import get_storage


async def persist_import(
    db: AsyncSession,
    *,
    account_id: uuid.UUID,
    name: str,
    result: ParseResult,
    source_format: str,
    source_filename: str | None = None,
    raw_file: bytes | None = None,
) -> ContactList:
    checksum = sha256_hex(raw_file.decode("latin-1")) if raw_file else None
    s3_key = None
    if raw_file is not None:
        # Sanitise the client filename to a safe basename — it composes a storage
        # key that the local backend joins onto a filesystem path, so "../" must
        # not escape the root (prod uses S3 where it's just a key, but defend both).
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", (source_filename or "upload").rsplit("/", 1)[-1])[:80] or "upload"
        key = f"{account_id}/contacts/{uuid.uuid4()}_{safe_name}"
        s3_key = get_storage().put(key, raw_file)

    contact_list = ContactList(
        account_id=account_id,
        name=name,
        source_filename=source_filename,
        source_format=source_format,
        source_s3_key=s3_key,
        total_contacts=result.valid_contacts,
        valid_contacts=result.valid_contacts,
        duplicate_count=result.duplicate_count,
        columns=result.columns,
        phone_column=result.phone_column,
        email_column=result.email_column,
        merge_columns=result.merge_columns,
        checksum_sha256=checksum,
    )
    db.add(contact_list)
    await db.flush()

    db.add_all(
        Contact(
            list_id=contact_list.id,
            phone=c["phone"],
            email=c["email"],
            raw_data=c["raw_data"],
            is_valid=True,
        )
        for c in result.contacts
    )
    await db.flush()
    return contact_list


async def remap_columns(
    db: AsyncSession,
    contact_list: ContactList,
    *,
    phone_column: str | None,
    email_column: str | None,
) -> ContactList:
    """Re-derive phone/email for every row using operator-chosen columns (Section 3.1)."""
    contacts = (
        await db.execute(select(Contact).where(Contact.list_id == contact_list.id))
    ).scalars().all()

    valid = 0
    for contact in contacts:
        raw = contact.raw_data or {}
        phone = normalise_phone(raw.get(phone_column)) if phone_column else None
        email = is_valid_email(raw.get(email_column)) if email_column else None
        contact.phone = phone
        contact.email = email
        contact.is_valid = bool(phone or email)
        if contact.is_valid:
            valid += 1

    contact_list.phone_column = phone_column
    contact_list.email_column = email_column
    contact_list.merge_columns = [
        c for c in contact_list.columns if c not in (phone_column, email_column)
    ]
    contact_list.valid_contacts = valid
    await db.flush()
    return contact_list


async def count_contacts(db: AsyncSession, list_id: uuid.UUID) -> int:
    return await db.scalar(
        select(func.count()).select_from(Contact).where(Contact.list_id == list_id)
    ) or 0
