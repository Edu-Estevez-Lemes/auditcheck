"""Colores de interfaz configurables desde Identidad visual (Configuración)."""
from __future__ import annotations
from sqlalchemy.orm import Session
from ..models.ui_theme import UIThemeConfig


def get_ui_theme_config(db: Session) -> UIThemeConfig:
    """Devuelve la fila singleton (id=1), creándola vacía (= paleta por
    defecto en ambos modos) si todavía no existe."""
    config = db.query(UIThemeConfig).filter(UIThemeConfig.id == 1).first()
    if not config:
        config = UIThemeConfig(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config
