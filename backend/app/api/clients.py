from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.client import ClientCreate, ClientUpdate, ClientOut, ClientSummary, IPRangeCreate, IPRangeOut
from ..services.client import (
    list_clients, get_client_or_404, get_clients_summary,
    create_client, update_client, delete_client,
    add_ip_range, delete_ip_range,
)
from ..services.auth import get_current_user, require_role
from ..models.user import User
from ..config import settings

router = APIRouter(prefix="/clients", tags=["Clientes"])


@router.get("/", response_model=list[ClientSummary])
def get_clients(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return get_clients_summary(db)


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return get_client_or_404(db, client_id)


@router.post("/", response_model=ClientOut, status_code=201)
def create(data: ClientCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return create_client(db, data)


@router.put("/{client_id}", response_model=ClientOut)
def update(client_id: int, data: ClientUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return update_client(db, client_id, data)


@router.delete("/{client_id}", status_code=204)
def delete(client_id: int, db: Session = Depends(get_db), _: User = Depends(require_role("superadmin", "admin"))):
    delete_client(db, client_id)


@router.post("/{client_id}/logo", status_code=200)
async def upload_logo(
    client_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    client = get_client_or_404(db, client_id)
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")

    logo_dir = settings.CLIENTS_DIR / str(client_id)
    logo_dir.mkdir(parents=True, exist_ok=True)
    logo_path = logo_dir / "logo.png"

    content = await file.read()
    logo_path.write_bytes(content)

    client.logo_path = str(logo_path)
    db.commit()
    return {"message": "Logo actualizado", "path": str(logo_path)}


@router.get("/{client_id}/logo")
def get_client_logo(client_id: int, db: Session = Depends(get_db)):
    client = get_client_or_404(db, client_id)
    if client.logo_path and Path(client.logo_path).exists():
        return FileResponse(client.logo_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Logo no encontrado")


# Rangos IP
@router.get("/{client_id}/ip-ranges", response_model=list[IPRangeOut])
def get_ip_ranges(client_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    client = get_client_or_404(db, client_id)
    return client.ip_ranges


@router.post("/{client_id}/ip-ranges", response_model=IPRangeOut, status_code=201)
def add_range(
    client_id: int, data: IPRangeCreate,
    db: Session = Depends(get_db), _: User = Depends(get_current_user)
):
    return add_ip_range(db, client_id, data.range, data.description)


@router.delete("/{client_id}/ip-ranges/{range_id}", status_code=204)
def delete_range(client_id: int, range_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    delete_ip_range(db, range_id, client_id)
