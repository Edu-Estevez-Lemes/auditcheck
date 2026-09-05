from __future__ import annotations
from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, SyncUuidMixin


class UIThemeConfig(Base, TimestampMixin, SyncUuidMixin):
    """Colores de la interfaz configurables desde Identidad visual — fila
    única (id=1). Un set para modo oscuro y otro para modo claro; el logo/
    icono (assets/branding/) es común a ambos y no vive aquí. Campos NULL =
    usa la paleta violeta por defecto de index.css."""
    __tablename__ = "ui_theme_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    dark_background: Mapped[str | None] = mapped_column(String(6), nullable=True)
    dark_text: Mapped[str | None] = mapped_column(String(6), nullable=True)
    dark_accent: Mapped[str | None] = mapped_column(String(6), nullable=True)

    light_background: Mapped[str | None] = mapped_column(String(6), nullable=True)
    light_text: Mapped[str | None] = mapped_column(String(6), nullable=True)
    light_accent: Mapped[str | None] = mapped_column(String(6), nullable=True)
