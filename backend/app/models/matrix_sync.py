from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin

# Sincronización con la matriz — configuración de conexión a la BD central MySQL.
# Fila única (id=1). Deliberadamente NO lleva SyncUuidMixin: es configuración local
# de esta instalación, nunca debe viajar dentro de la propia sincronización.


class MatrixSyncConfig(Base, TimestampMixin):
    __tablename__ = "matrix_sync_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=3306, nullable=False)
    database: Mapped[str] = mapped_column(String(100), nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    # Cifrada con la clave de sesión del vault (utils/crypto.encrypt_secret), igual que
    # las credenciales de dispositivos — ver services/credential.py.
    encrypted_password: Mapped[str] = mapped_column(Text, nullable=False)

    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_direction: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "pull" | "push"
