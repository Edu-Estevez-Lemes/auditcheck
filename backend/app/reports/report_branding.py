"""Resolución de logo, colores y formato de fecha de informe configurables
desde Configuración."""
from __future__ import annotations
import datetime as _dt
from pathlib import Path
from sqlalchemy.orm import Session

from ..config import settings
from ..models.report_branding import ReportBrandingConfig, DEFAULT_DATE_FORMAT
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


def get_report_branding_config(db: Session) -> ReportBrandingConfig:
    """Devuelve la fila singleton (id=1) de configuración de marca de
    informes, creándola con los valores por defecto si todavía no existe."""
    config = db.query(ReportBrandingConfig).filter(ReportBrandingConfig.id == 1).first()
    if not config:
        config = ReportBrandingConfig(
            id=1,
            header_color=DEFAULT_HEADER_COLOR,
            accent_color=DEFAULT_ACCENT_COLOR,
            separator_color=DEFAULT_SEPARATOR_COLOR,
            date_format=DEFAULT_DATE_FORMAT,
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def get_report_colors(db: Session) -> dict[str, str]:
    """Devuelve {header, accent, separator} (hex sin '#')."""
    config = get_report_branding_config(db)
    return {
        "header": config.header_color,
        "accent": config.accent_color,
        "separator": config.separator_color,
    }


def get_report_date_format(db: Session) -> str:
    return get_report_branding_config(db).date_format or DEFAULT_DATE_FORMAT


def format_report_date(value: str | None, date_format: str) -> str:
    """Reformatea una fecha ISO ('YYYY-MM-DD') al formato configurado.
    Si no es una fecha ISO válida, se devuelve tal cual (p. ej. texto libre)."""
    if not value:
        return value or ""
    try:
        return _dt.date.fromisoformat(value).strftime(date_format)
    except ValueError:
        return value
