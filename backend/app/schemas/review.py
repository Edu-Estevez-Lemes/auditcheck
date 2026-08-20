from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel


# ─── ReviewConfig schemas ──────────────────────────────────────────────────────

class ReviewHostConfig(BaseModel):
    ip: str
    nombre: str
    categorias: list[str]


class ReviewConfigCreate(BaseModel):
    client_id: int
    client_nombre: str
    configurado_por: str
    fecha_configuracion: str
    hosts: list[ReviewHostConfig]
    template_id: int | None = None
    removed_items: dict[str, dict[str, list[str]]] = {}
    custom_items: dict[str, dict[str, list[dict[str, Any]]]] = {}


class ReviewConfigOut(BaseModel):
    id: int
    client_id: int
    client_nombre: str
    configurado_por: str
    fecha_configuracion: str
    hosts: list[ReviewHostConfig]
    template_id: int | None = None
    removed_items: dict[str, dict[str, list[str]]] = {}
    custom_items: dict[str, dict[str, list[dict[str, Any]]]] = {}
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReviewClientStatus(BaseModel):
    client_id: int
    has_config: bool
    configured_hosts: int = 0
    last_review_date: str | None = None
    last_technician: str | None = None
    last_review_completed: bool = False
    days_since_review: int | None = None


# ─── ReviewSession schemas ─────────────────────────────────────────────────────

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
