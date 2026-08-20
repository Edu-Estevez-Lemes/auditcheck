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
        Image as RLImage,
    )
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False

from .review_items import REVIEW_CATEGORIES
from .report_branding import get_report_logo_path, REPORT_TAGLINE
from .styles import DEFAULT_HEADER_COLOR, DEFAULT_ACCENT_COLOR, DEFAULT_SEPARATOR_COLOR
from ..services.review_checklist import get_effective_items

# Paleta estructural/de estado — sin cambios desde Configuración.
_C_OK       = "#4F758B"   # Azul medio (estado estable)
_C_WARNING  = "#B4B5DF"   # Lavanda (alerta suave)
_C_CRITICAL = "#C10016"   # Rojo (estado crítico real)
_C_LIGHT    = "#DAE4EA"   # Azul claro tenue (filas alternas)
_C_GRAY     = "#A6BBC8"   # Azul claro (labels, texto secundario)
_C_TEXT     = "#091F2C"   # Texto sobre fondos claros

_STATUS_LABEL = {"ok": "OK", "warning": "Warning", "critical": "Critical", "": "—"}
_STATUS_COLOR = {
    "ok":       _C_OK,
    "warning":  _C_WARNING,
    "critical": _C_CRITICAL,
    "":         "#A6BBC8",
}
# Texto legible según el fondo del estado (definido solo cuando reportlab está disponible)
if _AVAILABLE:
    _STATUS_TEXT_COLOR = {
        "ok":       colors.white,
        "warning":  colors.HexColor(_C_TEXT),   # lavanda → texto oscuro
        "critical": colors.white,
        "":         colors.HexColor(_C_TEXT),
    }
    # Colores del símbolo ✓ en tablas de ítems (sin fondo — solo el color del tick)
    _CHECK_TEXT_COLOR = {
        "ok":       colors.HexColor("#091F2C"),  # azul oscuro sobre blanco
        "warning":  colors.HexColor("#7A99AC"),  # azul gris sobre blanco
        "critical": colors.HexColor("#C10016"),  # rojo corporativo sobre blanco
    }


