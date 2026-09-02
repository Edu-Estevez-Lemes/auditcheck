from __future__ import annotations
import re
from pydantic import BaseModel, field_validator

_HEX_RE = re.compile(r"^[0-9A-Fa-f]{6}$")


class UIThemeOut(BaseModel):
    dark_background: str | None = None
    dark_text: str | None = None
    dark_accent: str | None = None
    light_background: str | None = None
    light_text: str | None = None
    light_accent: str | None = None

    model_config = {"from_attributes": True}


class UIThemeUpdate(BaseModel):
    dark_background: str | None = None
    dark_text: str | None = None
    dark_accent: str | None = None
    light_background: str | None = None
    light_text: str | None = None
    light_accent: str | None = None

    @field_validator(
        "dark_background", "dark_text", "dark_accent",
        "light_background", "light_text", "light_accent",
    )
    @classmethod
    def _validate_hex(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        v = v.lstrip("#")
        if not _HEX_RE.match(v):
            raise ValueError("El color debe ser un hex de 6 dígitos, p. ej. '7C3AED'")
        return v.upper()
