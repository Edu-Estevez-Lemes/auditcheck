from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin


class ReviewSession(Base, TimestampMixin):
    __tablename__ = "review_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    technician_name: Mapped[str] = mapped_column(String(255), nullable=False)
    review_date: Mapped[str] = mapped_column(String(20), nullable=False)
    categories: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    selected_device_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    review_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    exported_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