def generate_review_pdf(review_export_data: dict, output_path: Path) -> None:
    if not _AVAILABLE:
        raise ImportError(
            "reportlab no está instalado. Ejecuta: pip install reportlab"
        )

    report_colors: dict = review_export_data.get("report_colors") or {}
    header_hex    = "#" + report_colors.get("header", DEFAULT_HEADER_COLOR)
    accent_hex    = "#" + report_colors.get("accent", DEFAULT_ACCENT_COLOR)
    separator_hex = "#" + report_colors.get("separator", DEFAULT_SEPARATOR_COLOR)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=20 * mm,
        bottomMargin=28 * mm,   # margen ampliado para pie de página
    )

    def _draw_footer(canvas, doc):
        """Pie: línea separadora + tagline."""
        canvas.saveState()
        left  = doc.leftMargin
        right = doc.pagesize[0] - doc.rightMargin
        line_y = 18 * mm
        text_y = 9  * mm

        # Línea separadora
        canvas.setStrokeColor(colors.HexColor(separator_hex))
        canvas.setLineWidth(1.2)
        canvas.line(left, line_y, right, line_y)

        # Tagline (derecha)
        canvas.setFillColor(colors.HexColor("#7A99AC"))
        canvas.setFont("Helvetica", 7)
        text_w = canvas.stringWidth(REPORT_TAGLINE, "Helvetica", 7)
        canvas.drawString(right - text_w, text_y, REPORT_TAGLINE)

        canvas.restoreState()
    styles = getSampleStyleSheet()
    story = []

    client_name = review_export_data.get("client_name", "")
    technician_name = review_export_data.get("technician_name", "")
    review_date = review_export_data.get("review_date", "")
    categories: list[str] = review_export_data.get("categories", [])
    devices: list[dict] = review_export_data.get("devices", [])
    results: dict = review_export_data.get("results", {})
    device_categories: dict | None = review_export_data.get("device_categories")
    removed_items: dict = review_export_data.get("removed_items") or {}
    custom_items: dict = review_export_data.get("custom_items") or {}
    category_labels: dict = review_export_data.get("category_labels") or {}
    client_logo_path: str | None = review_export_data.get("logo_path")

    def _dev_cats(dev_id: str) -> list[str]:
        if device_categories and dev_id in device_categories:
            return device_categories[dev_id]
        return categories

    cat_labels = {c["key"]: c["label"] for c in REVIEW_CATEGORIES}
    cat_labels.update(category_labels)

    # ── Cabecera con logos: informe (izquierda) + cliente (derecha) ─────────────
    def _proportional_rl_image(path, max_w_mm: float, max_h_mm: float):
        """Carga una imagen y la escala proporcionalmente dentro del área dada."""
        img = RLImage(str(path))
        nat_w, nat_h = img.imageWidth, img.imageHeight
        if nat_w and nat_h:
            ratio = min((max_w_mm * mm) / nat_w, (max_h_mm * mm) / nat_h)
            img.drawWidth  = nat_w * ratio
            img.drawHeight = nat_h * ratio
        else:
            img.drawWidth  = max_w_mm * mm
            img.drawHeight = max_h_mm * mm
        return img

    report_logo = get_report_logo_path()
    if report_logo:
        logo_left: object = _proportional_rl_image(report_logo, max_w_mm=50, max_h_mm=20)
    else:
        logo_left = Paragraph(
            "<b>AuditCheck</b>",
            ParagraphStyle("ac_fallback", fontSize=14, textColor=colors.HexColor(header_hex)),
        )

    if client_logo_path and Path(client_logo_path).exists():
        try:
            client_logo_cell: object = _proportional_rl_image(
                Path(client_logo_path), max_w_mm=45, max_h_mm=20
            )
        except Exception:
            client_logo_cell = ""
    else:
        client_logo_cell = ""

    # Logo de informe (izq.) — espacio central — logo cliente (dcha.)
    header_tbl = Table(
        [[logo_left, "", client_logo_cell]],
        colWidths=[55 * mm, 60 * mm, 55 * mm],
    )
    header_tbl.setStyle(TableStyle([
        ("VALIGN",  (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",   (2, 0), (2, 0),   "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_tbl)

    # Tagline debajo del logo, alineado a izquierda
    tagline_style = ParagraphStyle(
        "rp_tagline", fontSize=7, textColor=colors.HexColor("#7A99AC"),
        spaceBefore=1, spaceAfter=3,
    )
    story.append(Paragraph(REPORT_TAGLINE, tagline_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor(separator_hex)))
    story.append(Spacer(1, 4 * mm))

    title_style = ParagraphStyle(
        "rp_title",
        fontName="Helvetica-Bold",
        textColor=colors.HexColor(header_hex), fontSize=18, spaceAfter=6,
    )
    story.append(Paragraph("REVISIÓN MANUAL — INFORME", title_style))
    story.append(Spacer(1, 4 * mm))

    # Info header table
    # Las categorías se envuelven en Paragraph para garantizar el salto de línea automático
    _wrap_st = ParagraphStyle(
        "rp_wrap", fontSize=9, textColor=colors.HexColor(_C_TEXT), leading=12,
    )
    cats_paragraph = Paragraph(
        ", ".join(c.upper() for c in categories), _wrap_st,
    )
    info_data = [
        ["Cliente:", client_name, "Técnico:", technician_name],
        ["Fecha:", review_date, "Categorías:", cats_paragraph],
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
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#7A99AC")),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("VALIGN",     (2, 1), (3, 1),   "TOP"),   # fila de categorías: alinear arriba al expandirse
        ("PADDING",    (0, 0), (-1, -1), 4),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 8 * mm))

    # Summary table
    sum_header_style = ParagraphStyle(
        "rp_sumhdr",
        fontName="Helvetica-Bold",
        textColor=colors.white, fontSize=11,
    )
    story.append(Paragraph(f'<para backColor="{accent_hex}" textColor="white">  RESUMEN</para>', sum_header_style))
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
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_hex)),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("ALIGN",      (2, 0), (2, -1), "CENTER"),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#7A99AC")),
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
            ts.add("TEXTCOLOR",  (2, row_idx), (2, row_idx), _STATUS_TEXT_COLOR[worst])
            ts.add("FONTNAME",   (2, row_idx), (2, row_idx), "Helvetica-Bold")
    sum_tbl.setStyle(ts)
    story.append(sum_tbl)
    story.append(Spacer(1, 10 * mm))

    # Per-category sections
    cat_hdr_style = ParagraphStyle(
        "rp_cathdr",
        fontName="Helvetica-Bold",
        textColor=colors.white, fontSize=12, spaceAfter=4,
    )
    dev_hdr_style = ParagraphStyle(
        "rp_devhdr",
        fontName="Helvetica-Bold",
        textColor=colors.HexColor(_C_TEXT), fontSize=10, spaceAfter=2, spaceBefore=2,
    )
    obs_style = ParagraphStyle(
        "rp_obs", parent=styles["Normal"],
        fontSize=8, textColor=colors.HexColor(_C_TEXT), spaceAfter=4,
    )

    for cat_key in categories:
        cat_label = cat_labels.get(cat_key, cat_key.title())

        # Only include devices assigned to this category
        cat_devices = [d for d in devices if cat_key in _dev_cats(str(d["id"]))]
        if not cat_devices:
            continue

        story.append(Paragraph(
            f'<para backColor="{header_hex}" textColor="white">  {cat_label.upper()}</para>',
            cat_hdr_style,
        ))
        story.append(Spacer(1, 3 * mm))

        for device in cat_devices:
            dev_id = str(device["id"])
            dev_type = device.get("device_type", "")
            cat_items = get_effective_items(cat_key, dev_type, removed_items, custom_items)
            if not cat_items:
                continue

            device_name = device.get("display_name") or device.get("hostname") or device.get("ip_address", "")
            ip = device.get("ip_address", "")
            cat_result = results.get(dev_id, {}).get(cat_key, {"items": {}, "observations": ""})
            items_results: dict = cat_result.get("items", {})
            observations: str = cat_result.get("observations", "")

            story.append(Paragraph(
                f'<font color="{accent_hex}">▸</font> {device_name}'
                f'  <font color="{_C_GRAY}" size="8">({ip})</font>',
                dev_hdr_style,
            ))

            item_rows = [["Ítem de revisión", "OK", "Warning", "Critical"]]
            for item in cat_items:
                status = items_results.get(item["key"], "")
                label = item["label"] + (" (personalizado)" if item.get("is_custom") else "")
                row_cells = [label, "", "", ""]
                col_map = {"ok": 1, "warning": 2, "critical": 3}
                if status in col_map:
                    row_cells[col_map[status]] = "✓"
                item_rows.append(row_cells)

            item_tbl = Table(item_rows, colWidths=[110 * mm, 14 * mm, 18 * mm, 18 * mm])
            its = TableStyle([
                ("FONTNAME",   (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",   (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_hex)),
                ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
                ("ALIGN",      (1, 0), (-1, -1), "CENTER"),
                ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
                ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#7A99AC")),
                ("PADDING",    (0, 0), (-1, -1), 3),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor(_C_LIGHT)]),
            ])
            for r, item in enumerate(cat_items, 1):
                status = items_results.get(item["key"], "")
                col_map = {"ok": 1, "warning": 2, "critical": 3}
                if status in col_map:
                    col_i = col_map[status]
                    # Sin fondo — solo el color del ✓ según la columna
                    its.add("TEXTCOLOR", (col_i, r), (col_i, r), _CHECK_TEXT_COLOR[status])
                    its.add("FONTNAME",  (col_i, r), (col_i, r), "Helvetica-Bold")
                    its.add("FONTSIZE",  (col_i, r), (col_i, r), 11)
            item_tbl.setStyle(its)
            story.append(item_tbl)

            if observations:
                story.append(Paragraph(f"<b>Observaciones:</b> {observations}", obs_style))

            story.append(Spacer(1, 4 * mm))

        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor(separator_hex)))
        story.append(Spacer(1, 4 * mm))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.build(story, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
