from __future__ import annotations
from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin


class ReviewTemplate(Base, TimestampMixin):
    __tablename__ = "review_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    categories: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    removed_items: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    custom_items: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
