from __future__ import annotations
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Derivación de clave compartida por el vault (Bloque 2) y la exportación
# cifrada .acbk (Bloque 3): PBKDF2-HMAC-SHA256, 200.000 iteraciones, clave de 32 bytes.
KDF_ITERATIONS = 200_000
KEY_LENGTH = 32


def derive_raw_key(passphrase: str, salt: bytes, iterations: int = KDF_ITERATIONS) -> bytes:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=KEY_LENGTH, salt=salt, iterations=iterations)
    return kdf.derive(passphrase.encode())
