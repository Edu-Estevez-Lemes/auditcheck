from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.review_category import (
    ReviewCategoryCreate, ReviewCategoryUpdate, ReviewCategoryOut, ReviewCategoryReorder,
)
from ..services.auth import get_current_user
from ..services import review_checklist as svc
from ..models.review_category import ReviewCategory
from ..models.user import User

router = APIRouter(prefix="/reviews/categories", tags=["Categorías de Revisión"])


@router.get("/", response_model=list[ReviewCategoryOut])
def list_categories(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.list_categories(db)


@router.post("/", response_model=ReviewCategoryOut, status_code=201)
def create_category(
    data: ReviewCategoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return svc.create_category(db, data.label, data.order, user.id, data.key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/reorder", status_code=204)
def reorder_categories(
    data: ReviewCategoryReorder,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    svc.reorder_categories(db, data.order)


@router.put("/{category_id}", response_model=ReviewCategoryOut)
def update_category(
    category_id: int,
    data: ReviewCategoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    category = db.query(ReviewCategory).filter(ReviewCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return svc.update_category(db, category, data.label, data.order)


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    category = db.query(ReviewCategory).filter(ReviewCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    usage = svc.delete_category(db, category, force=force)
    if usage["in_use"] and not force:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "La categoría está en uso. Confirma para eliminarla de todos modos.",
                "usage": usage,
            },
        )
