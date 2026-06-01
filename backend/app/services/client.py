from __future__ import annotations
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException, status

from ..models.client import Client, IPRange
from ..models.audit import Audit
from ..models.finding import Finding
from ..schemas.client import ClientCreate, ClientUpdate, ClientSummary


def get_client_or_404(db: Session, client_id: int) -> Client:
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client


def list_clients(db: Session, skip: int = 0, limit: int = 100, active_only: bool = False):
    q = db.query(Client)
    if active_only:
        q = q.filter(Client.is_active == True)
    return q.offset(skip).limit(limit).all()


def get_clients_summary(db: Session) -> list[ClientSummary]:
    clients = db.query(Client).all()
    summaries = []
    for c in clients:
        total_audits = db.query(func.count(Audit.id)).filter(Audit.client_id == c.id).scalar() or 0
        last_audit = (
            db.query(Audit)
            .filter(Audit.client_id == c.id)
            .order_by(Audit.created_at.desc())
            .first()
        )
        open_findings = (
            db.query(func.count(Finding.id))
            .filter(Finding.client_id == c.id, Finding.status == "open")
            .scalar() or 0
        )
        critical_findings = (
            db.query(func.count(Finding.id))
            .filter(Finding.client_id == c.id, Finding.severity == "critical", Finding.status == "open")
            .scalar() or 0
        )
        summaries.append(ClientSummary(
            id=c.id,
            name=c.name,
            is_active=c.is_active,
            logo_path=c.logo_path,
            total_audits=total_audits,
            last_audit_date=last_audit.created_at if last_audit else None,
            open_findings=open_findings,
            critical_findings=critical_findings,
        ))
    return summaries


def create_client(db: Session, data: ClientCreate) -> Client:
    client = Client(
        name=data.name,
        cif_nif=data.cif_nif,
        address=data.address,
        contact_person=data.contact_person,
        phone=data.phone,
        email=data.email,
        observations=data.observations,
    )
    db.add(client)
    db.flush()

    for rng in data.ip_ranges:
        db.add(IPRange(
            client_id=client.id,
            range=rng.range,
            description=rng.description,
            is_active=rng.is_active,
        ))

    db.commit()
    db.refresh(client)
    return client


def update_client(db: Session, client_id: int, data: ClientUpdate) -> Client:
    client = get_client_or_404(db, client_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(client, field, value)
    db.commit()
    db.refresh(client)
    return client


def delete_client(db: Session, client_id: int) -> None:
    client = get_client_or_404(db, client_id)
    db.delete(client)
    db.commit()


def add_ip_range(db: Session, client_id: int, range_str: str, description: str | None = None) -> IPRange:
    get_client_or_404(db, client_id)
    rng = IPRange(client_id=client_id, range=range_str, description=description)
    db.add(rng)
    db.commit()
    db.refresh(rng)
    return rng


def delete_ip_range(db: Session, range_id: int, client_id: int) -> None:
    rng = db.query(IPRange).filter(IPRange.id == range_id, IPRange.client_id == client_id).first()
    if not rng:
        raise HTTPException(status_code=404, detail="Rango IP no encontrado")
    db.delete(rng)
    db.commit()
