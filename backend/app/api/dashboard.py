from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..services.auth import get_current_user
from ..models.audit import Audit
from ..models.client import Client
from ..models.finding import Finding
from ..models.device import Device
from ..models.user import User

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    total_clients = db.query(func.count(Client.id)).scalar() or 0
    active_clients = db.query(func.count(Client.id)).filter(Client.is_active == True).scalar() or 0
    total_audits = db.query(func.count(Audit.id)).scalar() or 0
    completed_audits = db.query(func.count(Audit.id)).filter(Audit.status == "completed").scalar() or 0

    open_findings_by_sev = {}
    for sev in ["critical", "high", "medium", "low", "informational"]:
        count = (
            db.query(func.count(Finding.id))
            .filter(Finding.severity == sev, Finding.status == "open")
            .scalar() or 0
        )
        open_findings_by_sev[sev] = count

    total_devices = db.query(func.count(Device.id)).scalar() or 0

    return {
        "clients": {"total": total_clients, "active": active_clients},
        "audits": {"total": total_audits, "completed": completed_audits},
        "findings": open_findings_by_sev,
        "total_open_findings": sum(open_findings_by_sev.values()),
        "total_devices": total_devices,
    }


@router.get("/recent-audits")
def get_recent_audits(limit: int = 10, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    audits = (
        db.query(Audit)
        .order_by(Audit.created_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for a in audits:
        client = db.query(Client).filter(Client.id == a.client_id).first()
        critical = (
            db.query(func.count(Finding.id))
            .filter(Finding.audit_id == a.id, Finding.severity == "critical")
            .scalar() or 0
        )
        result.append({
            "id": a.id,
            "name": a.name,
            "client_name": client.name if client else "",
            "client_id": a.client_id,
            "status": a.status,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
            "critical_findings": critical,
        })
    return result


@router.get("/findings-trend")
def get_findings_trend(days: int = 30, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(days=days)
    audits = db.query(Audit).filter(Audit.created_at >= cutoff, Audit.status == "completed").all()

    trend = []
    for a in audits:
        by_sev = {}
        for sev in ["critical", "high", "medium", "low"]:
            by_sev[sev] = (
                db.query(func.count(Finding.id))
                .filter(Finding.audit_id == a.id, Finding.severity == sev)
                .scalar() or 0
            )
        trend.append({
            "date": a.completed_at.isoformat() if a.completed_at else a.created_at.isoformat(),
            "audit_name": a.name,
            "client_id": a.client_id,
            **by_sev,
        })
    return sorted(trend, key=lambda x: x["date"])
