from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class ReviewCategoryCreate(BaseModel):
    label: str
    key: str | None = None
    order: int | None = None


class ReviewCategoryUpdate(BaseModel):
    label: str | None = None
    order: int | None = None


class ReviewCategoryReorder(BaseModel):
    order: list[int]


class ReviewCategoryOut(BaseModel):
    id: int
    key: str
    label: str
    order: int
    is_system: bool
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewCategoryUsage(BaseModel):
    in_use: bool
    review_configs: int = 0
    review_sessions: int = 0
    review_templates: int = 0
