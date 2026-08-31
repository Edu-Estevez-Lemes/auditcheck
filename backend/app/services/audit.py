from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException

from ..models.audit import Audit
from ..models.device import Device, Port, DeviceKnowledge
from ..models.finding import Finding
from ..models.client import Client
from ..schemas.audit import AuditCreate, AuditUpdate, AuditOut, AuditSummary
from ..config import settings


def get_audit_or_404(db: Session, audit_id: int) -> Audit:
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")
    return audit


def _enrich_audit(db: Session, audit: Audit) -> AuditOut:
    total_devices = db.query(func.count(Device.id)).filter(Device.audit_id == audit.id).scalar() or 0
    total_findings = db.query(func.count(Finding.id)).filter(Finding.audit_id == audit.id).scalar() or 0
    critical_findings = (
        db.query(func.count(Finding.id))
        .filter(Finding.audit_id == audit.id, Finding.severity == "critical")
        .scalar() or 0
    )
    high_findings = (
        db.query(func.count(Finding.id))
        .filter(Finding.audit_id == audit.id, Finding.severity == "high")
        .scalar() or 0
    )

    out = AuditOut.model_validate(audit)
    out.total_devices = total_devices
    out.total_findings = total_findings
    out.critical_findings = critical_findings
    out.high_findings = high_findings
    return out


def list_audits(db: Session, client_id: int | None = None, skip: int = 0, limit: int = 50) -> list[AuditSummary]:
    q = db.query(Audit)
    if client_id:
        q = q.filter(Audit.client_id == client_id)
    q = q.order_by(Audit.created_at.desc())
    audits = q.offset(skip).limit(limit).all()

    result = []
    for a in audits:
        client = db.query(Client).filter(Client.id == a.client_id).first()
        total_devices = db.query(func.count(Device.id)).filter(Device.audit_id == a.id).scalar() or 0
        total_findings = db.query(func.count(Finding.id)).filter(Finding.audit_id == a.id).scalar() or 0
        critical_findings = (
            db.query(func.count(Finding.id))
            .filter(Finding.audit_id == a.id, Finding.severity == "critical")
            .scalar() or 0
        )
        result.append(AuditSummary(
            id=a.id,
            client_id=a.client_id,
            client_name=client.name if client else "",
            name=a.name,
            status=a.status,
            audit_type=a.audit_type,
            started_at=a.started_at,
            completed_at=a.completed_at,
            total_devices=total_devices,
            total_findings=total_findings,
            critical_findings=critical_findings,
        ))
    return result


