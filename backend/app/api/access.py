"""
AUDITCHECK — Acceso web asistido

Proporciona las credenciales descifradas para el panel de acceso web del frontend.
La contraseña se devuelve al usuario autenticado para facilitar el login manual.

Nunca se registra en logs de servidor ni se exporta a informes.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.device import Device
from ..models.credential import Credential
from ..models.login_profile import LoginProfile
from ..services.auth import get_current_user
from ..services.credential import get_decrypted_password
from ..models.user import User

router = APIRouter(prefix="/access", tags=["Acceso Web"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class WebCredRequest(BaseModel):
    audit_id: int
    device_id: int


class LoginProfileOut(BaseModel):
    id: int
    name: str
    device_type: str
    url_pattern: str | None
    username_selector: str | None
    password_selector: str | None
    submit_selector: str | None
    pre_login_path: str | None
    notes: str | None
    is_active: bool

    model_config = {"from_attributes": True}


class LoginProfileCreate(BaseModel):
    name: str
    device_type: str
    url_pattern: str | None = None
    username_selector: str | None = None
    password_selector: str | None = None
    submit_selector: str | None = None
    pre_login_path: str | None = None
    custom_script: str | None = None
    notes: str | None = None
    is_active: bool = True


class LoginProfileUpdate(BaseModel):
    name: str | None = None
    username_selector: str | None = None
    password_selector: str | None = None
    submit_selector: str | None = None
    pre_login_path: str | None = None
    url_pattern: str | None = None
    custom_script: str | None = None
    notes: str | None = None
    is_active: bool | None = None


# ── Credenciales web (Fase 1) ──────────────────────────────────────────────────

@router.post("/web-credentials")
def get_web_credentials(
    req: WebCredRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Devuelve las credenciales descifradas para facilitar el acceso web manual.

    - Requiere autenticación JWT (solo técnicos de AUDITCHECK).
    - La contraseña se descifra internamente y se devuelve UNA sola vez al frontend.
    - No se registra en logs. No se exporta en informes.
    - El frontend la muestra en el panel y la descarta al cerrar.

    También devuelve el perfil de login del dispositivo (si existe) para mostrar
    los selectores CSS como hints para autorrellenar o automatización futura.
    """
    device = db.query(Device).filter(
        Device.id == req.device_id,
        Device.audit_id == req.audit_id,
    ).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    if not device.credential_id:
        raise HTTPException(status_code=404, detail="Este dispositivo no tiene credencial asignada")

    cred = db.query(Credential).filter(Credential.id == device.credential_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credencial no encontrada")

    password = get_decrypted_password(db, device.credential_id) or ""

    # Buscar perfil de login por device_type (activo, primer resultado)
    profile = db.query(LoginProfile).filter(
        LoginProfile.device_type == device.device_type,
        LoginProfile.is_active == True,
    ).first()

    return {
        "credential_name": cred.name,
        "username": cred.username or "",
        "domain": cred.domain or "",
        "password": password,
        "has_password": bool(password),
        "login_profile": {
            "id": profile.id,
            "name": profile.name,
            "device_type": profile.device_type,
            "username_selector": profile.username_selector,
            "password_selector": profile.password_selector,
            "submit_selector": profile.submit_selector,
            "pre_login_path": profile.pre_login_path,
            "notes": profile.notes,
        } if profile else None,
    }


# ── Perfiles de login (Fase 2 / 3) ────────────────────────────────────────────

@router.get("/login-profiles", response_model=list[LoginProfileOut])
def list_login_profiles(
    device_type: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Lista todos los perfiles de login, opcionalmente filtrados por device_type."""
    q = db.query(LoginProfile)
    if device_type:
        q = q.filter(LoginProfile.device_type == device_type)
    return [LoginProfileOut.model_validate(p) for p in q.order_by(LoginProfile.name).all()]


@router.post("/login-profiles", response_model=LoginProfileOut, status_code=201)
def create_login_profile(
    data: LoginProfileCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    profile = LoginProfile(**data.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return LoginProfileOut.model_validate(profile)


@router.put("/login-profiles/{profile_id}", response_model=LoginProfileOut)
def update_login_profile(
    profile_id: int,
    data: LoginProfileUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    profile = db.query(LoginProfile).filter(LoginProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return LoginProfileOut.model_validate(profile)


@router.delete("/login-profiles/{profile_id}", status_code=204)
def delete_login_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    profile = db.query(LoginProfile).filter(LoginProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    db.delete(profile)
    db.commit()
