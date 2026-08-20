from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.audit import AuditCreate, AuditUpdate, AuditOut, AuditSummary
from ..schemas.device import DeviceOut, DeviceUpdate, PortOut
from ..schemas.credential import CredentialOut
from ..schemas.finding import FindingCreate, FindingUpdate, FindingOut
from ..services.audit import list_audits, create_audit, get_audit, update_audit, delete_audit
from ..services.comparison import compare_audits
from ..schemas.network_map import NetworkMapOut
from ..services.network_map import build_network_map
from pydantic import BaseModel
from ..services.auth import get_current_user, get_admin_user
from ..models.audit import Audit
from ..models.device import Device, Port, DeviceKnowledge
from ..models.credential import Credential
from ..models.finding import Finding
from ..models.user import User
from ..reports.excel import generate_excel_report, generate_comparison_excel_report
from ..config import settings

router = APIRouter(prefix="/audits", tags=["Auditorías"])


class _BatchDeleteBody(BaseModel):
    ids: list[int]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _enrich_device(db: Session, device: Device) -> DeviceOut:
    """Construye DeviceOut enriquecido con puertos y datos de credencial."""
    ports = db.query(Port).filter(Port.device_id == device.id).all()
    out = DeviceOut.model_validate(device)
    out.ports = [PortOut.model_validate(p) for p in ports]

    if device.credential_id:
        cred = db.query(Credential).filter(Credential.id == device.credential_id).first()
        if cred:
            out.credential_name = cred.name
            out.credential_username = cred.username
            out.credential_domain = cred.domain

    return out


def _sync_knowledge(db: Session, device: Device, audit_id: int, fields: list[str]) -> None:
    """Propaga campos editados al registro de knowledge persistente."""
    knowledge = db.query(DeviceKnowledge).filter(
        DeviceKnowledge.client_id == device.client_id,
        DeviceKnowledge.ip_address == device.ip_address,
    ).first()

    if knowledge:
        for field in fields:
            val = getattr(device, field, None)
            if val is not None:
                setattr(knowledge, field, val)
            # credential_id puede ser None explícitamente (desasignar)
            if field == 'credential_id':
                knowledge.credential_id = device.credential_id
        db.commit()
    else:
        knowledge = DeviceKnowledge(
            client_id=device.client_id,
            ip_address=device.ip_address,
            mac_address=device.mac_address,
            last_seen_audit_id=audit_id,
            times_seen=1,
        )
        for field in fields:
            if hasattr(knowledge, field):
                setattr(knowledge, field, getattr(device, field, None))
        db.add(knowledge)
        db.commit()


# ── Endpoints de auditorías ────────────────────────────────────────────────────

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


