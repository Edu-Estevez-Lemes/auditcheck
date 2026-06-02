"""
AUDITCHECK — Lanzador RDP nativo

Ejecuta cmdkey + mstsc directamente en la máquina local donde corre el backend.
Diseñado para despliegue self-hosted: el backend corre en la misma máquina
que el técnico, por lo que puede lanzar aplicaciones Windows directamente.

Flujo:
  1. Frontend llama POST /rdp/launch con {audit_id, device_id}
  2. Backend obtiene IP + credenciales de la BD (la contraseña nunca sale del backend)
  3. Backend ejecuta: cmdkey /generic:TERMSRV/{ip} /user:{user} /pass:{pass}
  4. Backend crea .rdp temporal sin contraseña en disco
  5. Backend lanza: mstsc.exe {rdp_file}  (proceso independiente, no bloqueante)
  6. Backend elimina .rdp temporal tras 8 s en segundo plano
  7. Responde {launched: true, message: ...}

Si el backend no corre en Windows (caso poco probable para esta herramienta),
devuelve 501 y el frontend ofrece descargar el .ps1 alternativo.
"""
from __future__ import annotations

import os
import sys
import subprocess
import tempfile
import threading
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.device import Device
from ..models.credential import Credential
from ..services.auth import get_current_user
from ..services.credential import get_decrypted_password
from ..models.user import User

router = APIRouter(prefix="/rdp", tags=["RDP"])

# Opciones .rdp sin contraseña en disco — authentication level:i:0 elimina aviso
# de certificado desconocido en redes internas (LAN).
_RDP_OPTIONS = [
    "prompt for credentials:i:0",
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


def _schedule_delete(path: str, delay: int = 8) -> None:
    """Elimina un archivo tras un retardo en un hilo daemon."""
    def _worker():
        time.sleep(delay)
        try:
            os.remove(path)
        except OSError:
            pass
    threading.Thread(target=_worker, daemon=True).start()


class LaunchRequest(BaseModel):
    audit_id: int
    device_id: int


@router.post("/launch")
def launch_rdp(
    req: LaunchRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Lanza una sesión RDP desde el backend local:
    - Registra credencial en Windows Credential Manager (cmdkey) — la contraseña
      nunca se escribe en disco ni se devuelve al frontend.
    - Crea .rdp temporal (solo parámetros, sin contraseña).
    - Lanza mstsc.exe de forma no bloqueante.
    - Limpia el .rdp temporal en 8 s.

    Requiere Windows. Si el backend corre en otro SO, devuelve 501 y el
    frontend ofrece el .ps1 como alternativa.
    """
    if sys.platform != "win32":
        raise HTTPException(
            status_code=501,
            detail=(
                "El lanzamiento RDP directo solo está disponible cuando el backend "
                "corre en Windows. Usa el botón de descarga del script .ps1."
            ),
        )

    device = db.query(Device).filter(
        Device.id == req.device_id,
        Device.audit_id == req.audit_id,
    ).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    ip = device.ip_address
    username = domain = password = ""

    if device.credential_id:
        cred = db.query(Credential).filter(Credential.id == device.credential_id).first()
        if cred:
            username = cred.username or ""
            domain = cred.domain or ""
            password = get_decrypted_password(db, device.credential_id) or ""

    sysroot = os.environ.get("SystemRoot", r"C:\Windows")
    cmdkey_exe = os.path.join(sysroot, "System32", "cmdkey.exe")
    mstsc_exe = os.path.join(sysroot, "System32", "mstsc.exe")

    if not os.path.exists(mstsc_exe):
        raise HTTPException(
            status_code=501,
            detail="mstsc.exe no encontrado. ¿Está ejecutando Windows con Remote Desktop habilitado?",
        )

    # ── 1. Registrar credencial en Windows Credential Manager ─────────────────
    # La contraseña se pasa como argumento de proceso (nunca en disco).
    # TERMSRV/{ip} es el target que mstsc.exe consulta automáticamente.
    if username and password:
        full_user = f"{domain}\\{username}" if domain else username
        target = f"TERMSRV/{ip}"
        try:
            subprocess.run(
                [cmdkey_exe, f"/generic:{target}", f"/user:{full_user}", f"/pass:{password}"],
                capture_output=True,
                timeout=10,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            # cmdkey no disponible o timeout → mstsc pedirá credenciales manualmente
            pass

    # ── 2. Crear .rdp temporal (sin contraseña en disco) ──────────────────────
    rdp_lines = [f"full address:s:{ip}"]
    if username:
        rdp_lines.append(f"username:s:{username}")
    if domain:
        rdp_lines.append(f"domain:s:{domain}")
    rdp_lines.extend(_RDP_OPTIONS)

    tmp_dir = os.environ.get("TEMP") or tempfile.gettempdir()
    fd, rdp_path = tempfile.mkstemp(
        suffix=".rdp",
        prefix=f"ac_{ip.replace('.', '_')}_",
        dir=tmp_dir,
    )
    try:
        with os.fdopen(fd, "w", encoding="ascii", newline="\r\n") as f:
            for line in rdp_lines:
                f.write(line + "\r\n")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error creando archivo RDP temporal: {exc}")

    # ── 3. Lanzar mstsc.exe (proceso independiente, no bloqueante) ────────────
    # DETACHED_PROCESS (0x8) | CREATE_NEW_PROCESS_GROUP (0x200) garantiza que
    # mstsc no quede asociado al proceso Python y sobreviva si el backend se reinicia.
    _DETACHED = 0x00000008
    _NEW_GROUP = 0x00000200
    try:
        subprocess.Popen(
            [mstsc_exe, rdp_path],
            close_fds=True,
            creationflags=_DETACHED | _NEW_GROUP,
        )
    except OSError as exc:
        os.remove(rdp_path)
        raise HTTPException(status_code=500, detail=f"No se pudo lanzar mstsc.exe: {exc}")

    # ── 4. Limpiar .rdp temporal en segundo plano ──────────────────────────────
    _schedule_delete(rdp_path, delay=8)

    cred_info = f" ({username})" if username else ""
    return {
        "launched": True,
        "ip": ip,
        "has_credentials": bool(username),
        "message": f"Conectando a {ip}{cred_info}...",
    }
