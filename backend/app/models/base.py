from __future__ import annotations
import uuid as _uuid
from datetime import datetime
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )


class SyncUuidMixin:
    """Identificador estable e independiente del `id` autoincremental (local a cada
    instalación), usado por el motor de Sincronización con la matriz (services/matrix_sync.py)
    para emparejar la misma fila entre la BD embebida (SQLite) y la BD central (MySQL)."""
    uuid: Mapped[str] = mapped_column(
        String(36), unique=True, index=True, default=lambda: str(_uuid.uuid4()), nullable=False
    )
