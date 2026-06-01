from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class Finding(Base, TimestampMixin):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True
    )
    client_id: Mapped[int] = mapped_column(Integer, nullable=False)

    category: Mapped[str] = mapped_column(String(100), nullable=False)
    # Categorías: network, backup, vmware, storage, security, hardware,
    #             software, configuration, availability, performance

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    evidence: Mapped[str | None] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(Text)

    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    # Severidades: critical, high, medium, low, informational

    status: Mapped[str] = mapped_column(String(20), default="open")
    # Estados: open, resolved, accepted, false_positive

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text)

    audit: Mapped["Audit"] = relationship(back_populates="findings")
    device: Mapped["Device"] = relationship()
