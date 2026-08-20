from __future__ import annotations
import logging
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

import datetime as _dt
from ..database import get_db
from ..schemas.review import (
    ReviewCreate, ReviewUpdate, ReviewOut,
    ReviewConfigCreate, ReviewConfigOut, ReviewClientStatus,
)
from ..services.auth import get_current_user, get_admin_user
from ..models.review import ReviewSession
from ..models.review_config import ReviewConfig
from ..models.audit import Audit
from ..models.device import Device
from ..models.client import Client
from ..models.user import User
from ..reports.review_items import REVIEW_ITEMS, CATEGORY_DEVICE_TYPES
from ..reports.review_excel import generate_review_excel
from ..reports.report_branding import get_report_colors
from ..services import review_checklist as checklist_svc
from ..config import settings

router = APIRouter(prefix="/reviews", tags=["Revisiones Manuales"])


class _BatchDeleteBody(BaseModel):
    ids: list[int]

_WIN_RESERVED = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _sanitize_filename(s: str, max_len: int = 40) -> str:
    """Remove Windows-invalid chars and truncate."""
    safe = _WIN_RESERVED.sub("_", s)
    safe = safe.strip(". ")
    return safe[:max_len] or "cliente"


def _build_export_data(db: Session, review: ReviewSession) -> dict:
    client = db.query(Client).filter(Client.id == review.client_id).first()

    devices_info = []
    for device_id in review.selected_device_ids:
        device = db.query(Device).filter(Device.id == device_id).first()
        if device:
            devices_info.append({
                "id": device.id,
                "ip_address": device.ip_address,
                "hostname": device.hostname or "",
                "display_name": device.display_name or "",
                "device_type": device.device_type,
            })

    raw_data: dict = review.review_data or {}
    device_categories: dict | None = raw_data.get("_device_categories")
    removed_items: dict = raw_data.get("_removed_items") or {}
    custom_items: dict = raw_data.get("_custom_items") or {}
    results = {k: v for k, v in raw_data.items() if not k.startswith("_")}

    logo_path: str | None = None
    if client and client.logo_path:
        from pathlib import Path as _Path
        p = _Path(client.logo_path)
        if p.exists():
            logo_path = str(p)

    category_labels = {c.key: c.label for c in checklist_svc.list_categories(db)}

    return {
        "client_name": client.name if client else "",
        "technician_name": review.technician_name,
        "review_date": review.review_date,
        "categories": review.categories or [],
        "devices": devices_info,
        "results": results,
        "device_categories": device_categories,
        "removed_items": removed_items,
        "custom_items": custom_items,
        "category_labels": category_labels,
        "report_colors": get_report_colors(db),
        "logo_path": logo_path,
    }


# ─── ReviewConfig endpoints ────────────────────────────────────────────────────

