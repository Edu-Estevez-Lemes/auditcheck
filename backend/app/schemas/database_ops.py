from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


class BackupOut(BaseModel):
    path: str
    size: int
    created_at: str


class DatabaseInfoOut(BaseModel):
    db_path: str
    db_size: int
    clients_count: int
    audits_count: int
    devices_count: int
    findings_count: int
    last_backup_at: str | None
    backups_total_size: int
    backups_count: int


class ExportRequest(BaseModel):
    client_ids: list[int] | None = None  # None = exportación completa
    include_credentials: bool = True
    password_mode: Literal["vault", "custom"] = "vault"
    password: str = Field(..., min_length=12)
    confirm_password: str | None = None


class MatrixSyncConfigOut(BaseModel):
    host: str
    port: int
    database: str
    username: str
    has_password: bool
    last_sync_at: str | None
    last_sync_direction: str | None


class MatrixSyncConfigIn(BaseModel):
    host: str = Field(..., min_length=1)
    port: int = Field(default=3306, ge=1, le=65535)
    database: str = Field(..., min_length=1)
    username: str = Field(..., min_length=1)
    # None/vacío = no cambiar la contraseña ya guardada (solo válido si ya había una).
    password: str | None = None


class ImportPreviewOut(BaseModel):
    magic: str
    format_version: int
    exported_at: str
    exported_by: str
    auditcheck_version: str
    clients_count: int
    audits_count: int
    devices_count: int
    findings_count: int
    export_type: Literal["full", "selective"]
    includes_credentials: bool