def create_audit(db: Session, data: AuditCreate, technician_id: int) -> AuditOut:
    audit = Audit(
        client_id=data.client_id,
        technician_id=technician_id,
        name=data.name,
        notes=data.notes,
        scanned_ranges=data.scanned_ranges,
        status="pending",
        audit_type="scan",
        app_version=settings.APP_VERSION,
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return _enrich_audit(db, audit)


def create_manual_audit(db: Session, data: AuditCreate, technician_id: int) -> AuditOut:
    """Crea una auditoría sin escaneo de red, para clientes solo accesibles por AnyDesk.

    Los hosts se dan de alta a mano (POST /audits/{id}/devices) y el checklist se
    completa vía el módulo de Revisiones. Se precargan como Device los hosts conocidos
    del cliente (DeviceKnowledge), igual que haría un escaneo nuevo al fusionar con el
    conocimiento persistente, para no tener que re-teclearlos en cada auditoría.
    """
    audit = Audit(
        client_id=data.client_id,
        technician_id=technician_id,
        name=data.name,
        notes=data.notes,
        status="pending",
        audit_type="manual",
        app_version=settings.APP_VERSION,
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    _seed_devices_from_knowledge(db, audit)

    return _enrich_audit(db, audit)


def _seed_devices_from_knowledge(db: Session, audit: Audit) -> None:
    known = db.query(DeviceKnowledge).filter(DeviceKnowledge.client_id == audit.client_id).all()
    for k in known:
        device = Device(
            audit_id=audit.id,
            client_id=audit.client_id,
            ip_address=k.ip_address,
            mac_address=k.mac_address,
            manufacturer=k.manufacturer,
            os_type=k.os_type,
            device_type=k.device_type or "unknown",
            display_name=k.display_name,
            custom_category=k.custom_category,
            location=k.location,
            description=k.description,
            observations=k.observations,
            credential_id=k.credential_id,
            manually_edited=True,
            is_new_device=False,
            is_up=True,
        )
        db.add(device)
    if known:
        db.commit()


def get_audit(db: Session, audit_id: int) -> AuditOut:
    audit = get_audit_or_404(db, audit_id)
    return _enrich_audit(db, audit)


def update_audit(db: Session, audit_id: int, data: AuditUpdate) -> AuditOut:
    audit = get_audit_or_404(db, audit_id)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(audit, field, value)
    db.commit()
    db.refresh(audit)
    return _enrich_audit(db, audit)


def delete_audit(db: Session, audit_id: int) -> None:
    audit = get_audit_or_404(db, audit_id)
    db.delete(audit)
    db.commit()


_KNOWLEDGE_FIELDS = [
    "display_name", "device_type", "custom_category",
    "manufacturer", "os_type", "location", "description", "observations",
]
_KNOWLEDGE_CREDENTIAL_FIELD = "credential_id"


def save_scan_results(db: Session, audit_id: int, devices_data: list[dict]) -> None:
    """Persiste los resultados de un escaneo, fusionando con la base de conocimiento."""
    audit = get_audit_or_404(db, audit_id)

    for dev_data in devices_data:
        ip = dev_data["ip_address"]
        mac = dev_data.get("mac_address")

        # Consultar base de conocimiento por IP del cliente
        knowledge = db.query(DeviceKnowledge).filter(
            DeviceKnowledge.client_id == audit.client_id,
            DeviceKnowledge.ip_address == ip,
        ).first()

        is_new = knowledge is None

        device = Device(
            audit_id=audit_id,
            client_id=audit.client_id,
            ip_address=ip,
            hostname=dev_data.get("hostname"),
            netbios_name=dev_data.get("netbios_name"),
            mac_address=mac,
            manufacturer=dev_data.get("manufacturer"),
            os_type=dev_data.get("os_type"),
            device_type=dev_data.get("device_type", "unknown"),
            is_up=dev_data.get("is_up", True),
            response_time_ms=dev_data.get("response_time_ms"),
            ttl=dev_data.get("ttl"),
            first_seen=datetime.utcnow(),
            last_seen=datetime.utcnow(),
            is_new_device=is_new,
            manually_edited=False,
        )

        if knowledge:
            # Fusionar datos curados manualmente en el nuevo registro
            for field in _KNOWLEDGE_FIELDS:
                stored = getattr(knowledge, field, None)
                if stored:
                    setattr(device, field, stored)
            # credential_id se copia si fue asignado previamente
            if knowledge.credential_id is not None:
                device.credential_id = knowledge.credential_id
            # Si hay datos de conocimiento, indicamos que tiene ediciones previas
            device.manually_edited = bool(
                knowledge.display_name or knowledge.location or
                knowledge.description or knowledge.observations or
                knowledge.custom_category or knowledge.credential_id
            )
            # Actualizar knowledge
            knowledge.last_seen_audit_id = audit_id
            knowledge.times_seen = (knowledge.times_seen or 1) + 1
            if mac and not knowledge.mac_address:
                knowledge.mac_address = mac
        else:
            # Primera vez que vemos este dispositivo: crear entrada de conocimiento
            knowledge = DeviceKnowledge(
                client_id=audit.client_id,
                ip_address=ip,
                mac_address=mac,
                device_type=dev_data.get("device_type", "unknown"),
                manufacturer=dev_data.get("manufacturer"),
                os_type=dev_data.get("os_type"),
                last_seen_audit_id=audit_id,
                times_seen=1,
            )
            db.add(knowledge)

        db.add(device)
        db.flush()

        for port_data in dev_data.get("ports", []):
            port = Port(
                device_id=device.id,
                audit_id=audit_id,
                port_number=port_data["port_number"],
                protocol=port_data.get("protocol", "tcp"),
                service=port_data.get("service"),
                state=port_data.get("state", "open"),
                banner=port_data.get("banner"),
                is_risky=port_data.get("is_risky", False),
            )
            db.add(port)

    _auto_generate_findings(db, audit)

    audit.status = "completed"
    audit.completed_at = datetime.utcnow()
    audit.summary = _build_summary(db, audit_id)
    db.commit()


def _auto_generate_findings(db: Session, audit: Audit) -> None:
    devices = db.query(Device).filter(Device.audit_id == audit.id).all()

    for device in devices:
        ports = db.query(Port).filter(Port.device_id == device.id).all()
        open_ports = [p.port_number for p in ports]
        ip = device.ip_address

        risky_checks = [
            (
                23 in open_ports,
                "high", f"Telnet expuesto en {ip}",
                "El puerto 23 (Telnet) transmite credenciales y datos en texto plano, sin cifrado.",
                "Deshabilitar Telnet inmediatamente. Usar SSH (puerto 22) para acceso remoto. Bloquear puerto 23 en el firewall.",
                f"{ip}:23/tcp — Telnet (sin cifrado)",
            ),
            (
                21 in open_ports and 22 not in open_ports,
                "medium", f"FTP sin cifrado en {ip}",
                "El puerto 21 (FTP) está abierto sin SSH disponible. FTP transmite credenciales en texto plano.",
                "Migrar a SFTP (puerto 22) o FTPS (puerto 990). Deshabilitar FTP clásico.",
                f"{ip}:21/tcp — FTP (credenciales en claro)",
            ),
            (
                3389 in open_ports,
                "medium", f"RDP expuesto en {ip}",
                "El puerto 3389 (RDP) es accesible. Objetivo frecuente de ataques de fuerza bruta y exploits.",
                "Restringir acceso RDP solo a IPs de administración o requerir VPN. Habilitar NLA. Cambiar puerto por defecto.",
                f"{ip}:3389/tcp — RDP (Remote Desktop)",
            ),
            (
                445 in open_ports,
                "informational", f"SMB accesible en {ip}",
                "El puerto 445 (SMB/Windows File Sharing) está abierto. Puede exponer recursos compartidos.",
                "Verificar que SMB solo sea accesible en la red interna. Asegurarse de que SMBv1 está deshabilitado.",
                f"{ip}:445/tcp — SMB (Windows Shares)",
            ),
            (
                135 in open_ports,
                "medium", f"MSRPC expuesto en {ip}",
                "El puerto 135 (Microsoft RPC) está abierto. Históricamente explotado por gusanos como Blaster.",
                "Bloquear el puerto 135 en el firewall perimetral. Solo debe ser accesible internamente si es necesario.",
                f"{ip}:135/tcp — MSRPC (Microsoft RPC)",
            ),
            (
                1433 in open_ports,
                "high", f"SQL Server expuesto en {ip}",
                "El puerto 1433 (Microsoft SQL Server) está accesible. Una BD expuesta es un objetivo de alto valor.",
                "Restringir acceso al puerto 1433 solo a las IPs de aplicación. Nunca exponer directamente a Internet.",
                f"{ip}:1433/tcp — MSSQL (SQL Server)",
            ),
            (
                5900 in open_ports,
                "high", f"VNC expuesto en {ip}",
                "El puerto 5900 (VNC) permite control remoto de escritorio. Con frecuencia sin autenticación robusta.",
                "Deshabilitar VNC si no se usa. Si se necesita, proteger con contraseña fuerte y acceso solo por VPN.",
                f"{ip}:5900/tcp — VNC (control remoto)",
            ),
            (
                6379 in open_ports,
                "critical", f"Redis expuesto en {ip}",
                "El puerto 6379 (Redis) está accesible. Redis por defecto no requiere autenticación y permite ejecución de comandos.",
                "Configurar autenticación en Redis (requirepass). Vincular Redis solo a localhost o red interna. Nunca exponer a Internet.",
                f"{ip}:6379/tcp — Redis (sin autenticación por defecto)",
            ),
            (
                27017 in open_ports,
                "critical", f"MongoDB expuesto en {ip}",
                "El puerto 27017 (MongoDB) está accesible. MongoDB sin autenticación expone toda la base de datos.",
                "Habilitar autenticación en MongoDB. Restringir el acceso por IP. Actualizar a la última versión estable.",
                f"{ip}:27017/tcp — MongoDB (sin autenticación por defecto)",
            ),
        ]

        for condition, severity, title, description, recommendation, evidence in risky_checks:
            if condition:
                db.add(Finding(
                    audit_id=audit.id, device_id=device.id, client_id=audit.client_id,
                    category="security", severity=severity,
                    title=title, description=description,
                    recommendation=recommendation, evidence=evidence,
                ))


def _build_summary(db: Session, audit_id: int) -> dict:
    total_devices = db.query(func.count(Device.id)).filter(Device.audit_id == audit_id).scalar() or 0
    findings_by_severity = {}
    for sev in ["critical", "high", "medium", "low", "informational"]:
        count = (
            db.query(func.count(Finding.id))
            .filter(Finding.audit_id == audit_id, Finding.severity == sev)
            .scalar() or 0
        )
        findings_by_severity[sev] = count

    return {
        "total_devices": total_devices,
        "findings": findings_by_severity,
        "total_findings": sum(findings_by_severity.values()),
    }