@router.delete("/batch", status_code=204)
def batch_delete(body: _BatchDeleteBody, db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    audits_to_delete = db.query(Audit).filter(Audit.id.in_(body.ids)).all()
    for audit in audits_to_delete:
        db.delete(audit)
    db.commit()


@router.delete("/{audit_id}", status_code=204)
def delete(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    delete_audit(db, audit_id)


# ── Credenciales del cliente de la auditoría ───────────────────────────────────

@router.get("/{audit_id}/client-credentials", response_model=list[CredentialOut])
def get_client_credentials(
    audit_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Devuelve todas las credenciales del cliente al que pertenece esta auditoría."""
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")
    creds = db.query(Credential).filter(Credential.client_id == audit.client_id).all()
    return [CredentialOut.model_validate(c) for c in creds]


# ── Dispositivos ───────────────────────────────────────────────────────────────

@router.get("/{audit_id}/devices", response_model=list[DeviceOut])
def get_devices(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    devices = db.query(Device).filter(Device.audit_id == audit_id).all()
    return [_enrich_device(db, d) for d in devices]


@router.put("/{audit_id}/devices/{device_id}", response_model=DeviceOut)
def update_device(
    audit_id: int, device_id: int, data: DeviceUpdate,
    db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    device = db.query(Device).filter(Device.id == device_id, Device.audit_id == audit_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    changed_fields: list[str] = []
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
        changed_fields.append(field)

    device.manually_edited = True
    db.commit()
    db.refresh(device)

    knowledge_fields = [
        f for f in changed_fields
        if f in ("display_name", "device_type", "custom_category", "manufacturer",
                 "os_type", "location", "description", "observations", "credential_id")
    ]
    if knowledge_fields:
        _sync_knowledge(db, device, audit_id, knowledge_fields)

    return _enrich_device(db, device)


def _rdp_base_lines(ip: str, prompt_creds: bool = True) -> list[str]:
    """Líneas .rdp comunes a todos los tipos de archivo generado."""
    return [
        f"full address:s:{ip}",
        f"prompt for credentials:i:{'0' if not prompt_creds else '1'}",
        # authentication level:i:0 → no valida certificado del servidor.
        # Elimina el aviso "conexión remota desconocida" en redes internas (LAN).
        # Si necesitas validación de cert (mayor seguridad), cambia a :i:2.
        "authentication level:i:0",
        "enablecredsspsupport:i:1",
        "session bpp:i:32",
        "compression:i:1",
        "keyboardhook:i:2",
        "connection type:i:7",
        "networkautodetect:i:1",
        "bandwidthautodetect:i:1",
        "displayconnectionbar:i:1",
        "autoreconnection enabled:i:1",
        "redirectclipboard:i:1",
        "redirectprinters:i:0",
        "redirectsmartcards:i:0",
        "bitmapcachepersistenable:i:1",
    ]


def _make_rdp_response(ip: str, label: str, username: str = "", domain: str = "") -> Response:
    """Genera la respuesta HTTP con el archivo .rdp básico (sin contraseña)."""
    lines = _rdp_base_lines(ip, prompt_creds=not bool(username))
    if username:
        lines.append(f"username:s:{username}")
    if domain:
        lines.append(f"domain:s:{domain}")
    content = "\r\n".join(lines) + "\r\n"
    return Response(
        content=content.encode("utf-8"),
        media_type="application/x-rdp",
        headers={"Content-Disposition": f'attachment; filename="{label}.rdp"'},
    )


def _build_rdp_ps1(ip: str, username: str, domain: str, password: str, label: str) -> str:
    """
    Genera un script PowerShell de un solo uso que:
      1. Registra la credencial en Windows Credential Manager (cmdkey)
      2. Crea un .rdp temporal con configuración óptima
      3. Lanza mstsc (sin diálogos de credenciales)
      4. Elimina el .rdp temporal y se auto-elimina

    SEGURIDAD: La contraseña aparece en texto plano en este script durante los
    segundos que tarda en ejecutarse y auto-borrarse. Se transmite vía HTTPS.
    Nunca se guarda en el .rdp ni queda almacenada en AUDITCHECK en claro.
    Para limpiar Credential Manager: cmdkey /delete:TERMSRV/{ip}
    """
    from datetime import datetime as _dt
    date_str = _dt.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    def _ps_sq(s: str) -> str:
        """Escapa para string single-quoted de PowerShell: ' → ''"""
        return s.replace("'", "''")

    full_user = f"{domain}\\{username}" if domain else username

    rdp_lines = _rdp_base_lines(ip, prompt_creds=False)
    if username:
        rdp_lines.append(f"username:s:{username}")
    if domain:
        rdp_lines.append(f"domain:s:{domain}")

    # Array PowerShell de líneas .rdp (single-quoted → seguro con cualquier char)
    rdp_array = "\n".join(f"        '{_ps_sq(line)}'" for line in rdp_lines)

    return f"""\
# ================================================================
# AUDITCHECK RDP Launcher — {label}
# IP: {ip}  |  Generado: {date_str}
# ================================================================
# AVISO DE SEGURIDAD: Este script contiene credenciales temporales.
# Se elimina automaticamente al ejecutarse.
# No lo distribuyas, reenvies ni almacenes.
# Para limpiar Credential Manager tras la sesion:
#   cmdkey /delete:TERMSRV/{ip}
# ================================================================
param()
$ErrorActionPreference = 'SilentlyContinue'
$ScriptPath = $MyInvocation.MyCommand.Path

$TargetIP  = '{_ps_sq(ip)}'
$FullUser  = '{_ps_sq(full_user)}'
$RdpPass   = '{_ps_sq(password)}'
$CmTarget  = 'TERMSRV/' + $TargetIP
$RdpFile   = "$env:TEMP\\ac_$TargetIP.rdp"

try {{
    # 1 — Registrar credencial en Windows Credential Manager
    #     Usa concatenacion de argumentos para soportar cualquier caracter en la contrasena
    & cmdkey ('/generic:' + $CmTarget) ('/user:' + $FullUser) ('/pass:' + $RdpPass) | Out-Null
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {{
        Write-Warning "cmdkey: codigo $LASTEXITCODE. mstsc puede pedir credenciales."
    }}

    # 2 — Crear .rdp temporal con configuracion optima (sin aviso de certificado)
    $rdpLines = @(
{rdp_array}
    )
    $rdpLines | Out-File -FilePath $RdpFile -Encoding ASCII -Force

    # 3 — Lanzar mstsc
    Start-Process -FilePath 'mstsc.exe' -ArgumentList "`"$RdpFile`""

    # 4 — Esperar a que mstsc cargue el .rdp y eliminar el archivo temporal
    Start-Sleep -Seconds 7
    Remove-Item -LiteralPath $RdpFile -Force

}} catch {{
    Write-Error "Error al lanzar RDP: $_"
    $null = Read-Host 'Pulsa Enter para cerrar'
}} finally {{
    # 5 — Auto-eliminar este script
    Start-Sleep -Seconds 1
    if ($ScriptPath -and (Test-Path -LiteralPath $ScriptPath)) {{
        Remove-Item -LiteralPath $ScriptPath -Force
    }}
}}
"""


@router.get("/{audit_id}/devices/{device_id}/rdp")
def get_rdp_file(
    audit_id: int, device_id: int,
    db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    """Archivo .rdp básico (sin contraseña). Usado cuando no hay credencial asignada."""
    device = db.query(Device).filter(Device.id == device_id, Device.audit_id == audit_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    ip = device.ip_address
    label = (device.display_name or device.hostname or ip).replace(" ", "_").replace("/", "_")[:40]

    username = ""
    domain = ""
    if device.credential_id:
        cred = db.query(Credential).filter(Credential.id == device.credential_id).first()
        if cred:
            username = cred.username or ""
            domain = cred.domain or ""

    return _make_rdp_response(ip, label, username, domain)


@router.get("/{audit_id}/devices/{device_id}/rdp-launch")
def get_rdp_launch(
    audit_id: int, device_id: int,
    db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    """
    Si hay credencial asignada: devuelve script .ps1 que usa cmdkey + mstsc.
    Si no hay credencial: devuelve el .rdp básico con configuración óptima.
    """
    device = db.query(Device).filter(Device.id == device_id, Device.audit_id == audit_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    ip = device.ip_address
    label = (device.display_name or device.hostname or ip).replace(" ", "_").replace("/", "_")[:40]

    if not device.credential_id:
        return _make_rdp_response(ip, label)

    cred = db.query(Credential).filter(Credential.id == device.credential_id).first()
    if not cred:
        return _make_rdp_response(ip, label)

    from ..services.credential import get_decrypted_password
    password = get_decrypted_password(db, device.credential_id) or ""
    username = cred.username or ""
    domain = cred.domain or ""

    if not username and not password:
        return _make_rdp_response(ip, label)

    script = _build_rdp_ps1(ip, username, domain, password, label)
    return Response(
        content=script.encode("utf-8"),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="RDP_{label}.ps1"'},
    )


# ── Mapa de Red ────────────────────────────────────────────────────────────────

@router.get("/{audit_id}/network-map", response_model=NetworkMapOut)
def get_network_map(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")
    return build_network_map(db, audit_id)


# ── Hallazgos ──────────────────────────────────────────────────────────────────

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


# ── Informe Excel ──────────────────────────────────────────────────────────────

@router.get("/{audit_id}/report/excel")
def download_excel(audit_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    import datetime as dt
    from ..models.client import Client

    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")

    client = db.query(Client).filter(Client.id == audit.client_id).first()
    client_name = (client.name or "cliente").replace(" ", "_") if client else "cliente"
    date_str = dt.datetime.utcnow().strftime("%Y-%m-%d")
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


# ── Comparativa ────────────────────────────────────────────────────────────────

@router.get("/compare/{audit_a_id}/{audit_b_id}")
def compare(
    audit_a_id: int, audit_b_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = compare_audits(db, audit_a_id, audit_b_id)
    return result.to_dict()


@router.get("/compare/{audit_a_id}/{audit_b_id}/excel")
def compare_excel(
    audit_a_id: int, audit_b_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    import datetime as dt
    from ..models.client import Client

    audit_a = db.query(Audit).filter(Audit.id == audit_a_id).first()
    audit_b = db.query(Audit).filter(Audit.id == audit_b_id).first()
    if not audit_a or not audit_b:
        raise HTTPException(status_code=404, detail="Una o ambas auditorías no existen")

    client = db.query(Client).filter(Client.id == audit_b.client_id).first()
    client_name = (client.name or "cliente").replace(" ", "_") if client else "cliente"
    date_str = dt.datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"AUDITCHECK_Comparativa_{date_str}_{client_name}.xlsx"
    output_path = settings.AUDITS_DIR / str(audit_b_id) / filename

    try:
        generate_comparison_excel_report(db, audit_a_id, audit_b_id, output_path=output_path)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Error generando el informe comparativo")

    return FileResponse(
        str(output_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )
