"""Endpoint para subir branding corporativo vía la UI."""
from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..services.auth import get_admin_user, get_current_user
from ..models.user import User
from ..models.report_branding import ReportBrandingConfig
from ..schemas.report_branding import ReportBrandingOut, ReportBrandingUpdate
from ..reports.report_branding import get_report_colors

router = APIRouter(prefix="/branding", tags=["Branding"])


@router.post("/logo")
async def upload_logo(file: UploadFile = File(...), _: User = Depends(get_admin_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen PNG")
    content = await file.read()
    path = settings.BRANDING_DIR / "logo.png"
    path.write_bytes(content)
    return {"message": "Logo corporativo actualizado"}


@router.post("/icon")
async def upload_icon(file: UploadFile = File(...), _: User = Depends(get_admin_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen PNG")
    content = await file.read()
    path = settings.BRANDING_DIR / "icon.png"
    path.write_bytes(content)
    return {"message": "Icono corporativo actualizado"}


@router.post("/report-logo")
async def upload_report_logo(file: UploadFile = File(...), _: User = Depends(get_admin_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen PNG")
    content = await file.read()
    path = settings.BRANDING_DIR / "report_logo.png"
    path.write_bytes(content)
    return {"message": "Logo de informes actualizado"}


@router.get("/report-config", response_model=ReportBrandingOut)
def get_report_config(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    colors = get_report_colors(db)
    return ReportBrandingOut(
        header_color=colors["header"], accent_color=colors["accent"], separator_color=colors["separator"],
    )


@router.put("/report-config", response_model=ReportBrandingOut)
def update_report_config(
    data: ReportBrandingUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    config = db.query(ReportBrandingConfig).filter(ReportBrandingConfig.id == 1).first()
    if not config:
        config = ReportBrandingConfig(id=1)
        db.add(config)
    config.header_color = data.header_color
    config.accent_color = data.accent_color
    config.separator_color = data.separator_color
    db.commit()
    db.refresh(config)
    return ReportBrandingOut.model_validate(config)
