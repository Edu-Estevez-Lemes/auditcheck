from __future__ import annotations
import re
from pydantic import BaseModel, field_validator

_HEX_RE = re.compile(r"^[0-9A-Fa-f]{6}$")

# Formatos de fecha admitidos en los informes (strftime). Lista blanca: evita
# guardar un patrón inválido que rompa la generación de Excel/PDF.
ALLOWED_DATE_FORMATS = {
    "%d-%m-%Y",  # 24-08-2026
    "%d/%m/%Y",  # 24/08/2026
    "%d.%m.%Y",  # 24.08.2026
    "%Y-%m-%d",  # 2026-08-24
    "%m/%d/%Y",  # 08/24/2026
}


class ReportBrandingOut(BaseModel):
    header_color: str
    accent_color: str
    separator_color: str
    date_format: str

    model_config = {"from_attributes": True}


class ReportBrandingUpdate(BaseModel):
    header_color: str
    accent_color: str
    separator_color: str
    date_format: str

    @field_validator("header_color", "accent_color", "separator_color")
    @classmethod
    def _validate_hex(cls, v: str) -> str:
        v = v.lstrip("#")
        if not _HEX_RE.match(v):
            raise ValueError("El color debe ser un hex de 6 dígitos, p. ej. '7C3AED'")
        return v.upper()

    @field_validator("date_format")
    @classmethod
    def _validate_date_format(cls, v: str) -> str:
        if v not in ALLOWED_DATE_FORMATS:
            raise ValueError("Formato de fecha no soportado")
        return v
