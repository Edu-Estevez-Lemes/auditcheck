"""
Módulo de cifrado para el almacén de credenciales.
Las contraseñas se cifran con Fernet (AES-128-CBC + HMAC-SHA256).

Bloque 2 — Vault con passphrase maestra:
La clave Fernet activa vive SOLO en memoria de proceso (nunca en disco),
se deriva de la passphrase maestra vía PBKDF2 (ver services/vault.py) y
se desbloquea/bloquea explícitamente. Antes de este bloque, la clave se
guardaba en data/.key; ese modo "legacy" se conserva únicamente como
lectura de solo-migración hasta que se completa la migración a passphrase.
"""
from __future__ import annotations
from datetime import datetime, timedelta
from cryptography.fernet import Fernet
from ..config import settings

SESSION_TIMEOUT_MINUTES = 30

_session_fernet: Fernet | None = None
_session_last_used: datetime | None = None


class VaultLockedError(Exception):
    """El vault no está desbloqueado (no hay passphrase válida en sesión)."""


def _touch_session() -> None:
    global _session_fernet, _session_last_used
    if _session_fernet is None:
        return
    if _session_last_used and datetime.utcnow() - _session_last_used > timedelta(minutes=SESSION_TIMEOUT_MINUTES):
        _session_fernet = None
        _session_last_used = None


def set_session_key(fernet: Fernet) -> None:
    """Bloque 2: desbloquea la sesión del vault con una clave ya derivada."""
    global _session_fernet, _session_last_used
    _session_fernet = fernet
    _session_last_used = datetime.utcnow()


def clear_session() -> None:
    """Bloque 2: bloquea el vault, borrando la clave de memoria."""
    global _session_fernet, _session_last_used
    _session_fernet = None
    _session_last_used = None


def is_unlocked() -> bool:
    _touch_session()
    return _session_fernet is not None


def _get_session_fernet() -> Fernet:
    _touch_session()
    if _session_fernet is None:
        raise VaultLockedError("El vault está bloqueado. Introduce la passphrase maestra.")
    global _session_last_used
    _session_last_used = datetime.utcnow()
    return _session_fernet


def encrypt_secret(plaintext: str) -> str:
    """Cifra un texto con la clave de sesión del vault. Lanza VaultLockedError si está bloqueado."""
    return _get_session_fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Descifra con la clave de sesión del vault. Lanza VaultLockedError si está bloqueado."""
    return _get_session_fernet().decrypt(ciphertext.encode()).decode()


# ── Legacy (clave en data/.key) — solo para la migración del Bloque 2 ──────

def legacy_key_exists() -> bool:
    return settings.KEY_FILE.exists()


def get_legacy_fernet() -> Fernet:
    key = settings.KEY_FILE.read_bytes().strip()
    return Fernet(key)


def delete_legacy_key_file() -> None:
    """Solo debe llamarse tras confirmar que TODAS las credenciales se re-cifraron con éxito."""
    try:
        settings.KEY_FILE.unlink(missing_ok=True)
    except Exception:
        pass
