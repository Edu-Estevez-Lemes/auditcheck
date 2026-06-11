from __future__ import annotations
import datetime as dt
import logging
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..database import get_db
from ..schemas.review import ReviewCreate, ReviewUpdate, ReviewOut
from ..services.auth import get_current_user
from ..models.review import ReviewSession
from ..models.audit import Audit
from ..models.device import Device
from ..models.client import Client
from ..models.user import User
from ..reports.review_items import REVIEW_ITEMS, REVIEW_CATEGORIES
from ..reports.review_excel import generate_review_excel
from ..config import settings

router = APIRouter(prefix="/reviews", tags=["Revisiones Manuales"])

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
    # Extract per-device category assignments stored by the frontend
    device_categories: dict | None = raw_data.get("_device_categories")
    # Build clean results dict without the private key
    results = {k: v for k, v in raw_data.items() if not k.startswith("_")}

    return {
        "client_name": client.name if client else "",
        "technician_name": review.technician_name,
        "review_date": review.review_date,
        "categories": review.categories or [],
        "devices": devices_info,
        "results": results,
        "device_categories": device_categories,
    }


@router.get("/checklist")
def get_checklist(_: User = Depends(get_current_user)):
    return {"categories": REVIEW_CATEGORIES, "items": REVIEW_ITEMS}


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


@router.delete("/{review_id}", status_code=204)
def delete_review(review_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
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

    session.exported_at = dt.datetime.utcnow()
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

    session.exported_at = dt.datetime.utcnow()
    db.commit()

    return FileResponse(str(output_path), media_type="application/pdf", filename=filename)
