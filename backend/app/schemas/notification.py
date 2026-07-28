"""Notification API schemas."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: UUID
    type: str
    level: str
    title: str
    body: str | None = None
    link: str | None = None
    meta: dict = {}
    read_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UnreadCount(BaseModel):
    count: int


class PreferencesOut(BaseModel):
    channels: dict[str, list[str]]


class PreferencesUpdate(BaseModel):
    # category -> list of channels (subset of ["in_app", "email"])
    channels: dict[str, list[str]]
