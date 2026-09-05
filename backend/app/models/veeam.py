from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, Float, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, SyncUuidMixin


class BackupJob(Base, TimestampMixin, SyncUuidMixin):
    __tablename__ = "backup_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("audits.id", ondelete="CASCADE"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    job_type: Mapped[str | None] = mapped_column(String(50))  # Backup, Replication, Copy
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    status: Mapped[str | None] = mapped_column(String(50))  # Success, Warning, Failed, Running, None
    last_result: Mapped[str | None] = mapped_column(String(50))
    last_run: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_run: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    processed_gb: Mapped[float | None] = mapped_column(Float)
    transferred_gb: Mapped[float | None] = mapped_column(Float)

    repository_name: Mapped[str | None] = mapped_column(String(255))
    retention_days: Mapped[int | None] = mapped_column(Integer)
    restore_points: Mapped[int | None] = mapped_column(Integer)

    error_message: Mapped[str | None] = mapped_column(Text)
    objects_count: Mapped[int | None] = mapped_column(Integer)


class BackupRepository(Base, TimestampMixin, SyncUuidMixin):
    __tablename__ = "backup_repositories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("audits.id", ondelete="CASCADE"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_type: Mapped[str | None] = mapped_column(String(50))
    host: Mapped[str | None] = mapped_column(String(255))
    path: Mapped[str | None] = mapped_column(String(500))

    capacity_gb: Mapped[float | None] = mapped_column(Float)
    free_gb: Mapped[float | None] = mapped_column(Float)
    used_percent: Mapped[float | None] = mapped_column(Float)
    is_accessible: Mapped[bool] = mapped_column(Boolean, default=True)
