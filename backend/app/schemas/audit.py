from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


class AuditCreate(BaseModel):
    client_id: int
    name: str = Field(..., min_length=1, max_length=255)
    notes: str | None = None
    scanned_ranges: str | None = None
    audit_type: str = "scan"


class AuditUpdate(BaseModel):
    name: str | None = None
    notes: str | None = None
    status: str | None = None
    file_path: str | None = None


class AuditOut(BaseModel):
    id: int
    client_id: int
    technician_id: int | None = None
    name: str
    status: str
    audit_type: str = "scan"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    file_path: str | None = None
    notes: str | None = None
    summary: dict | None = None
    scanned_ranges: str | None = None
    app_version: str | None = None
    created_at: datetime
    updated_at: datetime

    total_devices: int = 0
    total_findings: int = 0
    critical_findings: int = 0
    high_findings: int = 0

    model_config = {"from_attributes": True}


class AuditSummary(BaseModel):
    id: int
    client_id: int
    client_name: str = ""
    name: str
    status: str
    audit_type: str = "scan"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    total_devices: int = 0
    total_findings: int = 0
    critical_findings: int = 0

    model_config = {"from_attributes": True}
