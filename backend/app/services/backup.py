from __future__ import annotations
import logging
from datetime import datetime, timedelta
from pathlib import Path
from sqlalchemy import text

from ..config import settings

# Bloque 3 — Backup de la base de datos
BACKUP_PREFIX = "auditcheck_backup_"
MAX_BACKUPS = 10
AUTO_BACKUP_MAX_AGE_DAYS = 7

logger = logging.getLogger("auditcheck.backup")


def create_backup(dest_dir: Path | None = None) -> dict:
    """Backup atómico vía VACUUM INTO. Devuelve ruta y tamaño."""
    target_dir = dest_dir or settings.BACKUPS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{BACKUP_PREFIX}{datetime.now():%Y-%m-%d_%H%M%S}.db"
    dest = target_dir / filename

    from ..database import engine
    with engine.connect() as conn:
        conn.execute(text("VACUUM INTO :dest"), {"dest": str(dest)})

    size = dest.stat().st_size
    logger.info(f"Backup creado: {dest} ({size} bytes)")
    if dest_dir is None:
        rotate_backups()
    return {"path": str(dest), "size": size, "created_at": datetime.now().isoformat()}


def list_backups() -> list[dict]:
    if not settings.BACKUPS_DIR.exists():
        return []
    files = sorted(
        settings.BACKUPS_DIR.glob(f"{BACKUP_PREFIX}*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return [
        {"path": str(f), "name": f.name, "size": f.stat().st_size,
         "created_at": datetime.fromtimestamp(f.stat().st_mtime).isoformat()}
        for f in files
    ]


def rotate_backups(keep: int = MAX_BACKUPS) -> None:
    backups = list_backups()
    for old in backups[keep:]:
        try:
            Path(old["path"]).unlink()
            logger.info(f"Backup rotado (eliminado): {old['path']}")
        except OSError:
            pass


def total_backups_size() -> int:
    return sum(b["size"] for b in list_backups())


def last_backup_at() -> datetime | None:
    backups = list_backups()
    return datetime.fromisoformat(backups[0]["created_at"]) if backups else None


def maybe_auto_backup() -> None:
    """Bloque 3 — al arrancar, si el último backup tiene más de 7 días (o no hay ninguno), crea uno."""
    last = last_backup_at()
    if last is None or (datetime.now() - last) > timedelta(days=AUTO_BACKUP_MAX_AGE_DAYS):
        try:
            create_backup()
        except Exception as e:
            logger.warning(f"Backup automático fallido: {e}")
