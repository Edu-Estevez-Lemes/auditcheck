from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin

# Bloque 1 — Usuarios y roles
ROLES = ("superadmin", "admin", "tecnico")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # is_admin se mantiene por compatibilidad. Dejar de usarla en código nuevo: usar `role`.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Bloque 1 — Usuarios y roles
    role: Mapped[str] = mapped_column(String(20), default="tecnico", nullable=False)
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Avatar de perfil: None (sin avatar, usa iniciales), "preset:<key>" (uno de
    # AVATAR_PRESET_KEYS, renderizado en el frontend) o "custom" (imagen subida,
    # servida desde AVATARS_DIR / f"{id}.<ext>" — ver services/avatar.py).
    avatar: Mapped[str | None] = mapped_column(String(30), nullable=True)
