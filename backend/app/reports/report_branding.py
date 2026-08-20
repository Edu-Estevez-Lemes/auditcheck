"""Resolución de logo y colores de informe configurables desde Configuración."""
from __future__ import annotations
from pathlib import Path
from sqlalchemy.orm import Session

from ..config import settings
from ..models.report_branding import ReportBrandingConfig
from .styles import DEFAULT_HEADER_COLOR, DEFAULT_ACCENT_COLOR, DEFAULT_SEPARATOR_COLOR

REPORT_TAGLINE = "AuditCheck — Informe generado automáticamente"


def get_report_logo_path() -> Path | None:
    """Logo a usar en los informes: el subido específicamente para informes,
    si no el logo general de AuditCheck (Identidad Visual), si no ninguno."""
    custom = settings.BRANDING_DIR / "report_logo.png"
    if custom.exists():
        return custom
    default = settings.BRANDING_DIR / "logo.png"
    if default.exists():
        return default
    return None


def get_report_colors(db: Session) -> dict[str, str]:
    """Devuelve {header, accent, separator} (hex sin '#'), creando la fila
    singleton con los valores por defecto si todavía no existe."""
    config = db.query(ReportBrandingConfig).filter(ReportBrandingConfig.id == 1).first()
    if not config:
        config = ReportBrandingConfig(
            id=1,
            header_color=DEFAULT_HEADER_COLOR,
            accent_color=DEFAULT_ACCENT_COLOR,
            separator_color=DEFAULT_SEPARATOR_COLOR,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return {
        "header": config.header_color,
        "accent": config.accent_color,
        "separator": config.separator_color,
    }
