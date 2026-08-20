from __future__ import annotations
import sqlite3
import tempfile
from pathlib import Path
from sqlalchemy import text

from ..config import settings
from . import acbk, db_graph

# Bloque 3 — Importación / restauración

REQUIRED_TABLES = {"clients", "audits", "devices"}


class ImportError_(Exception):
    """Error de negocio de importación (esquema inválido, passphrase incorrecta, etc.)."""


def read_preview(acbk_path: Path) -> dict:
    """Cabecera en claro, sin contraseña. Para la previsualización antes de pedir la passphrase."""
    try:
        return acbk.read_header(acbk_path)
    except acbk.AcbkError as e:
        raise ImportError_(str(e)) from e


def decrypt_to_temp(acbk_path: Path, password: str) -> Path:
    try:
        db_bytes = acbk.unpack(acbk_path, password)
    except acbk.AcbkError as e:
        raise ImportError_(str(e)) from e

    tmp = Path(tempfile.mkdtemp()) / "import_payload.db"
    tmp.write_bytes(db_bytes)
    validate_schema(tmp)
    return tmp


def validate_schema(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        conn.close()
    if not REQUIRED_TABLES.issubset(tables):
        raise ImportError_("El fichero no contiene un esquema de base de datos de AuditCheck válido")


def restore_full(db_path: Path) -> None:
    """Reemplaza por completo la BD viva por la importada. Requiere backup previo del llamante."""
    from ..database import engine
    with engine.connect() as conn:
        conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
    engine.dispose()

    target = settings.DB_FILE_PATH
    target.write_bytes(db_path.read_bytes())
    for suffix in ("-wal", "-shm"):
        sidecar = target.with_name(target.name + suffix)
        if sidecar.exists():
            sidecar.unlink()


def _insert_remapped(conn, table: str, row, cols: list[str], fk_overrides: dict) -> int:
    values = {col: fk_overrides[col] if col in fk_overrides else row[col] for col in cols}
    col_list = ", ".join(cols)
    placeholders = ", ".join(f":{c}" for c in cols)
    result = conn.execute(text(f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})"), values)
    return result.lastrowid


def merge_or_replace(imp_db_path: Path, mode: str, include_credentials: bool) -> dict:
    """
    mode: "merge" (añade clientes nuevos, no toca los existentes) o
          "replace" (sobrescribe los clientes coincidentes por cif_nif).
    Remapea IDs tabla a tabla (orden db_graph.TABLE_GRAPH) para evitar
    colisiones con los IDs ya existentes en la BD destino.
    """
    from ..database import engine

    id_maps: dict[str, dict[int, int]] = {t[0]: {} for t in db_graph.TABLE_GRAPH}
    stats = {"clients_added": 0, "clients_replaced": 0, "clients_skipped": 0}

    with engine.connect() as conn:
        conn.execute(text("ATTACH DATABASE :src AS imp"), {"src": str(imp_db_path)})
        try:
            imp_clients = conn.execute(text("SELECT * FROM imp.clients")).mappings().all()
            client_cols = [c for c in imp_clients[0].keys() if c != "id"] if imp_clients else []

            for row in imp_clients:
                cif = row.get("cif_nif")
                existing_id = None
                if cif:
                    existing = conn.execute(
                        text("SELECT id FROM clients WHERE cif_nif = :cif"), {"cif": cif}
                    ).first()
                    existing_id = existing[0] if existing else None

                if existing_id and mode == "merge":
                    stats["clients_skipped"] += 1
                    continue  # no se procesan sus hijos: no entra en id_maps["clients"]

                if existing_id and mode == "replace":
                    conn.execute(text("DELETE FROM clients WHERE id = :id"), {"id": existing_id})
                    stats["clients_replaced"] += 1
                else:
                    stats["clients_added"] += 1

                new_id = _insert_remapped(conn, "clients", row, client_cols, {})
                id_maps["clients"][row["id"]] = new_id

            for table, fk_col, ref_table in db_graph.TABLE_GRAPH:
                if table == "clients":
                    continue
                if table == "credentials" and not include_credentials:
                    continue
                rows = conn.execute(text(f"SELECT * FROM imp.{table}")).mappings().all()
                if not rows:
                    continue
                cols = [c for c in rows[0].keys() if c != "id"]
                extra_fks = db_graph.EXTRA_FK_COLUMNS.get(table, [])

                for row in rows:
                    parent_old = row.get(fk_col) if fk_col else None
                    if fk_col and parent_old not in id_maps.get(ref_table, {}):
                        continue  # el padre fue omitido (cliente ya existente en modo fusionar)

                    fk_overrides = {}
                    if fk_col:
                        fk_overrides[fk_col] = id_maps[ref_table][parent_old]
                    for col, ref in extra_fks:
                        old_val = row.get(col)
                        if old_val is not None:
                            fk_overrides[col] = id_maps.get(ref, {}).get(old_val)  # None -> queda NULL

                    new_id = _insert_remapped(conn, table, row, cols, fk_overrides)
                    id_maps[table][row["id"]] = new_id

            # El commit debe preceder al DETACH (SQLite no desadjunta una BD con una
            # transacción abierta); cerrar la conexión también libera la adjunción.
            conn.commit()
            conn.execute(text("DETACH DATABASE imp"))
        except Exception:
            conn.rollback()
            raise

    return stats