@router.get("/configs/{client_id}", response_model=ReviewConfigOut)
def get_config(
    client_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    config = db.query(ReviewConfig).filter(ReviewConfig.client_id == client_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Sin configuración de revisión")
    return ReviewConfigOut.model_validate(config)


@router.post("/configs", response_model=ReviewConfigOut, status_code=201)
def upsert_config(
    data: ReviewConfigCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    config = db.query(ReviewConfig).filter(ReviewConfig.client_id == data.client_id).first()
    hosts_raw = [h.model_dump() for h in data.hosts]
    if config:
        config.client_nombre = data.client_nombre
        config.configurado_por = data.configurado_por
        config.fecha_configuracion = data.fecha_configuracion
        config.hosts = hosts_raw
        config.template_id = data.template_id
        config.removed_items = data.removed_items
        config.custom_items = data.custom_items
    else:
        config = ReviewConfig(
            client_id=data.client_id,
            client_nombre=data.client_nombre,
            configurado_por=data.configurado_por,
            fecha_configuracion=data.fecha_configuracion,
            hosts=hosts_raw,
            template_id=data.template_id,
            removed_items=data.removed_items,
            custom_items=data.custom_items,
        )
        db.add(config)
    db.commit()
    db.refresh(config)
    return ReviewConfigOut.model_validate(config)


@router.get("/status", response_model=list[ReviewClientStatus])
def get_review_status(
    client_ids: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns review status for multiple clients (comma-separated client_ids)."""
    try:
        ids = [int(x.strip()) for x in client_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="client_ids debe ser lista de enteros separados por coma")

    configs = {
        c.client_id: c
        for c in db.query(ReviewConfig).filter(ReviewConfig.client_id.in_(ids)).all()
    }
    today = _dt.date.today()
    result = []

    for cid in ids:
        config = configs.get(cid)
        last = (
            db.query(ReviewSession)
            .filter(ReviewSession.client_id == cid, ReviewSession.is_completed == True)
            .order_by(ReviewSession.created_at.desc())
            .first()
        )
        days = None
        if last:
            try:
                rd = _dt.date.fromisoformat(last.review_date)
                days = (today - rd).days
            except (ValueError, TypeError):
                pass
        result.append(ReviewClientStatus(
            client_id=cid,
            has_config=config is not None,
            configured_hosts=len(config.hosts) if config else 0,
            last_review_date=last.review_date if last else None,
            last_technician=last.technician_name if last else None,
            last_review_completed=bool(last),
            days_since_review=days,
        ))

    return result


# ─── Checklist & Session endpoints ────────────────────────────────────────────

@router.get("/checklist")
def get_checklist(
    client_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    categories = [
        {"key": c.key, "label": c.label}
        for c in checklist_svc.list_categories(db)
    ]

    removed_items: dict = {}
    custom_items: dict = {}
    if client_id is not None:
        config = db.query(ReviewConfig).filter(ReviewConfig.client_id == client_id).first()
        if config:
            removed_items = config.removed_items or {}
            custom_items = config.custom_items or {}

    items: dict[str, dict[str, list[dict]]] = {}
    for cat_key, by_type in REVIEW_ITEMS.items():
        items[cat_key] = {}
        for device_type in by_type:
            items[cat_key][device_type] = checklist_svc.get_effective_items(
                cat_key, device_type, removed_items, custom_items,
            )
    # Categorías nuevas (sin ítems por defecto) sólo aportan ítems personalizados.
    for cat_key, by_type in custom_items.items():
        items.setdefault(cat_key, {})
        for device_type, custom in by_type.items():
            if device_type not in items[cat_key]:
                items[cat_key][device_type] = checklist_svc.get_effective_items(
                    cat_key, device_type, removed_items, custom_items,
                )

    return {
        "categories": categories,
        "items": items,
        "category_device_types": CATEGORY_DEVICE_TYPES,
    }


@router.get("/last", response_model=ReviewOut | None)
def get_last_review(
    client_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Returns the most recent review for a client, or null if none exists."""
    session = (
        db.query(ReviewSession)
        .filter(ReviewSession.client_id == client_id)
        .order_by(ReviewSession.created_at.desc())
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Sin revisiones previas")
    return ReviewOut.model_validate(session)


@router.get("/", response_model=list[ReviewOut])
def list_reviews(
    audit_id: int | None = None,
    client_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(ReviewSession)
    if audit_id:
        q = q.filter(ReviewSession.audit_id == audit_id)
    if client_id:
        q = q.filter(ReviewSession.client_id == client_id)
    return [ReviewOut.model_validate(s) for s in q.order_by(ReviewSession.created_at.desc()).all()]


@router.post("/", response_model=ReviewOut, status_code=201)
def create_review(
    data: ReviewCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    audit = db.query(Audit).filter(Audit.id == data.audit_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")

    session = ReviewSession(
        audit_id=data.audit_id,
        client_id=audit.client_id,
        technician_name=data.technician_name,
        review_date=data.review_date,
        categories=data.categories,
        selected_device_ids=data.selected_device_ids,
        review_data=data.review_data or {},
        is_completed=False,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return ReviewOut.model_validate(session)


@router.get("/{review_id}", response_model=ReviewOut)
def get_review(review_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    session = db.query(ReviewSession).filter(ReviewSession.id == review_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Revisión no encontrada")
    return ReviewOut.model_validate(session)


@router.put("/{review_id}", response_model=ReviewOut)
def update_review(
    review_id: int, data: ReviewUpdate,
    db: Session = Depends(get_db), _: User = Depends(get_current_user),
):
    session = db.query(ReviewSession).filter(ReviewSession.id == review_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Revisión no encontrada")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(session, field, value)

    db.commit()
    db.refresh(session)
    return ReviewOut.model_validate(session)


@router.delete("/batch", status_code=204)
def batch_delete_reviews(body: _BatchDeleteBody, db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    sessions = db.query(ReviewSession).filter(ReviewSession.id.in_(body.ids)).all()
    for s in sessions:
        db.delete(s)
    db.commit()


@router.delete("/{review_id}", status_code=204)
def delete_review(review_id: int, db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    session = db.query(ReviewSession).filter(ReviewSession.id == review_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Revisión no encontrada")
    db.delete(session)
    db.commit()


@router.get("/{review_id}/export/excel")
def export_excel(review_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    session = db.query(ReviewSession).filter(ReviewSession.id == review_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Revisión no encontrada")

    export_data = _build_export_data(db, session)
    client_slug = _sanitize_filename(export_data["client_name"].replace(" ", "_"))
    filename = f"REVISION_{session.review_date}_{client_slug}.xlsx"
    output_path = settings.AUDITS_DIR / str(session.audit_id) / "reviews" / filename

    try:
        generate_review_excel(export_data, output_path)
    except Exception as exc:
        logger.error("Excel generation failed for review %s: %s", review_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generando Excel: {exc}")

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Error generando el Excel: fichero no creado")

    session.exported_at = _dt.datetime.utcnow()
    db.commit()

    return FileResponse(
        str(output_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@router.get("/{review_id}/export/pdf")
def export_pdf(review_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    session = db.query(ReviewSession).filter(ReviewSession.id == review_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Revisión no encontrada")

    try:
        from ..reports.review_pdf import generate_review_pdf
    except ImportError:
        raise HTTPException(status_code=501, detail="reportlab no instalado. Ejecuta: pip install reportlab")

    export_data = _build_export_data(db, session)
    client_slug = _sanitize_filename(export_data["client_name"].replace(" ", "_"))
    filename = f"REVISION_{session.review_date}_{client_slug}.pdf"
    output_path = settings.AUDITS_DIR / str(session.audit_id) / "reviews" / filename

    try:
        generate_review_pdf(export_data, output_path)
    except ImportError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as exc:
        logger.error("PDF generation failed for review %s: %s", review_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {exc}")

    if not output_path.exists():
        raise HTTPException(status_code=500, detail="Error generando el PDF: fichero no creado")

    session.exported_at = _dt.datetime.utcnow()
    db.commit()

    return FileResponse(str(output_path), media_type="application/pdf", filename=filename)
