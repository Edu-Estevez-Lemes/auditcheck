from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class Audit(Base, TimestampMixin):
    __tablename__ = "audits"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    technician_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    # Estados: pending, scanning, completed, error

    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    file_path: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)

    # JSON con resumen de la auditoría
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Rangos IP auditados (snapshot)
    scanned_ranges: Mapped[str | None] = mapped_column(Text)

    # Versión de la app al momento de la auditoría
    app_version: Mapped[str | None] = mapped_column(String(20))

    client: Mapped["Client"] = relationship(back_populates="audits")
    technician: Mapped["User"] = relationship()
    devices: Mapped[list["Device"]] = relationship(
        back_populates="audit", cascade="all, delete-orphan"
    )
    findings: Mapped[list["Finding"]] = relationship(
        back_populates="audit", cascade="all, delete-orphan"
    )
