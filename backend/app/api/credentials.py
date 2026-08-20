from __future__ import annotations
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.credential import CredentialCreate, CredentialUpdate, CredentialOut, CredentialTestRequest
from ..services.credential import (
    list_credentials, create_credential, update_credential,
    delete_credential, get_credential_or_404, test_credential,
)
from ..services.auth import get_current_user
from ..models.user import User

router = APIRouter(prefix="/credentials", tags=["Credenciales"])


@router.get("/", response_model=list[CredentialOut])
def get_all(
    client_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return list_credentials(db, client_id)


@router.post("/", response_model=CredentialOut, status_code=201)
def create(data: CredentialCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return create_credential(db, data)


@router.put("/{cred_id}", response_model=CredentialOut)
def update(cred_id: int, data: CredentialUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return update_credential(db, cred_id, data)


@router.delete("/{cred_id}", status_code=204)
def delete(cred_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    delete_credential(db, cred_id)


@router.get("/{cred_id}/password")
def get_password(cred_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    cred = get_credential_or_404(db, cred_id)
    if not cred.encrypted_password:
        return {"password": None}
    from ..utils.crypto import decrypt_secret
    return {"password": decrypt_secret(cred.encrypted_password)}


@router.post("/{cred_id}/test")
def test(
    cred_id: int,
    data: CredentialTestRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return test_credential(db, cred_id, data.host, data.port)
