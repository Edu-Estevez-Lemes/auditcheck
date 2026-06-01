"""Estilos profesionales para el Excel de ÃUDITCHECK."""
from __future__ import annotations
from openpyxl.styles import (
    PatternFill, Font, Alignment, Border, Side, GradientFill
)
from openpyxl.styles.numbers import FORMAT_DATE_DATETIME

# Paleta corporativa
C_DARK_BG = "0F1117"
C_HEADER_BG = "1A2744"
C_ACCENT = "1E6FD9"
C_LIGHT_BG = "F0F4FA"
C_WHITE = "FFFFFF"
C_BLACK = "000000"
C_GRAY_LIGHT = "E8EDF5"
C_GRAY_MED = "94A3B8"
C_TEXT_DARK = "1E293B"

# Colores de severidad
C_CRITICAL = "DC2626"
C_HIGH = "EA580C"
C_MEDIUM = "D97706"
C_LOW = "2563EB"
C_INFO = "6B7280"

# Colores de estado
C_OK = "16A34A"
C_WARNING = "CA8A04"
C_ERROR = "DC2626"


def _side(style="thin", color=C_GRAY_MED):
    return Side(style=style, color=color)


def _border(all_sides="thin"):
    s = _side(all_sides)
    return Border(left=s, right=s, top=s, bottom=s)


def _fill(hex_color: str) -> PatternFill:
    return PatternFill("solid", fgColor=hex_color)


def _font(bold=False, size=10, color=C_TEXT_DARK, italic=False) -> Font:
    return Font(bold=bold, size=size, color=color, italic=italic)


def _align(h="left", v="center", wrap=False) -> Alignment:
    return Alignment(horizontal=h, vertical=v, wrap_text=wrap)


# Estilos predefinidos
STYLE_TITLE = {
    "font": _font(bold=True, size=20, color=C_WHITE),
    "fill": _fill(C_HEADER_BG),
    "alignment": _align("center", "center"),
}

STYLE_SUBTITLE = {
    "font": _font(bold=True, size=12, color=C_ACCENT),
    "fill": _fill(C_WHITE),
    "alignment": _align("left", "center"),
}

STYLE_HEADER = {
    "font": _font(bold=True, size=10, color=C_WHITE),
    "fill": _fill(C_HEADER_BG),
    "alignment": _align("center", "center"),
    "border": _border(),
}

STYLE_SUBHEADER = {
    "font": _font(bold=True, size=10, color=C_WHITE),
    "fill": _fill(C_ACCENT),
    "alignment": _align("center", "center"),
    "border": _border(),
}

STYLE_ROW_EVEN = {
    "font": _font(size=9),
    "fill": _fill(C_WHITE),
    "alignment": _align(wrap=True),
    "border": _border(),
}

STYLE_ROW_ODD = {
    "font": _font(size=9),
    "fill": _fill(C_LIGHT_BG),
    "alignment": _align(wrap=True),
    "border": _border(),
}

STYLE_LABEL = {
    "font": _font(bold=True, size=9, color=C_TEXT_DARK),
    "fill": _fill(C_GRAY_LIGHT),
    "alignment": _align(),
    "border": _border(),
}

STYLE_VALUE = {
    "font": _font(size=9),
    "fill": _fill(C_WHITE),
    "alignment": _align(wrap=True),
    "border": _border(),
}

# Severidad
SEVERITY_STYLES = {
    "critical": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_CRITICAL)},
    "high": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_HIGH)},
    "medium": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_MEDIUM)},
    "low": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_LOW)},
    "informational": {"font": _font(size=9, color=C_WHITE), "fill": _fill(C_INFO)},
}

STATUS_STYLES = {
    "ok": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_OK)},
    "success": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_OK)},
    "warning": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_WARNING)},
    "failed": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_ERROR)},
    "error": {"font": _font(bold=True, size=9, color=C_WHITE), "fill": _fill(C_ERROR)},
}


def apply_style(cell, style: dict) -> None:
    if "font" in style:
        cell.font = style["font"]
    if "fill" in style:
        cell.fill = style["fill"]
    if "alignment" in style:
        cell.alignment = style["alignment"]
    if "border" in style:
        cell.border = style["border"]


SEVERITY_LABELS = {
    "critical": "CRÍTICO",
    "high": "ALTO",
    "medium": "MEDIO",
    "low": "BAJO",
    "informational": "INFORMATIVO",
}

DEVICE_TYPE_LABELS = {
    "windows_server": "Windows Server",
    "windows_workstation": "Windows PC",
    "linux": "Linux",
    "esxi": "VMware ESXi",
    "vcenter": "VMware vCenter",
    "fortigate": "FortiGate",
    "nas": "NAS",
    "switch": "Switch",
    "router": "Router",
    "ilo": "HP iLO",
    "idrac": "Dell iDRAC",
    "printer": "Impresora",
    "veeam": "Veeam",
    "unknown": "Desconocido",
}
