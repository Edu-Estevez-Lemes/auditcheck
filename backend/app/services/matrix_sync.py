"""
Sincronización de Base de Datos — motor genérico SQLite (embebida) ↔ MySQL (matriz).

Cada tabla sincronizable lleva una columna `uuid` estable (SyncUuidMixin, ver
models/base.py) que se usa para emparejar filas entre ambas bases de datos —
el `id` autoincremental es local a cada instalación y nunca se compara ni se
copia entre ellas.

Dirección "pull" (matriz → local): trae altas y cambios de la matriz. NUNCA
borra filas locales — una fila que solo existe en local (p.ej. trabajo de campo
de un técnico aún no subido) se deja intacta aunque no exista en la matriz.

Dirección "push" (local → matriz, solo superadmin): espejo completo —
inserta, actualiza y también elimina en la matriz lo que ya no existe en local.

Sin fusión campo a campo: en un conflicto (misma fila, distinto contenido) gana
siempre el lado de origen de la dirección elegida.
"""
from __future__ import annotations
import logging
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import quote_plus

from sqlalchemy import create_engine, select, Table
from sqlalchemy.engine import Engine, Connection
from sqlalchemy.exc import SQLAlchemyError

from ..models import Base

logger = logging.getLogger("auditcheck.matrix_sync")


class MatrixSyncError(Exception):
    """Error de negocio del sync (conexión, tabla sin uuid, etc.)."""


# Tablas que nunca participan en la sincronización: configuración puramente local
# de esta instalación (la propia conexión a la matriz).
EXCLUDED_TABLES = {"matrix_sync_config"}

# Columnas que referencian a otra tabla por id pero sin una constraint
# ForeignKey() declarada en el modelo (ver backend/app/models/device.py,
# finding.py, audit_log.py) — hace falta el mapeo manual para poder remapear
# el id local al id correspondiente en la base de datos destino.
EXTRA_FK: dict[tuple[str, str], str] = {
    ("devices", "client_id"): "clients",
    ("devices", "credential_id"): "credentials",
    ("ports", "audit_id"): "audits",
    ("device_knowledge", "client_id"): "clients",
    ("device_knowledge", "credential_id"): "credentials",
    ("device_knowledge", "last_seen_audit_id"): "audits",
    ("findings", "client_id"): "clients",
    ("audit_log", "user_id"): "users",
}


@dataclass
class TableDiff:
    insert: int = 0
    update: int = 0
    delete: int = 0

    @property
    def total(self) -> int:
        return self.insert + self.update + self.delete


@dataclass
class SyncResult:
    direction: str
    per_table: dict[str, TableDiff] = field(default_factory=dict)

    @property
    def total_changes(self) -> int:
        return sum(t.total for t in self.per_table.values())

    def summary_lines(self) -> list[str]:
        lines = []
        for name, d in self.per_table.items():
            if d.total == 0:
                continue
            parts = []
            if d.insert:
                parts.append(f"+{d.insert} nueva(s)")
            if d.update:
                parts.append(f"~{d.update} modificada(s)")
            if d.delete:
                parts.append(f"-{d.delete} eliminada(s)")
            lines.append(f"  {name}: {', '.join(parts)}")
        if not lines:
            lines.append("  Sin diferencias.")
        return lines


def build_mysql_url(host: str, port: int, username: str, password: str, database: str) -> str:
    return (
        f"mysql+pymysql://{quote_plus(username)}:{quote_plus(password)}"
        f"@{host}:{port}/{database}?charset=utf8mb4"
    )


def test_connection(host: str, port: int, username: str, password: str, database: str) -> None:
    """Lanza MatrixSyncError con un mensaje legible si no se puede conectar."""
    url = build_mysql_url(host, port, username, password, database)
    engine = create_engine(url, connect_args={"connect_timeout": 5})
    try:
        with engine.connect() as conn:
            conn.execute(select(1))
    except SQLAlchemyError as e:
        raise MatrixSyncError(f"No se pudo conectar a la matriz: {e}") from e
    finally:
        engine.dispose()


def _syncable_tables() -> list[Table]:
    tables = []
    for table in Base.metadata.sorted_tables:
        if table.name in EXCLUDED_TABLES:
            continue
        if "uuid" not in table.columns:
            continue
        tables.append(table)
    return tables


def _fk_targets(table: Table) -> dict[str, str]:
    """Columna -> nombre de tabla referenciada, combinando FKs declaradas y EXTRA_FK."""
    targets: dict[str, str] = {}
    for col in table.columns:
        for fk in col.foreign_keys:
            targets[col.name] = fk.column.table.name
    for (tbl_name, col_name), target in EXTRA_FK.items():
        if tbl_name == table.name:
            targets[col_name] = target
    return targets


def _fetch_rows(conn: Connection, table: Table) -> dict[str, dict]:
    rows = conn.execute(select(table)).mappings().all()
    return {r["uuid"]: dict(r) for r in rows if r.get("uuid")}


def _canonical(row: dict, fk_targets: dict[str, str], id_to_uuid: dict[str, dict[int, str]]) -> dict:
    """Representación comparable de una fila: los ids de FK se sustituyen por el
    uuid de la fila referenciada, para no confundir 'ids numéricos distintos'
    (normal entre dos bases de datos) con un cambio real de contenido."""
    out = {}
    for col, value in row.items():
        if col == "id":
            continue
        if col in fk_targets and value is not None:
            parent_table = fk_targets[col]
            out[col] = ("__fk__", parent_table, id_to_uuid.get(parent_table, {}).get(value))
        else:
            out[col] = value
    return out


