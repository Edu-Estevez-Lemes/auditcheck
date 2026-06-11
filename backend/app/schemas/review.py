from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel


class ReviewCreate(BaseModel):
    audit_id: int
    technician_name: str
    review_date: str
    categories: list[str]
    selected_device_ids: list[int]
    review_data: dict[str, Any] | None = None


class ReviewUpdate(BaseModel):
    technician_name: str | None = None
    review_date: str | None = None
    categories: list[str] | None = None
    selected_device_ids: list[int] | None = None
    review_data: dict[str, Any] | None = None
    is_completed: bool | None = None


class ReviewOut(BaseModel):
    id: int
    audit_id: int
    client_id: int
    technician_name: str
    review_date: str
    categories: list[str]
    selected_device_ids: list[int]
    review_data: dict[str, Any] | None = None
    is_completed: bool
    exported_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
