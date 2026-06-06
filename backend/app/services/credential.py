from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException

from ..models.credential import Credential
from ..schemas.credential import CredentialCreate, CredentialUpdate, CredentialOut
from ..utils.crypto import encrypt_secret, decrypt_secret


def _to_out(cred: Credential) -> CredentialOut:
    return CredentialOut(
        id=cred.id,
        client_id=cred.client_id,
        name=cred.name,
        credential_type=cred.credential_type,
        username=cred.username,
        host=cred.host,
        port=cred.port,
        domain=cred.domain,
        notes=cred.notes,
        status=cred.status,
        is_preferred=cred.is_preferred,
        last_used=cred.last_used,
        last_validated=cred.last_validated,
        created_at=cred.created_at,
        updated_at=cred.updated_at,
        has_password=bool(cred.encrypted_password),
    )


def list_credentials(db: Session, client_id: int | None = None) -> list[CredentialOut]:
    q = db.query(Credential)
    if client_id is not None:
        q = q.filter(Credential.client_id == client_id)
    return [_to_out(c) for c in q.all()]


def get_credential_or_404(db: Session, cred_id: int) -> Credential:
    cred = db.query(Credential).filter(Credential.id == cred_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="Credencial no encontrada")
    return cred


def create_credential(db: Session, data: CredentialCreate) -> CredentialOut:
    encrypted = None
    if data.password:
        encrypted = encrypt_secret(data.password)

    cred = Credential(
        client_id=data.client_id,
        name=data.name,
        credential_type=data.credential_type,
        username=data.username,
        encrypted_password=encrypted,
        host=data.host,
        port=data.port,
        domain=data.domain,
        notes=data.notes,
        is_preferred=data.is_preferred,
        status="unknown",
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    return _to_out(cred)


def update_credential(db: Session, cred_id: int, data: CredentialUpdate) -> CredentialOut:
    cred = get_credential_or_404(db, cred_id)

    for field, value in data.model_dump(exclude_none=True).items():
        if field == "password":
            cred.encrypted_password = encrypt_secret(value) if value else None
        else:
            setattr(cred, field, value)

    db.commit()
    db.refresh(cred)
    return _to_out(cred)


def delete_credential(db: Session, cred_id: int) -> None:
    cred = get_credential_or_404(db, cred_id)
    db.delete(cred)
    db.commit()


def get_decrypted_password(db: Session, cred_id: int) -> str | None:
    """Solo para uso interno del backend. NUNCA exponer via API."""
    cred = get_credential_or_404(db, cred_id)
    if not cred.encrypted_password:
        return None
    return decrypt_secret(cred.encrypted_password)


def test_credential(db: Session, cred_id: int, host: str, port: int) -> dict:
    """Prueba conectividad TCP básica al host:puerto y actualiza estado."""
    import socket, time

    get_credential_or_404(db, cred_id)
    start = time.time()
    try:
        sock = socket.create_connection((host, port), timeout=5)
        latency_ms = int((time.time() - start) * 1000)
        sock.close()
        mark_credential_used(db, cred_id, True)
        return {
            "success": True,
            "message": f"Puerto {port} accesible en {host} ({latency_ms} ms)",
            "latency_ms": latency_ms,
        }
    except socket.timeout:
        mark_credential_used(db, cred_id, False)
        return {"success": False, "message": f"Timeout al conectar a {host}:{port}", "latency_ms": None}
    except ConnectionRefusedError:
        mark_credential_used(db, cred_id, False)
        return {"success": False, "message": f"Conexión rechazada en {host}:{port}", "latency_ms": None}
    except OSError as e:
        return {"success": False, "message": f"Error de red: {e}", "latency_ms": None}


def mark_credential_used(db: Session, cred_id: int, success: bool) -> None:
    cred = db.query(Credential).filter(Credential.id == cred_id).first()
    if cred:
        cred.last_used = datetime.utcnow()
        cred.last_validated = datetime.utcnow()
        cred.status = "valid" if success else "invalid"
        db.commit()
