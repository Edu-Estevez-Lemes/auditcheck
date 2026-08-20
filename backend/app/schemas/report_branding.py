from __future__ import annotations
import re
from pydantic import BaseModel, field_validator

_HEX_RE = re.compile(r"^[0-9A-Fa-f]{6}$")


class ReportBrandingOut(BaseModel):
    header_color: str
    accent_color: str
    separator_color: str

    model_config = {"from_attributes": True}


class ReportBrandingUpdate(BaseModel):
    header_color: str
    accent_color: str
    separator_color: str

    @field_validator("header_color", "accent_color", "separator_color")
    @classmethod
    def _validate_hex(cls, v: str) -> str:
        v = v.lstrip("#")
        if not _HEX_RE.match(v):
            raise ValueError("El color debe ser un hex de 6 dígitos, p. ej. '7C3AED'")
        return v.upper()
