"""Endpoint para subir branding corporativo vía la UI."""
from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse

from ..config import settings
from ..services.auth import get_admin_user
from ..models.user import User

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
