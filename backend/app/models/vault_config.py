from __future__ import annotations
from sqlalchemy import String, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin

# Bloque 2 — Vault con passphrase maestra. Fila única (id=1).


class VaultConfig(Base, TimestampMixin):
    __tablename__ = "vault_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    kdf_salt: Mapped[str] = mapped_column(String(64), nullable=False)  # base64
    verifier: Mapped[str] = mapped_column(Text, nullable=False)  # valor conocido cifrado con la clave derivada
    legacy_migrated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
