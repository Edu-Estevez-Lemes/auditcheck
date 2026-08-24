"""Gestión de avatares de usuario: presets (renderizados en el frontend, sin
archivo) y avatares personalizados subidos (foto o GIF, guardados en disco).
"""
from __future__ import annotations
from pathlib import Path

from ..config import settings

# Claves de preset — deben coincidir exactamente con AVATAR_PRESETS en
# frontend/src/components/Avatar.tsx (el frontend decide icono/color; aquí
# solo se valida que la clave sea una de las conocidas).
AVATAR_PRESET_KEYS = (
    "violet", "blue", "cyan", "green", "amber", "orange", "rose", "slate",
)

ALLOWED_AVATAR_CONTENT_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 MB


def custom_avatar_path(user_id: int) -> Path | None:
    """Devuelve la ruta del archivo de avatar personalizado del usuario, si existe."""
    if not settings.AVATARS_DIR.exists():
        return None
    for ext in ALLOWED_AVATAR_CONTENT_TYPES.values():
        p = settings.AVATARS_DIR / f"{user_id}.{ext}"
        if p.exists():
            return p
    return None


def clear_custom_avatar(user_id: int) -> None:
    """Elimina cualquier archivo de avatar personalizado previo del usuario
    (independientemente de su extensión), para no dejar huérfanos al
    re-subir con un formato distinto o al volver a un preset."""
    if not settings.AVATARS_DIR.exists():
        return
    for ext in ALLOWED_AVATAR_CONTENT_TYPES.values():
        p = settings.AVATARS_DIR / f"{user_id}.{ext}"
        if p.exists():
            p.unlink()


def save_custom_avatar(user_id: int, content_type: str, data: bytes) -> str:
    """Guarda el avatar subido y devuelve el valor a persistir en User.avatar."""
    ext = ALLOWED_AVATAR_CONTENT_TYPES[content_type]
    settings.AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    clear_custom_avatar(user_id)
    (settings.AVATARS_DIR / f"{user_id}.{ext}").write_bytes(data)
    return "custom"
