"""Async SQLAlchemy engines and session factories for the live and archive DBs.

Two fully independent PostgreSQL instances per Section 18.2 — the live DB is
write-optimised, the archive DB is read-heavy and retention-isolated.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Declarative base for all live-platform ORM models."""


class ArchiveBase(DeclarativeBase):
    """Declarative base for all archive ORM models (separate metadata)."""


live_engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    echo=False,
)

archive_engine = create_async_engine(
    settings.ARCHIVE_DATABASE_URL,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    echo=False,
)

LiveSessionLocal = async_sessionmaker(
    live_engine, expire_on_commit=False, class_=AsyncSession
)
ArchiveSessionLocal = async_sessionmaker(
    archive_engine, expire_on_commit=False, class_=AsyncSession
)


async def get_db() -> AsyncGenerator[AsyncSession, Any]:
    """FastAPI dependency yielding a live-platform session."""
    async with LiveSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_archive_db() -> AsyncGenerator[AsyncSession, Any]:
    """FastAPI dependency yielding an archive session."""
    async with ArchiveSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
