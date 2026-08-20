from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.audit_log import AuditLogOut
from ..services.auth import get_admin_user
from ..models.user import User
from ..models.audit_log import AuditLog

router = APIRouter(prefix="/audit-log", tags=["Registro de actividad"])


@router.get("/", response_model=list[AuditLogOut])
def list_audit_log(
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    q = db.query(AuditLog)
    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action == action)
    if date_from:
        q = q.filter(AuditLog.timestamp >= date_from)
    if date_to:
        q = q.filter(AuditLog.timestamp <= date_to)
    return q.order_by(AuditLog.timestamp.desc()).limit(limit).all()
