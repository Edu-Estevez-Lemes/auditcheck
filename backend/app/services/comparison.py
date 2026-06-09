"""
Servicio de comparación entre dos revisiones de auditoría.
Detecta cambios, nuevos elementos, elementos desaparecidos y evolución de riesgos.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from sqlalchemy.orm import Session

from ..models.audit import Audit
from ..models.device import Device, Port
from ..models.finding import Finding


@dataclass
class DeviceChange:
    ip: str
    change_type: str  # new, removed, changed
    hostname_before: str | None = None
    hostname_after: str | None = None
    new_ports: list[int] = field(default_factory=list)
    removed_ports: list[int] = field(default_factory=list)
    type_before: str | None = None
    type_after: str | None = None


@dataclass
class FindingChange:
    title: str
    severity: str
    change_type: str  # new, resolved, persistent
    device_ip: str | None = None


@dataclass
class ComparisonResult:
    audit_a_id: int
    audit_b_id: int
    audit_a_name: str
    audit_b_name: str

    # Dispositivos
    new_devices: list[dict] = field(default_factory=list)
    removed_devices: list[dict] = field(default_factory=list)
    changed_devices: list[dict] = field(default_factory=list)

    new_ips: list[str] = field(default_factory=list)
    hostname_changes: list[dict] = field(default_factory=list)
    type_changes: list[dict] = field(default_factory=list)
    new_ports: list[dict] = field(default_factory=list)
    closed_ports: list[dict] = field(default_factory=list)

    devices_before: int = 0
    devices_after: int = 0

    # Hallazgos
    new_findings: list[dict] = field(default_factory=list)
    resolved_findings: list[dict] = field(default_factory=list)
    persistent_findings: list[dict] = field(default_factory=list)

    findings_before: dict = field(default_factory=dict)
    findings_after: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "audit_a_id": self.audit_a_id,
            "audit_b_id": self.audit_b_id,
            "audit_a_name": self.audit_a_name,
            "audit_b_name": self.audit_b_name,
            "new_devices": self.new_devices,
            "removed_devices": self.removed_devices,
            "changed_devices": self.changed_devices,
            "new_ips": self.new_ips,
            "hostname_changes": self.hostname_changes,
            "type_changes": self.type_changes,
            "new_ports": self.new_ports,
            "closed_ports": self.closed_ports,
            "devices_before": self.devices_before,
            "devices_after": self.devices_after,
            "new_findings": self.new_findings,
            "resolved_findings": self.resolved_findings,
            "persistent_findings": self.persistent_findings,
            "findings_before": self.findings_before,
            "findings_after": self.findings_after,
        }


def compare_audits(db: Session, audit_a_id: int, audit_b_id: int) -> ComparisonResult:
    audit_a = db.query(Audit).filter(Audit.id == audit_a_id).first()
    audit_b = db.query(Audit).filter(Audit.id == audit_b_id).first()

    if not audit_a or not audit_b:
        raise ValueError("Una o ambas auditorías no existen")

    result = ComparisonResult(
        audit_a_id=audit_a_id,
        audit_b_id=audit_b_id,
        audit_a_name=audit_a.name,
        audit_b_name=audit_b.name,
    )

    # --- Comparación de dispositivos ---
    devices_a = {d.ip_address: d for d in db.query(Device).filter(Device.audit_id == audit_a_id).all()}
    devices_b = {d.ip_address: d for d in db.query(Device).filter(Device.audit_id == audit_b_id).all()}

    result.devices_before = len(devices_a)
    result.devices_after = len(devices_b)

    ips_a = set(devices_a.keys())
    ips_b = set(devices_b.keys())

    for ip in ips_b - ips_a:
        d = devices_b[ip]
        result.new_devices.append({
            "ip": ip, "hostname": d.hostname, "device_type": d.device_type
        })
    result.new_ips = [d["ip"] for d in result.new_devices]

    for ip in ips_a - ips_b:
        d = devices_a[ip]
        result.removed_devices.append({
            "ip": ip, "hostname": d.hostname, "device_type": d.device_type
        })

    for ip in ips_a & ips_b:
        da = devices_a[ip]
        db_ = devices_b[ip]
        changes = {}

        if da.hostname != db_.hostname:
            changes["hostname"] = {"before": da.hostname, "after": db_.hostname}
            result.hostname_changes.append({
                "ip": ip, "hostname": db_.hostname,
                "before": da.hostname, "after": db_.hostname,
            })
        if da.device_type != db_.device_type:
            changes["device_type"] = {"before": da.device_type, "after": db_.device_type}
            result.type_changes.append({
                "ip": ip, "hostname": db_.hostname,
                "before": da.device_type, "after": db_.device_type,
            })

        ports_a = {p.port_number for p in db.query(Port).filter(Port.device_id == da.id).all()}
        ports_b = {p.port_number for p in db.query(Port).filter(Port.device_id == db_.id).all()}

        new_ports = sorted(ports_b - ports_a)
        removed_ports = sorted(ports_a - ports_b)

        if new_ports:
            changes["new_ports"] = new_ports
            for port in new_ports:
                result.new_ports.append({"ip": ip, "hostname": db_.hostname, "port": port})
        if removed_ports:
            changes["removed_ports"] = removed_ports
            for port in removed_ports:
                result.closed_ports.append({"ip": ip, "hostname": db_.hostname, "port": port})

        if changes:
            result.changed_devices.append({"ip": ip, "hostname": db_.hostname, "changes": changes})

    # --- Comparación de hallazgos ---
    _findings_a = db.query(Finding).filter(Finding.audit_id == audit_a_id).all()
    _findings_b = db.query(Finding).filter(Finding.audit_id == audit_b_id).all()

    for sev in ["critical", "high", "medium", "low", "informational"]:
        result.findings_before[sev] = sum(1 for f in _findings_a if f.severity == sev)
        result.findings_after[sev] = sum(1 for f in _findings_b if f.severity == sev)

    titles_a = {f.title for f in _findings_a}
    titles_b = {f.title for f in _findings_b}

    for f in _findings_b:
        if f.title not in titles_a:
            result.new_findings.append({
                "title": f.title, "severity": f.severity, "category": f.category
            })

    for f in _findings_a:
        if f.title not in titles_b:
            result.resolved_findings.append({
                "title": f.title, "severity": f.severity, "category": f.category
            })

    for f in _findings_b:
        if f.title in titles_a:
            result.persistent_findings.append({
                "title": f.title, "severity": f.severity, "category": f.category
            })

    return result
