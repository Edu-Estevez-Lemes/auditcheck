from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.review_template import (
    ReviewTemplateCreate, ReviewTemplateUpdate, ReviewTemplateOut,
    ReviewTemplateAffectedClient, ReviewTemplateDiff, ReviewTemplatePropagateRequest,
)
from ..services.auth import get_current_user
from ..services import review_checklist as svc
from ..models.review_config import ReviewConfig
from ..models.client import Client
from ..models.user import User

router = APIRouter(prefix="/reviews/templates", tags=["Plantillas de Checklist"])


def _get_owned_or_404(db: Session, template_id: int, user: User):
    template = svc.get_owned_template(db, template_id, user.id)
    if not template:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    return template


@router.get("/", response_model=list[ReviewTemplateOut])
def list_templates(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.list_templates(db, user.id)


@router.post("/", response_model=ReviewTemplateOut, status_code=201)
def create_template(
    data: ReviewTemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="La plantilla necesita un nombre")
    return svc.create_template(
        db, user.id, data.name.strip(), data.description,
        data.categories, data.removed_items, data.custom_items,
    )


@router.get("/{template_id}", response_model=ReviewTemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_owned_or_404(db, template_id, user)


@router.put("/{template_id}", response_model=ReviewTemplateOut)
def update_template(
    template_id: int, data: ReviewTemplateUpdate,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    template = _get_owned_or_404(db, template_id, user)
    return svc.update_template(
        db, template, data.name, data.description, data.categories, data.removed_items, data.custom_items,
    )


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    template = _get_owned_or_404(db, template_id, user)
    svc.delete_template(db, template)


@router.get("/{template_id}/affected-clients", response_model=list[ReviewTemplateAffectedClient])
def affected_clients(template_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    template = _get_owned_or_404(db, template_id, user)
    return svc.affected_clients(db, template)


@router.get("/{template_id}/diff/{client_id}", response_model=ReviewTemplateDiff)
def diff_with_client(
    template_id: int, client_id: int,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    template = _get_owned_or_404(db, template_id, user)
    config = db.query(ReviewConfig).filter(ReviewConfig.client_id == client_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="El cliente no tiene configuración de revisión")
    client = db.query(Client).filter(Client.id == client_id).first()
    diff = svc.diff_template_vs_config(template, config)
    return ReviewTemplateDiff(
        client_id=client_id,
        client_name=client.name if client else config.client_nombre,
        **diff,
    )


@router.post("/{template_id}/propagate")
def propagate_template(
    template_id: int, data: ReviewTemplatePropagateRequest,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    template = _get_owned_or_404(db, template_id, user)
    updated = svc.propagate_template(db, template, data.client_ids)
    return {"updated": updated}
