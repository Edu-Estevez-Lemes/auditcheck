from __future__ import annotations
from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, SyncUuidMixin
from ..reports.styles import DEFAULT_HEADER_COLOR, DEFAULT_ACCENT_COLOR, DEFAULT_SEPARATOR_COLOR

DEFAULT_DATE_FORMAT = "%d-%m-%Y"


class ReportBrandingConfig(Base, TimestampMixin, SyncUuidMixin):
    """Configuración de marca de informes — fila única (id=1)."""
    __tablename__ = "report_branding_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    header_color: Mapped[str] = mapped_column(String(6), nullable=False, default=DEFAULT_HEADER_COLOR)
    accent_color: Mapped[str] = mapped_column(String(6), nullable=False, default=DEFAULT_ACCENT_COLOR)
    separator_color: Mapped[str] = mapped_column(String(6), nullable=False, default=DEFAULT_SEPARATOR_COLOR)
    date_format: Mapped[str] = mapped_column(String(20), nullable=False, default=DEFAULT_DATE_FORMAT)
