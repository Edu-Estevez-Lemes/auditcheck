from __future__ import annotations
from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin, SyncUuidMixin


class ReviewConfig(Base, TimestampMixin, SyncUuidMixin):
    __tablename__ = "review_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    client_nombre: Mapped[str] = mapped_column(String(500), nullable=False)
    configurado_por: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha_configuracion: Mapped[str] = mapped_column(String(20), nullable=False)
    hosts: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    template_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("review_templates.id", ondelete="SET NULL"), nullable=True
    )
    removed_items: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    custom_items: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
