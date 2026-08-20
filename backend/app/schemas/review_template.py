from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel


class ReviewTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    categories: list[str] = []
    removed_items: dict[str, dict[str, list[str]]] = {}
    custom_items: dict[str, dict[str, list[dict[str, Any]]]] = {}


class ReviewTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    categories: list[str] | None = None
    removed_items: dict[str, dict[str, list[str]]] | None = None
    custom_items: dict[str, dict[str, list[dict[str, Any]]]] | None = None


class ReviewTemplateOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: str | None = None
    categories: list[str]
    removed_items: dict[str, dict[str, list[str]]]
    custom_items: dict[str, dict[str, list[dict[str, Any]]]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewTemplateAffectedClient(BaseModel):
    client_id: int
    client_name: str
    up_to_date: bool


class ReviewTemplateDiffEntry(BaseModel):
    category: str
    device_type: str
    added_items: list[dict[str, str]] = []
    removed_items: list[str] = []


class ReviewTemplateDiff(BaseModel):
    client_id: int
    client_name: str
    categories_added: list[str] = []
    categories_removed: list[str] = []
    entries: list[ReviewTemplateDiffEntry] = []
    has_changes: bool = False


class ReviewTemplatePropagateRequest(BaseModel):
    client_ids: list[int]
