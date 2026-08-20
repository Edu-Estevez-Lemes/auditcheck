from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None
    action: str
    target_type: str | None
    target_id: str | None
    details: str | None
    ip_address: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}
