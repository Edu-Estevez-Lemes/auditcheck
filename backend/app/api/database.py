from __future__ import annotations
import os
import platform
import tempfile
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import settings
from ..schemas.database_ops import BackupOut, DatabaseInfoOut, ExportRequest, ImportPreviewOut
from ..services import backup as backup_service
from ..services import acbk, database_export, database_import
from ..services import vault as vault_service
from ..services.auth import get_current_user
from ..services.audit_log import log_action
from ..models.user import User
from ..models.client import Client
from ..models.audit import Audit
from ..models.device import Device
from ..models.finding import Finding

router = APIRouter(prefix="/database", tags=["Base de Datos"])


# ── 3.1 Backup ───────────────────────────────────────────────────────────

@router.post("/backup", response_model=BackupOut)
def create_backup(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = backup_service.create_backup()
    log_action(db, current_user, "create_backup", target_type="database", details={"path": result["path"]}, request=request)
    return result


@router.get("/backups", response_model=list[BackupOut])
def list_backups(_: User = Depends(get_current_user)):
    return backup_service.list_backups()


@router.get("/info", response_model=DatabaseInfoOut)
def database_info(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    last_backup = backup_service.last_backup_at()
    backups = backup_service.list_backups()
    return DatabaseInfoOut(
        db_path=str(settings.DB_FILE_PATH),
        db_size=settings.DB_FILE_PATH.stat().st_size if settings.DB_FILE_PATH.exists() else 0,
        clients_count=db.query(Client).count(),
        audits_count=db.query(Audit).count(),
        devices_count=db.query(Device).count(),
        findings_count=db.query(Finding).count(),
        last_backup_at=last_backup.isoformat() if last_backup else None,
        backups_total_size=sum(b["size"] for b in backups),
        backups_count=len(backups),
    )


def _open_folder(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if platform.system() == "Windows":
        os.startfile(str(path))  # noqa: S606 — apertura de carpeta local, no ejecución de código externo


@router.post("/open-backups-folder")
def open_backups_folder(_: User = Depends(get_current_user)):
    _open_folder(settings.BACKUPS_DIR)
    return {"path": str(settings.BACKUPS_DIR)}


@router.post("/open-exports-folder")
def open_exports_folder(_: User = Depends(get_current_user)):
    _open_folder(settings.EXPORTS_DIR)
    return {"path": str(settings.EXPORTS_DIR)}


# ── 3.2 Exportación cifrada ──────────────────────────────────────────────

@router.post("/export")
def export_database(
    request: Request,
    data: ExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.password_mode == "vault":
        if not vault_service.verify_passphrase(db, data.password):
            raise HTTPException(status_code=400, detail="Passphrase del vault incorrecta")
    else:
        if data.password != data.confirm_password:
            raise HTTPException(status_code=400, detail="Las contraseñas no coinciden")

    if data.client_ids is None:
        payload_db_path = database_export.build_full_export_db()
    else:
        payload_db_path = database_export.build_selective_export_db(db, data.client_ids, data.include_credentials)

    header = database_export.build_export_header(db, data.client_ids, data.include_credentials, current_user.email)

    export_type = header["export_type"]
    dest = settings.EXPORTS_DIR / f"auditcheck_export_{export_type}_{datetime.now():%Y-%m-%d_%H%M%S}.acbk"
    acbk.pack(payload_db_path, dest, data.password, header)

    log_action(db, current_user, "export_database", target_type="database",
               details={"export_type": export_type, "client_ids": data.client_ids,
                        "includes_credentials": data.include_credentials}, request=request)

    return FileResponse(str(dest), media_type="application/octet-stream", filename=dest.name)


# ── 3.3 Importación y restauración ───────────────────────────────────────

@router.post("/import/preview", response_model=ImportPreviewOut)
async def import_preview(
    file: UploadFile = File(...),
    _: User = Depends(get_current_user),
):
    tmp = Path(tempfile.mkdtemp()) / "upload.acbk"
    tmp.write_bytes(await file.read())
    try:
        header = database_import.read_preview(tmp)
    except database_import.ImportError_ as e:
        raise HTTPException(status_code=400, detail=str(e))
    return header


@router.post("/import/confirm")
async def import_confirm(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form(...),
    mode: str = Form(...),  # "restore" | "merge" | "replace"
    include_credentials: bool = Form(True),
    confirm_word: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if mode not in ("restore", "merge", "replace"):
        raise HTTPException(status_code=400, detail="Modo de importación inválido")
    if mode == "restore" and confirm_word != "RESTAURAR":
        raise HTTPException(status_code=400, detail="Debes escribir la palabra RESTAURAR para confirmar")

    upload_path = Path(tempfile.mkdtemp()) / "upload.acbk"
    upload_path.write_bytes(await file.read())

    try:
        header = database_import.read_preview(upload_path)
    except database_import.ImportError_ as e:
        raise HTTPException(status_code=400, detail=str(e))

    if mode == "restore" and header.get("export_type") != "full":
        raise HTTPException(status_code=400, detail="Solo se puede restaurar por completo una exportación completa")

    try:
        payload_path = database_import.decrypt_to_temp(upload_path, password)
    except database_import.ImportError_ as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Backup automático de la BD actual, sin excepción, antes de tocar nada
    backup_result = backup_service.create_backup()

    try:
        if mode == "restore":
            # Cierra la conexión de esta misma request antes del reemplazo de fichero:
            # en Windows, SQLite mantiene bloqueado el .db-wal mientras haya una
            # conexión (aunque esté en el pool) abierta sobre la BD antigua.
            db.close()
            database_import.restore_full(payload_path)
            summary = {"mode": "restore"}
        else:
            summary = database_import.merge_or_replace(payload_path, mode, include_credentials)
            summary["mode"] = mode
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Fallo al importar, backup de seguridad conservado en {backup_result['path']}: {e}",
        )

    log_action(
        db, current_user, "import_database", target_type="database",
        details={"mode": mode, "backup_path": backup_result["path"], "summary": summary}, request=request,
    )
    return {"message": "Importación completada", "backup_path": backup_result["path"], **summary}
