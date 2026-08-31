"""Pruebas de la Auditoría Manual (clientes solo accesibles por AnyDesk).

Usan una BD SQLite en memoria real (no mocks) e invocan directamente las
funciones de servicio/endpoint como funciones Python normales (sin pasar por
FastAPI/TestClient ni autenticación), siguiendo el mismo estilo ligero que
el resto de la suite de tests de este repo.
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import Base, Client, Audit, Device, DeviceKnowledge
from app.schemas.audit import AuditCreate
from app.schemas.device import DeviceCreate
from app.schemas.review import ReviewCreate, ReviewUpdate
from app.services.audit import create_manual_audit, create_audit
from app.api.audits import add_device
from app.api.reviews import create_review, update_review


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    c = Client(name="Cliente AnyDesk")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_create_manual_audit_has_no_scan_and_is_pending(db, client):
    out = create_manual_audit(db, AuditCreate(client_id=client.id, name="Auditoría manual #1"), technician_id=1)
    assert out.audit_type == "manual"
    assert out.status == "pending"
    assert out.scanned_ranges is None


def test_create_audit_defaults_to_scan_type(db, client):
    out = create_audit(db, AuditCreate(client_id=client.id, name="Escaneo normal"), technician_id=1)
    assert out.audit_type == "scan"


def test_manual_audit_seeds_devices_from_known_client_hosts(db, client):
    """Una segunda auditoría manual del mismo cliente debe pre-cargar los hosts
    ya conocidos (DeviceKnowledge), para no tener que re-teclearlos cada vez."""
    known = DeviceKnowledge(
        client_id=client.id, ip_address="10.0.0.5",
        display_name="Servidor de ficheros", device_type="windows_server",
    )
    db.add(known)
    db.commit()

    out = create_manual_audit(db, AuditCreate(client_id=client.id, name="Auditoría manual #2"), technician_id=1)

    devices = db.query(Device).filter(Device.audit_id == out.id).all()
    assert len(devices) == 1
    assert devices[0].ip_address == "10.0.0.5"
    assert devices[0].display_name == "Servidor de ficheros"
    assert devices[0].manually_edited is True


def test_add_device_creates_host_and_rejects_duplicate_ip(db, client):
    out = create_manual_audit(db, AuditCreate(client_id=client.id, name="Auditoría manual"), technician_id=1)

    device_out = add_device(out.id, DeviceCreate(ip_address="192.168.1.10", hostname="DC01"), db=db, _=None)
    assert device_out.ip_address == "192.168.1.10"
    assert device_out.manually_edited is True

    with pytest.raises(HTTPException) as exc:
        add_device(out.id, DeviceCreate(ip_address="192.168.1.10"), db=db, _=None)
    assert exc.value.status_code == 400


def test_add_device_rejects_invalid_ip(db, client):
    out = create_manual_audit(db, AuditCreate(client_id=client.id, name="Auditoría manual"), technician_id=1)

    with pytest.raises(HTTPException) as exc:
        add_device(out.id, DeviceCreate(ip_address="not-an-ip"), db=db, _=None)
    assert exc.value.status_code == 422


def test_completing_review_marks_manual_audit_as_completed(db, client):
    audit_out = create_manual_audit(db, AuditCreate(client_id=client.id, name="Auditoría manual"), technician_id=1)
    add_device(audit_out.id, DeviceCreate(ip_address="192.168.1.20"), db=db, _=None)

    review_out = create_review(
        ReviewCreate(
            audit_id=audit_out.id, technician_name="Técnico", review_date="2026-08-27",
            categories=["hardware"], selected_device_ids=[], review_data={},
        ),
        db=db, _=None,
    )

    update_review(review_out.id, ReviewUpdate(is_completed=True), db=db, _=None)

    audit = db.query(Audit).filter(Audit.id == audit_out.id).first()
    assert audit.status == "completed"
    assert audit.completed_at is not None
