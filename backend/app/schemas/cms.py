"""CMS content schemas — public (read) + admin (write)."""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


# --- FAQ ---
class FaqOut(BaseModel):
    id: UUID
    question: str
    answer: str
    category: str | None = None
    sort_order: int = 0
    is_published: bool = True
    model_config = {"from_attributes": True}


class FaqCreate(BaseModel):
    question: str = Field(min_length=1, max_length=300)
    answer: str = Field(min_length=1)
    category: str | None = Field(default=None, max_length=60)
    sort_order: int = 0
    is_published: bool = True


class FaqUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=1, max_length=300)
    answer: str | None = Field(default=None, min_length=1)
    category: str | None = Field(default=None, max_length=60)
    sort_order: int | None = None
    is_published: bool | None = None


# --- Feature ---
class FeatureOut(BaseModel):
    id: UUID
    icon: str
    title: str
    description: str
    sort_order: int = 0
    is_published: bool = True
    model_config = {"from_attributes": True}


class FeatureCreate(BaseModel):
    icon: str = Field(min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1)
    sort_order: int = 0
    is_published: bool = True


class FeatureUpdate(BaseModel):
    icon: str | None = Field(default=None, min_length=1, max_length=60)
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, min_length=1)
    sort_order: int | None = None
    is_published: bool | None = None


# --- Testimonial ---
class TestimonialOut(BaseModel):
    id: UUID
    quote: str
    name: str
    role: str
    sort_order: int = 0
    is_published: bool = True
    model_config = {"from_attributes": True}


class TestimonialCreate(BaseModel):
    quote: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=160)
    sort_order: int = 0
    is_published: bool = True


class TestimonialUpdate(BaseModel):
    quote: str | None = Field(default=None, min_length=1)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = Field(default=None, min_length=1, max_length=160)
    sort_order: int | None = None
    is_published: bool | None = None


# --- Page section ---
class PageSectionOut(BaseModel):
    id: UUID
    page: str
    key: str
    value: str
    sort_order: int = 0
    is_published: bool = True
    model_config = {"from_attributes": True}


class PageSectionCreate(BaseModel):
    page: str = Field(min_length=1, max_length=60)
    key: str = Field(min_length=1, max_length=60)
    value: str = ""
    sort_order: int = 0
    is_published: bool = True


class PageSectionUpdate(BaseModel):
    value: str | None = None
    sort_order: int | None = None
    is_published: bool | None = None
