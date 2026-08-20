from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.vault import (
    VaultStatusOut, VaultSetupRequest, VaultUnlockRequest,
    VaultChangeRequest, VaultMigrateRequest,
)
from ..services import vault as vault_service
from ..services.auth import get_current_user, require_role
from ..services.audit_log import log_action
from ..models.user import User

router = APIRouter(prefix="/vault", tags=["Vault"])


@router.get("/status", response_model=VaultStatusOut)
def get_status(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return vault_service.status(db)


@router.post("/setup")
def setup(
    request: Request,
    data: VaultSetupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("superadmin")),
):
    if data.passphrase != data.confirm_passphrase:
        raise HTTPException(status_code=400, detail="Las passphrases no coinciden")
    try:
        vault_service.setup(db, data.passphrase)
    except vault_service.VaultError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_action(db, current_user, "vault_setup", target_type="vault", request=request)
    return {"message": "Vault configurado y desbloqueado"}


@router.post("/unlock")
def unlock(
    request: Request,
    data: VaultUnlockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not vault_service.unlock(db, data.passphrase):
        log_action(db, current_user, "vault_unlock_failed", target_type="vault", request=request)
        raise HTTPException(status_code=401, detail="Passphrase incorrecta")
    log_action(db, current_user, "vault_unlock", target_type="vault", request=request)
    return {"message": "Vault desbloqueado"}


@router.post("/lock")
def lock(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vault_service.lock()
    log_action(db, current_user, "vault_lock", target_type="vault", request=request)
    return {"message": "Vault bloqueado"}


@router.post("/migrate-legacy")
def migrate_legacy(
    request: Request,
    data: VaultMigrateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("superadmin")),
):
    if data.new_passphrase != data.confirm_passphrase:
        raise HTTPException(status_code=400, detail="Las passphrases no coinciden")
    try:
        vault_service.migrate_legacy_vault(db, data.new_passphrase)
    except vault_service.VaultError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_action(db, current_user, "vault_migrate_legacy", target_type="vault", request=request)
    return {"message": "Migración completada. El vault ahora usa la passphrase maestra."}


@router.post("/change-passphrase")
def change_passphrase(
    request: Request,
    data: VaultChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("superadmin")),
):
    if data.new_passphrase != data.confirm_passphrase:
        raise HTTPException(status_code=400, detail="Las passphrases no coinciden")
    try:
        vault_service.change_passphrase(db, data.current_passphrase, data.new_passphrase)
    except vault_service.VaultError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log_action(db, current_user, "vault_change_passphrase", target_type="vault", request=request)
    return {"message": "Passphrase cambiada. Todas las credenciales se han re-cifrado."}
