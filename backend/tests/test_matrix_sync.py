"""Pruebas del motor de Sincronización con la matriz (services/matrix_sync.py).

Usan dos bases de datos SQLite en memoria reales (una como "local", otra como
"matriz") en vez de mocks, igual que test_manual_audit.py. MySQL en sí no se
prueba aquí (motor genérico vía SQLAlchemy Core, sin SQL específico de MySQL
salvo en la URL de conexión) — lo relevante a cubrir es el diff/aplicación:
remapeo de FKs por uuid, detección de cambios, y la regla de borrado
direccional (pull nunca borra, push sí espeja borrados).
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import Base
from app.services import matrix_sync


def _make_engine():
    # Misma PRAGMA que app/database.py: sin foreign_keys=ON, SQLite no aplica
    # el ondelete=CASCADE declarado en los modelos y un DELETE en clients no
    # arrastraría sus audits (comportamiento distinto al de producción).
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture()
def local_engine():
    return _make_engine()


@pytest.fixture()
def remote_engine():
    return _make_engine()


def _insert_client(engine, name: str) -> int:
    with engine.connect() as c:
        c.execute(text(
            "INSERT INTO clients (name, is_active, created_at, updated_at, uuid) "
            "VALUES (:n, 1, datetime('now'), datetime('now'), lower(hex(randomblob(16))))"
        ), {"n": name})
        c.commit()
        return c.execute(text("SELECT id FROM clients WHERE name = :n"), {"n": name}).fetchone()[0]


def _insert_audit(engine, client_id: int, name: str) -> int:
    with engine.connect() as c:
        c.execute(text(
            "INSERT INTO audits (client_id, name, status, audit_type, created_at, updated_at, uuid) "
            "VALUES (:cid, :n, 'draft', 'scan', datetime('now'), datetime('now'), lower(hex(randomblob(16))))"
        ), {"cid": client_id, "n": name})
        c.commit()
        return c.execute(text("SELECT id FROM audits WHERE name = :n"), {"n": name}).fetchone()[0]


def test_push_inserts_and_remaps_fk_by_uuid(local_engine, remote_engine):
    cid = _insert_client(local_engine, "Cliente A")
    _insert_audit(local_engine, cid, "Auditoria A")

    # Preview y aplicación deben coincidir exactamente (regresión: el preview
    # descartaba silenciosamente las filas hijas de un padre también nuevo).
    preview = matrix_sync.run_sync(local_engine, remote_engine, "push", dry_run=True)
    result = matrix_sync.run_sync(local_engine, remote_engine, "push", dry_run=False)
    assert preview.per_table["audits"].insert == result.per_table["audits"].insert == 1
    assert preview.total_changes == result.total_changes

    with remote_engine.connect() as c:
        remote_client_id = c.execute(text("SELECT id FROM clients WHERE name = 'Cliente A'")).fetchone()[0]
        remote_audit_client_id = c.execute(text("SELECT client_id FROM audits WHERE name = 'Auditoria A'")).fetchone()[0]
    # La FK remota debe apuntar al cliente remoto (emparejado por uuid), no copiar el id local tal cual.
    assert remote_audit_client_id == remote_client_id


def test_push_is_idempotent(local_engine, remote_engine):
    _insert_client(local_engine, "Cliente A")
    matrix_sync.run_sync(local_engine, remote_engine, "push", dry_run=False)
    again = matrix_sync.run_sync(local_engine, remote_engine, "push", dry_run=True)
    assert again.total_changes == 0


def test_push_detects_update_ignoring_local_ids(local_engine, remote_engine):
    _insert_client(local_engine, "Cliente A")
    matrix_sync.run_sync(local_engine, remote_engine, "push", dry_run=False)

    with local_engine.connect() as c:
        c.execute(text("UPDATE clients SET name = 'Cliente A Editado' WHERE name = 'Cliente A'"))
        c.commit()

    result = matrix_sync.run_sync(local_engine, remote_engine, "push", dry_run=False)
    assert result.per_table["clients"].update == 1
    with remote_engine.connect() as c:
        assert c.execute(text("SELECT name FROM clients")).fetchone()[0] == "Cliente A Editado"


def test_pull_never_deletes_local_only_rows(local_engine, remote_engine):
    _insert_client(local_engine, "Solo local")
    result = matrix_sync.run_sync(local_engine, remote_engine, "pull", dry_run=False)
    assert result.total_changes == 0
    with local_engine.connect() as c:
        assert c.execute(text("SELECT COUNT(*) FROM clients")).fetchone()[0] == 1


def test_pull_inserts_matriz_only_rows(local_engine, remote_engine):
    _insert_client(remote_engine, "Solo matriz")
    result = matrix_sync.run_sync(local_engine, remote_engine, "pull", dry_run=False)
    assert result.per_table["clients"].insert == 1
    with local_engine.connect() as c:
        assert c.execute(text("SELECT name FROM clients")).fetchone()[0] == "Solo matriz"


def test_push_mirrors_deletes_children_before_parents(local_engine, remote_engine):
    cid = _insert_client(local_engine, "Cliente A")
    _insert_audit(local_engine, cid, "Auditoria A")
    matrix_sync.run_sync(local_engine, remote_engine, "push", dry_run=False)

    with local_engine.connect() as c:
        c.execute(text("DELETE FROM clients WHERE name = 'Cliente A'"))
        c.commit()

    result = matrix_sync.run_sync(local_engine, remote_engine, "push", dry_run=False)
    assert result.per_table["audits"].delete == 1
    assert result.per_table["clients"].delete == 1
    with remote_engine.connect() as c:
        assert c.execute(text("SELECT COUNT(*) FROM clients")).fetchone()[0] == 0
        assert c.execute(text("SELECT COUNT(*) FROM audits")).fetchone()[0] == 0
