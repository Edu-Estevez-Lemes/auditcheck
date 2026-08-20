"""Gestión de categorías, plantillas y personalización de checklist de revisiones.

El catálogo base de ítems (REVIEW_ITEMS) permanece fijo en código; lo que este
módulo gestiona es la capa de personalización que se superpone a ese catálogo:
- categorías (ahora en BD, editables por cualquier usuario)
- plantillas de checklist (privadas por usuario)
- el merge "catálogo base ∓ removed_items ± custom_items" que usan tanto el
  wizard (vía /reviews/checklist) como las exportaciones Excel/PDF.
"""
from __future__ import annotations
import re
import secrets
from sqlalchemy.orm import Session

from ..models.review_category import ReviewCategory
from ..models.review_template import ReviewTemplate
from ..models.review_config import ReviewConfig
from ..models.review import ReviewSession
from ..models.client import Client
from ..reports.review_items import REVIEW_CATEGORIES, get_items_for_device

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    s = _SLUG_RE.sub("_", (text or "").strip().lower()).strip("_")
    return s or "item"


def generate_item_key(label: str) -> str:
    return f"custom_{slugify(label)[:40]}_{secrets.token_hex(3)}"


def generate_category_key(label: str, db: Session) -> str:
    base = slugify(label)[:60]
    key = base
    i = 2
    while db.query(ReviewCategory).filter(ReviewCategory.key == key).first():
        key = f"{base}_{i}"
        i += 1
    return key


# ─── Categorías ─────────────────────────────────────────────────────────────

def seed_categories(db: Session) -> None:
    """Inserta las categorías predefinidas si la tabla está vacía (idempotente)."""
    if db.query(ReviewCategory).first():
        return
    for idx, cat in enumerate(REVIEW_CATEGORIES):
        db.add(ReviewCategory(key=cat["key"], label=cat["label"], order=idx, is_system=True))
    db.commit()


def list_categories(db: Session) -> list[ReviewCategory]:
    return db.query(ReviewCategory).order_by(ReviewCategory.order, ReviewCategory.id).all()


def create_category(
    db: Session, label: str, order: int | None, created_by: int | None, key: str | None = None,
) -> ReviewCategory:
    label = (label or "").strip()
    if not label:
        raise ValueError("La categoría necesita un nombre")
    cat_key = (key or "").strip() or generate_category_key(label, db)
    if db.query(ReviewCategory).filter(ReviewCategory.key == cat_key).first():
        raise ValueError(f"Ya existe una categoría con la clave '{cat_key}'")
    if order is None:
        order = db.query(ReviewCategory).count()
    cat = ReviewCategory(key=cat_key, label=label, order=order, is_system=False, created_by=created_by)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def update_category(db: Session, category: ReviewCategory, label: str | None, order: int | None) -> ReviewCategory:
    if label is not None and label.strip():
        category.label = label.strip()
    if order is not None:
        category.order = order
    db.commit()
    db.refresh(category)
    return category


def reorder_categories(db: Session, ordered_ids: list[int]) -> None:
    cats = {c.id: c for c in db.query(ReviewCategory).filter(ReviewCategory.id.in_(ordered_ids)).all()}
    for idx, cid in enumerate(ordered_ids):
        if cid in cats:
            cats[cid].order = idx
    db.commit()


def category_usage(db: Session, category_key: str) -> dict:
    configs = db.query(ReviewConfig).all()
    config_count = sum(
        1 for c in configs
        if any(category_key in (h.get("categorias") or []) for h in (c.hosts or []))
    )
    sessions = db.query(ReviewSession).all()
    session_count = sum(1 for s in sessions if category_key in (s.categories or []))
    templates = db.query(ReviewTemplate).all()
    template_count = sum(1 for t in templates if category_key in (t.categories or []))
    return {
        "review_configs": config_count,
        "review_sessions": session_count,
        "review_templates": template_count,
        "in_use": (config_count + session_count + template_count) > 0,
    }


def delete_category(db: Session, category: ReviewCategory, force: bool = False) -> dict:
    usage = category_usage(db, category.key)
    if usage["in_use"] and not force:
        return usage
    db.delete(category)
    db.commit()
    return usage


# ─── Ítems: merge catálogo base + personalización ──────────────────────────

def get_effective_items(
    category: str,
    device_type: str,
    removed_items: dict | None,
    custom_items: dict | None,
) -> list[dict]:
    base = get_items_for_device(device_type, category)
    removed = set((removed_items or {}).get(category, {}).get(device_type, []) or [])
    effective = [dict(item, is_custom=False) for item in base if item["key"] not in removed]
    extra = (custom_items or {}).get(category, {}).get(device_type, []) or []
    for it in extra:
        key, label = it.get("key"), it.get("label")
        if key and label:
            effective.append({"key": key, "label": label, "is_custom": True})
    return effective


