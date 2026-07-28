"""CMS content models — the editable marketing content behind the public site.

Four small, admin-managed content types replace what used to be hardcoded in the
frontend's seed-data. Everything is account-agnostic (platform-wide), ordered by
``sort_order``, and gated by ``is_published`` so drafts never reach the public API.

  • CmsFaq          — question/answer, optional category
  • CmsFeature      — icon + title + description (feature grid)
  • CmsTestimonial  — quote + author name/role
  • CmsPageSection  — flexible (page, key) → value store for editable hero/section copy
"""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPk


class CmsFaq(UUIDPk, TimestampMixin, Base):
    __tablename__ = "cms_faqs"

    question: Mapped[str] = mapped_column(String(300), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CmsFeature(UUIDPk, TimestampMixin, Base):
    __tablename__ = "cms_features"

    icon: Mapped[str] = mapped_column(String(60), nullable=False)  # lucide-react icon name
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CmsTestimonial(UUIDPk, TimestampMixin, Base):
    __tablename__ = "cms_testimonials"

    quote: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(160), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CmsPageSection(UUIDPk, TimestampMixin, Base):
    """One editable text slot on a public page, keyed by (page, key) — e.g.
    ('faq', 'hero_title'). Lets an admin retune hero/section copy without a deploy."""
    __tablename__ = "cms_page_sections"
    __table_args__ = (UniqueConstraint("page", "key", name="uq_cms_page_sections_page_key"),)

    page: Mapped[str] = mapped_column(String(60), nullable=False)
    key: Mapped[str] = mapped_column(String(60), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
