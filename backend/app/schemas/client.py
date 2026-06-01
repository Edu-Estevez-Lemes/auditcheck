from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


class IPRangeCreate(BaseModel):
    range: str = Field(..., description="CIDR o rango: 192.168.1.0/24 ó 192.168.1.1-192.168.1.254")
    description: str | None = None
    is_active: bool = True


class IPRangeOut(IPRangeCreate):
    id: int
    client_id: int
    model_config = {"from_attributes": True}


class ClientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    cif_nif: str | None = None
    address: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    observations: str | None = None


class ClientCreate(ClientBase):
    ip_ranges: list[IPRangeCreate] = []


class ClientUpdate(BaseModel):
    name: str | None = None
    cif_nif: str | None = None
    address: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    observations: str | None = None
    is_active: bool | None = None


class ClientOut(ClientBase):
    id: int
    logo_path: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    ip_ranges: list[IPRangeOut] = []

    model_config = {"from_attributes": True}


class ClientSummary(BaseModel):
    id: int
    name: str
    is_active: bool
    logo_path: str | None = None
    total_audits: int = 0
    last_audit_date: datetime | None = None
    open_findings: int = 0
    critical_findings: int = 0

    model_config = {"from_attributes": True}
