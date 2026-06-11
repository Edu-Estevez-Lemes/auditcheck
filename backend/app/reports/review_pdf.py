"""Generación de informe PDF para revisiones manuales (requiere reportlab)."""
from __future__ import annotations
from pathlib import Path

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    )
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

from .review_items import REVIEW_ITEMS, REVIEW_CATEGORIES

_C_PURPLE   = "#7C3AED"
_C_DARK_BG  = "#2D1B69"
_C_OK       = "#16A34A"
_C_WARNING  = "#CA8A04"
_C_CRITICAL = "#DC2626"
_C_LIGHT    = "#F5F3FF"
_C_GRAY     = "#EDE9FE"
_C_TEXT     = "#1E0B3E"

_STATUS_LABEL = {"ok": "OK", "warning": "Warning", "critical": "Critical", "": "—"}
_STATUS_COLOR = {
    "ok":       _C_OK,
    "warning":  _C_WARNING,
    "critical": _C_CRITICAL,
    "":         "#AAAAAA",
}


def generate_review_pdf(review_export_data: dict, output_path: Path) -> None:
    if not _AVAILABLE:
        raise ImportError(
            "reportlab no está instalado. Ejecuta: pip install reportlab"
        )

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    story = []

    client_name = review_export_data.get("client_name", "")
    technician_name = review_export_data.get("technician_name", "")
    review_date = review_export_data.get("review_date", "")
    categories: list[str] = review_export_data.get("categories", [])
    devices: list[dict] = review_export_data.get("devices", [])
    results: dict = review_export_data.get("results", {})
    device_categories: dict | None = review_export_data.get("device_categories")

    def _dev_cats(dev_id: str) -> list[str]:
        if device_categories and dev_id in device_categories:
            return device_categories[dev_id]
        return categories

    cat_labels = {c["key"]: c["label"] for c in REVIEW_CATEGORIES}

    title_style = ParagraphStyle(
        "rp_title", parent=styles["Title"],
        textColor=colors.HexColor(_C_PURPLE), fontSize=18, spaceAfter=6,
    )
    story.append(Paragraph("REVISIÓN MANUAL — INFORME", title_style))
    story.append(Spacer(1, 4 * mm))

    # Info header table
    info_data = [
        ["Cliente:", client_name, "Técnico:", technician_name],
        ["Fecha:", review_date, "Categorías:", ", ".join(c.upper() for c in categories)],
    ]
    info_tbl = Table(info_data, colWidths=[22 * mm, 68 * mm, 22 * mm, 68 * mm])
    info_tbl.setStyle(TableStyle([
        ("FONTNAME",   (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME",   (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",   (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("TEXTCOLOR",  (0, 0), (-1, -1), colors.HexColor(_C_TEXT)),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(_C_GRAY)),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor(_C_GRAY)),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#9D8EC4")),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING",    (0, 0), (-1, -1), 4),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 8 * mm))

    # Summary table
    sum_header_style = ParagraphStyle(
        "rp_sumhdr", parent=styles["Heading3"],
        textColor=colors.white, fontSize=11,
    )
    story.append(Paragraph(f'<para backColor="{_C_DARK_BG}" textColor="white">  RESUMEN</para>', sum_header_style))
    story.append(Spacer(1, 2 * mm))

    priority = {"critical": 3, "warning": 2, "ok": 1, "": 0}
    sum_rows = [["Dispositivo", "IP", "Estado general"]]
    for device in devices:
        dev_id = str(device["id"])
        dev_results = results.get(dev_id, {})
        dev_cats = _dev_cats(dev_id)
        worst = ""
        for cat_key in dev_cats:
            for s in dev_results.get(cat_key, {}).get("items", {}).values():
                if priority.get(s, 0) > priority.get(worst, 0):
                    worst = s
        device_name = device.get("display_name") or device.get("hostname") or device.get("ip_address", "")
        sum_rows.append([device_name, device.get("ip_address", ""), _STATUS_LABEL.get(worst, "—")])

    sum_tbl = Table(sum_rows, colWidths=[90 * mm, 40 * mm, 30 * mm])
    ts = TableStyle([
        ("FONTNAME",   (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_C_DARK_BG)),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("ALIGN",      (2, 0), (2, -1), "CENTER"),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#9D8EC4")),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING",    (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(_C_LIGHT)]),
    ])
    for row_idx, device in enumerate(devices, 1):
        dev_id = str(device["id"])
        dev_results = results.get(dev_id, {})
        dev_cats = _dev_cats(dev_id)
        worst = ""
        for cat_key in dev_cats:
            for s in dev_results.get(cat_key, {}).get("items", {}).values():
                if priority.get(s, 0) > priority.get(worst, 0):
                    worst = s
        if worst in ("ok", "warning", "critical"):
            ts.add("BACKGROUND", (2, row_idx), (2, row_idx), colors.HexColor(_STATUS_COLOR[worst]))
            ts.add("TEXTCOLOR",  (2, row_idx), (2, row_idx), colors.white)
            ts.add("FONTNAME",   (2, row_idx), (2, row_idx), "Helvetica-Bold")
    sum_tbl.setStyle(ts)
    story.append(sum_tbl)
    story.append(Spacer(1, 10 * mm))

    # Per-category sections
    cat_hdr_style = ParagraphStyle(
        "rp_cathdr", parent=styles["Heading2"],
        textColor=colors.white, fontSize=12, spaceAfter=4,
    )
    dev_hdr_style = ParagraphStyle(
        "rp_devhdr", parent=styles["Heading3"],
        textColor=colors.HexColor(_C_PURPLE), fontSize=10, spaceAfter=2,
    )
    obs_style = ParagraphStyle(
        "rp_obs", parent=styles["Normal"],
        fontSize=8, textColor=colors.HexColor("#555555"), spaceAfter=4,
    )

    for cat_key in categories:
        cat_label = cat_labels.get(cat_key, cat_key.title())

        # Only include devices assigned to this category
        cat_devices = [d for d in devices if cat_key in _dev_cats(str(d["id"]))]
        if not cat_devices:
            continue

        story.append(Paragraph(
            f'<para backColor="{_C_PURPLE}" textColor="white">  {cat_label.upper()}</para>',
            cat_hdr_style,
        ))
        story.append(Spacer(1, 3 * mm))

        for device in cat_devices:
            dev_id = str(device["id"])
            dev_type = device.get("device_type", "")
            cat_items = REVIEW_ITEMS.get(cat_key, {}).get(dev_type, [])
            if not cat_items:
                continue

            device_name = device.get("display_name") or device.get("hostname") or device.get("ip_address", "")
            ip = device.get("ip_address", "")
            cat_result = results.get(dev_id, {}).get(cat_key, {"items": {}, "observations": ""})
            items_results: dict = cat_result.get("items", {})
            observations: str = cat_result.get("observations", "")

            story.append(Paragraph(f"▸ {device_name}  ({ip})", dev_hdr_style))

            item_rows = [["Ítem de revisión", "OK", "Warning", "Critical"]]
            for item in cat_items:
                status = items_results.get(item["key"], "")
                row_cells = [item["label"], "", "", ""]
                col_map = {"ok": 1, "warning": 2, "critical": 3}
                if status in col_map:
                    row_cells[col_map[status]] = "✓"
                item_rows.append(row_cells)

            item_tbl = Table(item_rows, colWidths=[110 * mm, 14 * mm, 18 * mm, 18 * mm])
            its = TableStyle([
                ("FONTNAME",   (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",   (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(_C_DARK_BG)),
                ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
                ("ALIGN",      (1, 0), (-1, -1), "CENTER"),
                ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
                ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#9D8EC4")),
                ("PADDING",    (0, 0), (-1, -1), 3),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(_C_LIGHT)]),
            ])
            for r, item in enumerate(cat_items, 1):
                status = items_results.get(item["key"], "")
                col_map = {"ok": 1, "warning": 2, "critical": 3}
                if status in col_map:
                    col_i = col_map[status]
                    its.add("BACKGROUND", (col_i, r), (col_i, r), colors.HexColor(_STATUS_COLOR[status]))
                    its.add("TEXTCOLOR",  (col_i, r), (col_i, r), colors.white)
                    its.add("FONTNAME",   (col_i, r), (col_i, r), "Helvetica-Bold")
            item_tbl.setStyle(its)
            story.append(item_tbl)

            if observations:
                story.append(Paragraph(f"<b>Observaciones:</b> {observations}", obs_style))

            story.append(Spacer(1, 4 * mm))

        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#DDD6FE")))
        story.append(Spacer(1, 4 * mm))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.build(story)