def _normalize_custom_items(custom_items: dict | None) -> dict:
    """Regenera las keys de ítems personalizados en servidor (nunca confiar en el key del cliente)."""
    result: dict = {}
    for cat, by_type in (custom_items or {}).items():
        result[cat] = {}
        for dtype, items in (by_type or {}).items():
            normalized = []
            for it in items or []:
                label = (it.get("label") or "").strip()
                if not label:
                    continue
                normalized.append({"key": generate_item_key(label), "label": label})
            result[cat][dtype] = normalized
    return result


# ─── Plantillas ─────────────────────────────────────────────────────────────

def list_templates(db: Session, user_id: int) -> list[ReviewTemplate]:
    return (
        db.query(ReviewTemplate)
        .filter(ReviewTemplate.user_id == user_id)
        .order_by(ReviewTemplate.updated_at.desc())
        .all()
    )


def get_owned_template(db: Session, template_id: int, user_id: int) -> ReviewTemplate | None:
    return (
        db.query(ReviewTemplate)
        .filter(ReviewTemplate.id == template_id, ReviewTemplate.user_id == user_id)
        .first()
    )


def create_template(
    db: Session, user_id: int, name: str, description: str | None,
    categories: list[str], removed_items: dict, custom_items: dict,
) -> ReviewTemplate:
    tpl = ReviewTemplate(
        user_id=user_id,
        name=name,
        description=description,
        categories=categories or [],
        removed_items=removed_items or {},
        custom_items=_normalize_custom_items(custom_items),
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


def update_template(
    db: Session, template: ReviewTemplate, name: str | None = None, description: str | None = None,
    categories: list[str] | None = None, removed_items: dict | None = None, custom_items: dict | None = None,
) -> ReviewTemplate:
    if name is not None and name.strip():
        template.name = name.strip()
    if description is not None:
        template.description = description
    if categories is not None:
        template.categories = categories
    if removed_items is not None:
        template.removed_items = removed_items
    if custom_items is not None:
        template.custom_items = _normalize_custom_items(custom_items)
    db.commit()
    db.refresh(template)
    return template


def delete_template(db: Session, template: ReviewTemplate) -> None:
    db.query(ReviewConfig).filter(ReviewConfig.template_id == template.id).update({"template_id": None})
    db.delete(template)
    db.commit()


def affected_clients(db: Session, template: ReviewTemplate) -> list[dict]:
    configs = db.query(ReviewConfig).filter(ReviewConfig.template_id == template.id).all()
    result = []
    for c in configs:
        client = db.query(Client).filter(Client.id == c.client_id).first()
        up_to_date = (c.removed_items == template.removed_items) and (c.custom_items == template.custom_items)
        result.append({
            "client_id": c.client_id,
            "client_name": client.name if client else c.client_nombre,
            "up_to_date": up_to_date,
        })
    return result


def _host_categories(config: ReviewConfig) -> set[str]:
    cats: set[str] = set()
    for h in (config.hosts or []):
        cats.update(h.get("categorias") or [])
    return cats


def diff_template_vs_config(template: ReviewTemplate, config: ReviewConfig) -> dict:
    entries = []
    tpl_removed = template.removed_items or {}
    cfg_removed = config.removed_items or {}
    tpl_custom = template.custom_items or {}
    cfg_custom = config.custom_items or {}

    categories = set(tpl_removed) | set(cfg_removed) | set(tpl_custom) | set(cfg_custom)
    for cat in categories:
        tr_by_type, cr_by_type = tpl_removed.get(cat, {}), cfg_removed.get(cat, {})
        tc_by_type, cc_by_type = tpl_custom.get(cat, {}), cfg_custom.get(cat, {})
        device_types = set(tr_by_type) | set(cr_by_type) | set(tc_by_type) | set(cc_by_type)

        for dtype in device_types:
            tr, cr = set(tr_by_type.get(dtype, [])), set(cr_by_type.get(dtype, []))
            newly_removed = tr - cr

            tc = {it["key"]: it for it in tc_by_type.get(dtype, [])}
            cc = {it["key"]: it for it in cc_by_type.get(dtype, [])}
            added_keys = set(tc) - set(cc)
            dropped_keys = set(cc) - set(tc)

            added_items = [tc[k] for k in added_keys]
            removed_item_keys = list(newly_removed) + list(dropped_keys)

            if added_items or removed_item_keys:
                entries.append({
                    "category": cat,
                    "device_type": dtype,
                    "added_items": added_items,
                    "removed_items": removed_item_keys,
                })

    # Informativo: categorías que la plantilla espera pero que el cliente aún no
    # tiene asignadas a ningún host — no bloquea la propagación (eso es un ajuste
    # manual de hosts en el wizard, no una personalización de ítems).
    categories_added = sorted(set(template.categories or []) - _host_categories(config))
    return {
        "categories_added": categories_added,
        "categories_removed": [],
        "entries": entries,
        "has_changes": bool(entries),
    }


def propagate_template(db: Session, template: ReviewTemplate, client_ids: list[int]) -> int:
    configs = (
        db.query(ReviewConfig)
        .filter(ReviewConfig.template_id == template.id, ReviewConfig.client_id.in_(client_ids))
        .all()
    )
    for c in configs:
        c.removed_items = template.removed_items
        c.custom_items = template.custom_items
    db.commit()
    return len(configs)
