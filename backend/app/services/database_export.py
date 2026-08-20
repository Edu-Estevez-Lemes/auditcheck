from __future__ import annotations
import tempfile
from datetime import datetime
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Base
from ..models.audit import Audit
from ..models.device import Device
from . import db_graph

# Bloque 3 — Exportación cifrada (.acbk)


def _counts(db: Session, client_ids: list[int] | None) -> dict:
    from ..models.client import Client
    from ..models.finding import Finding

    if client_ids is None:
        clients_q = db.query(Client)
        audits_q = db.query(Audit)
        devices_q = db.query(Device)
        findings_q = db.query(Finding)
    else:
        clients_q = db.query(Client).filter(Client.id.in_(client_ids))
        audits_q = db.query(Audit).filter(Audit.client_id.in_(client_ids))
        audit_ids = [a.id for a in audits_q]
        devices_q = db.query(Device).filter(Device.audit_id.in_(audit_ids)) if audit_ids else db.query(Device).filter(False)
        findings_q = db.query(Finding).filter(Finding.audit_id.in_(audit_ids)) if audit_ids else db.query(Finding).filter(False)

    return {
        "clients_count": clients_q.count(),
        "audits_count": audits_q.count(),
        "devices_count": devices_q.count(),
        "findings_count": findings_q.count(),
    }


def build_full_export_db() -> Path:
    """Copia atómica completa de la BD viva (todas las tablas)."""
    dest = Path(tempfile.mkdtemp()) / "export_full.db"
    from ..database import engine
    with engine.connect() as conn:
        conn.execute(text("VACUUM INTO :dest"), {"dest": str(dest)})
    return dest


def build_selective_export_db(db: Session, client_ids: list[int], include_credentials: bool) -> Path:
    """Fresh SQLite con el mismo esquema, poblada solo con los clientes indicados."""
    dest = Path(tempfile.mkdtemp()) / "export_selective.db"
    temp_engine = create_engine(f"sqlite:///{dest}")
    Base.metadata.create_all(bind=temp_engine)
    temp_engine.dispose()

    audits = db.query(Audit.id).filter(Audit.client_id.in_(client_ids)).all()
    audit_ids = [a.id for a in audits]
    devices = db.query(Device.id).filter(Device.audit_id.in_(audit_ids)).all() if audit_ids else []
    device_ids = [d.id for d in devices]

    id_sets = {"clients": client_ids, "audits": audit_ids, "devices": device_ids}

    with _connect(dest) as conn:
        conn.execute(text("ATTACH DATABASE :src AS src"), {"src": str(settings.DB_FILE_PATH)})
        for table, fk_col, ref_table in db_graph.TABLE_GRAPH:
            if table == "credentials" and not include_credentials:
                continue
            if fk_col is None:
                ids = id_sets["clients"]
            else:
                ids = id_sets.get(ref_table, [])
            if not ids:
                continue
            ids_csv = ",".join(str(int(i)) for i in ids)
            filter_col = "id" if fk_col is None else fk_col
            # Copia por NOMBRE de columna (no por posición): las tablas con columnas
            # añadidas via ALTER TABLE en _migrate_db() pueden tener orden físico
            # distinto al de una tabla recién creada con Base.metadata.create_all.
            cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))]
            col_list = ", ".join(cols)
            conn.execute(text(
                f"INSERT INTO {table} ({col_list}) SELECT {col_list} FROM src.{table} WHERE {filter_col} IN ({ids_csv})"
            ))
        if not include_credentials:
            conn.execute(text("UPDATE devices SET credential_id = NULL"))
            conn.execute(text("UPDATE device_knowledge SET credential_id = NULL"))
        # El commit debe preceder al DETACH: SQLite no permite desadjuntar una BD
        # que forma parte de una transacción todavía abierta. Cerrar la conexión
        # (fin del `with`) libera igualmente la adjunción, así que el DETACH es
        # solo higiene, no estrictamente necesario.
        conn.commit()
        conn.execute(text("DETACH DATABASE src"))

    return dest


def _connect(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}")
    return engine.connect()


def build_export_header(db: Session, client_ids: list[int] | None, include_credentials: bool, exported_by: str) -> dict:
    counts = _counts(db, client_ids)
    return {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "exported_by": exported_by,
        "auditcheck_version": settings.APP_VERSION,
        "export_type": "full" if client_ids is None else "selective",
        "includes_credentials": include_credentials,
        **counts,
    }
