from __future__ import annotations
import base64
import os
import logging
from datetime import datetime
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from ..config import settings
from ..models.vault_config import VaultConfig
from ..models.credential import Credential
from ..utils import crypto
from ..utils.kdf import derive_raw_key

# Bloque 2 — Vault con passphrase maestra
VERIFIER_PLAINTEXT = b"AUDITCHECK_VAULT_OK"

logger = logging.getLogger("auditcheck.vault")


class VaultError(Exception):
    """Error de negocio del vault (passphrase incorrecta, ya migrado, etc.)."""


def derive_key(passphrase: str, salt: bytes) -> bytes:
    """Clave Fernet (base64 urlsafe) derivada de la passphrase para el vault."""
    return base64.urlsafe_b64encode(derive_raw_key(passphrase, salt))


def get_config(db: Session) -> VaultConfig | None:
    return db.query(VaultConfig).first()


def needs_setup(db: Session) -> bool:
    return get_config(db) is None and not crypto.legacy_key_exists()


def needs_migration(db: Session) -> bool:
    if not crypto.legacy_key_exists():
        return False
    config = get_config(db)
    return config is None or not config.legacy_migrated


def status(db: Session) -> dict:
    return {
        "needs_setup": needs_setup(db),
        "needs_migration": needs_migration(db),
        "is_unlocked": crypto.is_unlocked(),
    }


def _safety_backup() -> Path:
    """Backup atómico de la BD antes de una operación de riesgo sobre el vault."""
    from . import backup as backup_service
    result = backup_service.create_backup(dest_dir=settings.DATA_DIR / "vault_backups")
    logger.info(f"Backup de seguridad del vault creado: {result['path']}")
    return Path(result["path"])


def setup(db: Session, passphrase: str) -> None:
    if not needs_setup(db):
        raise VaultError("El vault ya está configurado o requiere migración")
    salt = os.urandom(16)
    key = derive_key(passphrase, salt)
    fernet = Fernet(key)
    verifier = fernet.encrypt(VERIFIER_PLAINTEXT).decode()

    config = VaultConfig(
        kdf_salt=base64.b64encode(salt).decode(),
        verifier=verifier,
        legacy_migrated=True,  # no había vault legacy que migrar
    )
    db.add(config)
    db.commit()
    crypto.set_session_key(fernet)


def _derive_fernet_from_config(config: VaultConfig, passphrase: str) -> Fernet:
    salt = base64.b64decode(config.kdf_salt)
    return Fernet(derive_key(passphrase, salt))


def verify_passphrase(db: Session, passphrase: str) -> bool:
    config = get_config(db)
    if not config:
        return False
    fernet = _derive_fernet_from_config(config, passphrase)
    try:
        return fernet.decrypt(config.verifier.encode()) == VERIFIER_PLAINTEXT
    except InvalidToken:
        return False


def unlock(db: Session, passphrase: str) -> bool:
    config = get_config(db)
    if not config:
        return False
    fernet = _derive_fernet_from_config(config, passphrase)
    try:
        if fernet.decrypt(config.verifier.encode()) != VERIFIER_PLAINTEXT:
            return False
    except InvalidToken:
        return False
    crypto.set_session_key(fernet)
    return True


def lock() -> None:
    crypto.clear_session()


def change_passphrase(db: Session, current_passphrase: str, new_passphrase: str) -> None:
    config = get_config(db)
    if not config:
        raise VaultError("El vault no está configurado todavía")
    if not verify_passphrase(db, current_passphrase):
        raise VaultError("La passphrase actual no es correcta")

    backup_path = _safety_backup()
    old_fernet = _derive_fernet_from_config(config, current_passphrase)
    creds = db.query(Credential).filter(Credential.encrypted_password.isnot(None)).all()

    try:
        decrypted = {c.id: old_fernet.decrypt(c.encrypted_password.encode()).decode() for c in creds}

        new_salt = os.urandom(16)
        new_key = derive_key(new_passphrase, new_salt)
        new_fernet = Fernet(new_key)

        for c in creds:
            c.encrypted_password = new_fernet.encrypt(decrypted[c.id].encode()).decode()

        config.kdf_salt = base64.b64encode(new_salt).decode()
        config.verifier = new_fernet.encrypt(VERIFIER_PLAINTEXT).decode()

        db.commit()
    except Exception as e:
        db.rollback()
        raise VaultError(
            f"Fallo al cambiar la passphrase, no se ha modificado nada. "
            f"Backup de seguridad conservado en {backup_path}: {e}"
        ) from e

    crypto.set_session_key(new_fernet)
    logger.info("Passphrase del vault cambiada correctamente. Todas las credenciales re-cifradas.")


def migrate_legacy_vault(db: Session, new_passphrase: str) -> None:
    if not crypto.legacy_key_exists():
        raise VaultError("No hay vault legacy (data/.key) que migrar")
    config = get_config(db)
    if config and config.legacy_migrated:
        raise VaultError("El vault ya fue migrado anteriormente")

    backup_path = _safety_backup()
    legacy_fernet = crypto.get_legacy_fernet()
    creds = db.query(Credential).filter(Credential.encrypted_password.isnot(None)).all()

    try:
        decrypted = {c.id: legacy_fernet.decrypt(c.encrypted_password.encode()).decode() for c in creds}

        new_salt = os.urandom(16)
        new_key = derive_key(new_passphrase, new_salt)
        new_fernet = Fernet(new_key)

        for c in creds:
            c.encrypted_password = new_fernet.encrypt(decrypted[c.id].encode()).decode()

        verifier = new_fernet.encrypt(VERIFIER_PLAINTEXT).decode()
        if config:
            config.kdf_salt = base64.b64encode(new_salt).decode()
            config.verifier = verifier
            config.legacy_migrated = True
        else:
            config = VaultConfig(kdf_salt=base64.b64encode(new_salt).decode(), verifier=verifier, legacy_migrated=True)
            db.add(config)

        db.commit()

        # Verificación: todas las credenciales que tenían contraseña ahora descifran con la nueva clave
        remaining = db.query(Credential).filter(Credential.encrypted_password.isnot(None)).all()
        for c in remaining:
            new_fernet.decrypt(c.encrypted_password.encode())

    except Exception as e:
        db.rollback()
        raise VaultError(
            f"Fallo al migrar el vault legacy, no se ha modificado nada y data/.key se conserva intacto. "
            f"Backup de seguridad en {backup_path}: {e}"
        ) from e

    # Solo tras verificar el éxito completo se elimina la clave legacy
    crypto.delete_legacy_key_file()
    crypto.set_session_key(new_fernet)
    logger.info("Migración del vault legacy completada. data/.key eliminado.")
