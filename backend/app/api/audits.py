from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path

from ..database import get_db
from ..schemas.audit import AuditCreate, AuditUpdate, AuditOut, AuditSummary
from ..schemas.device import DeviceOut
from ..schemas.finding import FindingCreate, FindingUpdate, FindingOut
from ..services.audit import list_audits, create_audit, get_audit, update_audit, delete_audit
from ..services.comparison import compare_audits
from ..services.auth import get_current_user
from ..models.device import Device, Port
from ..models.finding import Finding
from ..models.user import User
from ..reports.excel import generate_excel_report
from ..config import settings
import json

router = APIRouter(prefix="/audits", tags=["Auditorías"])


@router.get("/", response_model=list[AuditSummary])
def get_audits(
    client_id: int | None = None,
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return list_audits(db, client_id, skip, limit)


@router.post("/", response_model=AuditOut, status_code=201)
def create(data: AuditCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return create_audit(db, data, current_user.id)


@router.get("/{audit_id}", response_model=AuditOut)
def get_one(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return get_audit(db, audit_id)


@router.put("/{audit_id}", response_model=AuditOut)
def update(audit_id: int, data: AuditUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return update_audit(db, audit_id, data)


@router.delete("/{audit_id}", status_code=204)
def delete(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    delete_audit(db, audit_id)


@router.get("/{audit_id}/devices", response_model=list[DeviceOut])
def get_devices(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    devices = db.query(Device).filter(Device.audit_id == audit_id).all()
    result = []
    for d in devices:
        ports = db.query(Port).filter(Port.device_id == d.id).all()
        out = DeviceOut.model_validate(d)
        from ..schemas.device import PortOut
        out.ports = [PortOut.model_validate(p) for p in ports]
        result.append(out)
    return result


@router.get("/{audit_id}/findings", response_model=list[FindingOut])
def get_findings(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    findings = db.query(Finding).filter(Finding.audit_id == audit_id).all()
    result = []
    for f in findings:
        out = FindingOut.model_validate(f)
        if f.device_id:
            device = db.query(Device).filter(Device.id == f.device_id).first()
            if device:
                out.device_ip = device.ip_address
                out.device_hostname = device.hostname
        result.append(out)
    return result


@router.post("/{audit_id}/findings", response_model=FindingOut, status_code=201)
def add_finding(audit_id: int, data: FindingCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    f = Finding(
        audit_id=audit_id, device_id=data.device_id, client_id=data.client_id,
        category=data.category, title=data.title, description=data.description,
        evidence=data.evidence, recommendation=data.recommendation,
        severity=data.severity, status=data.status,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return FindingOut.model_validate(f)


@router.put("/{audit_id}/findings/{finding_id}", response_model=FindingOut)
def update_finding(
    audit_id: int, finding_id: int, data: FindingUpdate,
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    f = db.query(Finding).filter(Finding.id == finding_id, Finding.audit_id == audit_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Hallazgo no encontrado")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(f, field, value)
    db.commit()
    db.refresh(f)
    return FindingOut.model_validate(f)


@router.get("/{audit_id}/report/excel")
def download_excel(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    from ..models.audit import Audit
    from ..models.client import Client
    import datetime

    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")

    client = db.query(Client).filter(Client.id == audit.client_id).first()
    client_name = (client.name or "cliente").replace(" ", "_") if client else "cliente"
    date_str = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"AUDITCHECK_{date_str}_{client_name}.xlsx"

    output_path = settings.AUDITS_DIR / str(audit_id) / filename

    generate_excel_report(db, audit_id, output_path=output_path)

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Error generando el informe")

    return FileResponse(
        str(output_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@router.get("/compare/{audit_a_id}/{audit_b_id}")
def compare(
    audit_a_id: int, audit_b_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = compare_audits(db, audit_a_id, audit_b_id)
    return result.to_dict()
