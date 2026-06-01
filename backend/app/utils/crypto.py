"""
Módulo de cifrado para el almacén de credenciales.
Las contraseñas se cifran con Fernet (AES-128-CBC + HMAC-SHA256).
La clave se genera una sola vez y se almacena en data/.key
"""
from __future__ import annotations
import os
import stat
from pathlib import Path
from cryptography.fernet import Fernet
from ..config import settings

_fernet: Fernet | None = None


def _get_key_file() -> Path:
    return settings.KEY_FILE


def _load_or_create_key() -> bytes:
    key_file = _get_key_file()
    key_file.parent.mkdir(parents=True, exist_ok=True)

    if key_file.exists():
        return key_file.read_bytes().strip()

    key = Fernet.generate_key()
    key_file.write_bytes(key)
    try:
        key_file.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        pass
    return key


def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_load_or_create_key())
    return _fernet


def encrypt_secret(plaintext: str) -> str:
    """Cifra un texto. Devuelve el texto cifrado como string."""
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Descifra un texto cifrado. Lanza InvalidToken si el token es inválido."""
    return get_fernet().decrypt(ciphertext.encode()).decode()


def rotate_key(new_key: bytes | None = None) -> bytes:
    """
    Genera una nueva clave de cifrado. Las credenciales existentes
    deben re-cifrarse manualmente. Solo para uso administrativo.
    """
    global _fernet
    key = new_key or Fernet.generate_key()
    _fernet = Fernet(key)
    key_file = _get_key_file()
    key_file.write_bytes(key)
    return key
