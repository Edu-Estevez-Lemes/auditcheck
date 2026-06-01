from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field

SEVERITIES = ["critical", "high", "medium", "low", "informational"]
CATEGORIES = [
    "network", "backup", "vmware", "storage", "security",
    "hardware", "software", "configuration", "availability", "performance"
]
STATUSES = ["open", "resolved", "accepted", "false_positive"]


class FindingCreate(BaseModel):
    audit_id: int
    device_id: int | None = None
    client_id: int
    category: str
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    evidence: str | None = None
    recommendation: str | None = None
    severity: str
    status: str = "open"


class FindingUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    evidence: str | None = None
    recommendation: str | None = None
    severity: str | None = None
    status: str | None = None
    resolution_notes: str | None = None


class FindingOut(BaseModel):
    id: int
    audit_id: int
    device_id: int | None = None
    client_id: int
    category: str
    title: str
    description: str | None = None
    evidence: str | None = None
    recommendation: str | None = None
    severity: str
    status: str
    resolved_at: datetime | None = None
    resolution_notes: str | None = None
    created_at: datetime

    device_ip: str | None = None
    device_hostname: str | None = None

    model_config = {"from_attributes": True}
