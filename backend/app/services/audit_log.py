from __future__ import annotations
import json
from sqlalchemy.orm import Session
from fastapi import Request

from ..models.audit_log import AuditLog
from ..models.user import User

# Bloque 1 — Usuarios y roles: registro de actividad


def log_action(
    db: Session,
    user: User | None,
    action: str,
    target_type: str | None = None,
    target_id: int | str | None = None,
    details: dict | None = None,
    request: Request | None = None,
) -> None:
    entry = AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        details=json.dumps(details, ensure_ascii=False, default=str) if details else None,
        ip_address=request.client.host if request and request.client else None,
    )
    db.add(entry)
    db.commit()
