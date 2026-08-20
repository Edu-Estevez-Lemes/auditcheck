from __future__ import annotations
import base64
import gzip
import json
import os
import struct
from pathlib import Path
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..utils.kdf import derive_raw_key

# Bloque 3 — Formato de fichero .acbk (AuditCheck Backup)
# [4 bytes magic "ACBK"] [4 bytes big-endian: longitud de cabecera]
# [cabecera JSON en claro] [AES-256-GCM(gzip(sqlite_db)) — incluye el tag de 16 bytes al final]
MAGIC = b"ACBK"
FORMAT_VERSION = 1
NONCE_SIZE = 12
SALT_SIZE = 16


class AcbkError(Exception):
    """Fichero .acbk inválido, dañado o passphrase incorrecta."""


def pack(db_path: Path, dest_path: Path, password: str, header_extra: dict) -> None:
    salt = os.urandom(SALT_SIZE)
    nonce = os.urandom(NONCE_SIZE)
    key = derive_raw_key(password, salt)

    compressed = gzip.compress(db_path.read_bytes())
    ciphertext = AESGCM(key).encrypt(nonce, compressed, None)

    header = {
        "magic": MAGIC.decode(),
        "format_version": FORMAT_VERSION,
        "kdf_salt": base64.b64encode(salt).decode(),
        "nonce": base64.b64encode(nonce).decode(),
        **header_extra,
    }
    header_bytes = json.dumps(header, ensure_ascii=False).encode("utf-8")

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(MAGIC)
        f.write(struct.pack(">I", len(header_bytes)))
        f.write(header_bytes)
        f.write(ciphertext)


def read_header(path: Path) -> dict:
    """Lee solo la cabecera en claro, sin descifrar el payload. No requiere contraseña."""
    with open(path, "rb") as f:
        magic = f.read(4)
        if magic != MAGIC:
            raise AcbkError("El fichero no es un .acbk válido (cabecera 'ACBK' no encontrada)")
        (header_len,) = struct.unpack(">I", f.read(4))
        header_bytes = f.read(header_len)
        try:
            header = json.loads(header_bytes.decode("utf-8"))
        except json.JSONDecodeError as e:
            raise AcbkError(f"Cabecera .acbk corrupta: {e}") from e
        if header.get("format_version") != FORMAT_VERSION:
            raise AcbkError(f"Versión de formato .acbk no soportada: {header.get('format_version')}")
        return header


def unpack(path: Path, password: str) -> bytes:
    """Descifra y descomprime el payload. Devuelve los bytes de la BD SQLite."""
    with open(path, "rb") as f:
        magic = f.read(4)
        if magic != MAGIC:
            raise AcbkError("El fichero no es un .acbk válido")
        (header_len,) = struct.unpack(">I", f.read(4))
        header_bytes = f.read(header_len)
        header = json.loads(header_bytes.decode("utf-8"))
        ciphertext = f.read()

    salt = base64.b64decode(header["kdf_salt"])
    nonce = base64.b64decode(header["nonce"])
    key = derive_raw_key(password, salt)

    try:
        compressed = AESGCM(key).decrypt(nonce, ciphertext, None)
    except InvalidTag:
        raise AcbkError("Contraseña incorrecta o fichero dañado/manipulado")

    try:
        return gzip.decompress(compressed)
    except OSError as e:
        raise AcbkError(f"Payload corrupto tras el descifrado: {e}") from e
