"""Notifications API: the bell feed, unread count, mark-read, preferences."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentUser
from app.models.notification import Notification, NotificationPreference
from app.schemas.notification import (
    NotificationOut,
    PreferencesOut,
    PreferencesUpdate,
    UnreadCount,
)
from app.services.notifications import DEFAULT_CHANNELS, effective_channels

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _visible(user):
    """Account-wide notifications plus those targeted at this user."""
    return (
        Notification.account_id == user.account_id,
        or_(Notification.user_id.is_(None), Notification.user_id == user.id),
    )


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    unread_only: bool = False,
    limit: int = 30,
) -> list[NotificationOut]:
    conds = list(_visible(user))
    if unread_only:
        conds.append(Notification.read_at.is_(None))
    res = await db.execute(
        select(Notification).where(*conds)
        .order_by(Notification.created_at.desc())
        .limit(min(limit, 100))
    )
    return [NotificationOut.model_validate(n) for n in res.scalars()]


@router.get("/unread-count", response_model=UnreadCount)
async def unread_count(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> UnreadCount:
    count = await db.scalar(
        select(func.count()).select_from(Notification)
        .where(*_visible(user), Notification.read_at.is_(None))
    )
    return UnreadCount(count=int(count or 0))


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: UUID,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationOut:
    n = await db.get(Notification, notification_id)
    if n is None or n.account_id != user.account_id or (
        n.user_id is not None and n.user_id != user.id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(n)
    return NotificationOut.model_validate(n)


@router.post("/read-all", response_model=UnreadCount)
async def mark_all_read(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> UnreadCount:
    await db.execute(
        update(Notification)
        .where(*_visible(user), Notification.read_at.is_(None))
        .values(read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return UnreadCount(count=0)


@router.get("/preferences", response_model=PreferencesOut)
async def get_preferences(
    user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]
) -> PreferencesOut:
    prefs = (
        await db.execute(
            select(NotificationPreference).where(
                NotificationPreference.account_id == user.account_id
            )
        )
    ).scalar_one_or_none()
    return PreferencesOut(channels=effective_channels(prefs))


@router.patch("/preferences", response_model=PreferencesOut)
async def update_preferences(
    body: PreferencesUpdate,
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PreferencesOut:
    # Keep only known categories + valid channels; in-app for billing/quota is not
    # removable (critical account-health alerts must always reach the bell).
    clean: dict[str, list[str]] = {}
    for cat, chans in body.channels.items():
        if cat not in DEFAULT_CHANNELS:
            continue
        valid = [c for c in chans if c in ("in_app", "email")]
        if cat in ("billing", "quota") and "in_app" not in valid:
            valid.append("in_app")
        clean[cat] = valid

    prefs = (
        await db.execute(
            select(NotificationPreference).where(
                NotificationPreference.account_id == user.account_id
            )
        )
    ).scalar_one_or_none()
    if prefs is None:
        prefs = NotificationPreference(account_id=user.account_id, channels=clean)
        db.add(prefs)
    else:
        prefs.channels = {**(prefs.channels or {}), **clean}
    await db.commit()
    await db.refresh(prefs)
    return PreferencesOut(channels=effective_channels(prefs))