def _resolve_fk_value(
    raw_value, parent_table: str, dst_uuid_to_id: dict[str, dict[str, int]],
    src_id_to_uuid: dict[str, dict[int, str]],
) -> tuple[bool, int | None]:
    """Devuelve (resuelto, valor_destino). resuelto=False si no se pudo mapear
    (padre no sincronizado todavía en destino) — la fila que lo use debe
    tratarse con cautela: se deja en NULL si la columna lo permite."""
    if raw_value is None:
        return True, None
    parent_uuid = src_id_to_uuid.get(parent_table, {}).get(raw_value)
    if parent_uuid is None:
        return False, None
    dst_id = dst_uuid_to_id.get(parent_table, {}).get(parent_uuid)
    if dst_id is None:
        return False, None
    return True, dst_id


def run_sync(
    local_engine: Engine,
    remote_engine: Engine,
    direction: str,
    dry_run: bool,
    progress: Callable[[str], None] | None = None,
) -> SyncResult:
    """Motor único de diff + aplicación. `progress(line)` recibe una línea de
    texto por tabla procesada (para streaming en vivo, p.ej. hacia la consola)."""
    if direction not in ("pull", "push"):
        raise MatrixSyncError(f"Dirección de sincronización inválida: {direction}")

    result = SyncResult(direction=direction)
    tables = _syncable_tables()

    # Estado acumulado a través de todas las tablas, en orden de dependencia
    # (padres antes que hijos) — necesario para remapear FKs de tablas hijas.
    src_id_to_uuid: dict[str, dict[int, str]] = {}
    dst_uuid_to_id: dict[str, dict[str, int]] = {}

    def _notify(line: str) -> None:
        logger.info(line)
        if progress:
            progress(line)

    try:
        with local_engine.connect() as local_conn, remote_engine.connect() as remote_conn:
            src_conn, dst_conn = (remote_conn, local_conn) if direction == "pull" else (local_conn, remote_conn)

            # ── Fase 1: altas y cambios, padres → hijos ──────────────────────
            for table in tables:
                diff = TableDiff()
                fk_targets = _fk_targets(table)

                src_rows = _fetch_rows(src_conn, table)
                dst_rows = _fetch_rows(dst_conn, table)

                src_id_to_uuid[table.name] = {r["id"]: u for u, r in src_rows.items()}
                dst_uuid_to_id[table.name] = {u: r["id"] for u, r in dst_rows.items()}
                # Mapa inverso (id destino -> uuid) de todas las tablas padre ya
                # procesadas, usado solo para comparar el contenido de filas que
                # existen en ambos lados (no cambia durante el bucle de esta tabla).
                dst_id_to_uuid = {t: {v: k for k, v in m.items()} for t, m in dst_uuid_to_id.items()}

                for row_uuid, src_row in src_rows.items():
                    values = {k: v for k, v in src_row.items() if k != "id"}
                    unresolved = False
                    for col, parent_table in fk_targets.items():
                        raw = src_row.get(col)
                        resolved, dst_value = _resolve_fk_value(raw, parent_table, dst_uuid_to_id, src_id_to_uuid)
                        if not resolved:
                            if table.columns[col].nullable:
                                values[col] = None
                            else:
                                unresolved = True
                                break
                        else:
                            values[col] = dst_value

                    if row_uuid not in dst_rows:
                        if unresolved:
                            _notify(f"  ! {table.name}: fila {row_uuid} omitida (referencia no resoluble)")
                            continue
                        diff.insert += 1
                        if not dry_run:
                            res = dst_conn.execute(table.insert().values(**values))
                            new_id = res.inserted_primary_key[0]
                        else:
                            # Id ficticio, nunca persistido: solo para que las tablas hijas
                            # de esta fila puedan resolver la FK durante el propio preview
                            # (si no, una fila nueva cuyo padre también es nuevo se
                            # descartaría del recuento por "referencia no resoluble").
                            new_id = f"__pending__:{row_uuid}"
                        dst_uuid_to_id[table.name][row_uuid] = new_id
                    else:
                        dst_row = dst_rows[row_uuid]
                        canon_src = _canonical(src_row, fk_targets, src_id_to_uuid)
                        canon_dst = _canonical(dst_row, fk_targets, dst_id_to_uuid)
                        if canon_src != canon_dst:
                            if unresolved:
                                _notify(f"  ! {table.name}: fila {row_uuid} no actualizada (referencia no resoluble)")
                                continue
                            diff.update += 1
                            if not dry_run:
                                dst_conn.execute(
                                    table.update().where(table.c.uuid == row_uuid).values(**values)
                                )

                result.per_table[table.name] = diff

            # ── Fase 2: bajas, hijos → padres (solo push) ────────────────────
            if direction == "push":
                for table in reversed(tables):
                    src_rows = _fetch_rows(src_conn, table)
                    dst_rows = _fetch_rows(dst_conn, table)
                    to_delete = set(dst_rows) - set(src_rows)
                    result.per_table.setdefault(table.name, TableDiff()).delete = len(to_delete)
                    if not dry_run:
                        for row_uuid in to_delete:
                            dst_conn.execute(table.delete().where(table.c.uuid == row_uuid))

            if not dry_run:
                dst_conn.commit()
    except SQLAlchemyError as e:
        raise MatrixSyncError(f"Fallo durante la sincronización: {e}") from e

    return result
