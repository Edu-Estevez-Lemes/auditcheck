from __future__ import annotations
from sqlalchemy import String, Text, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    cif_nif: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)
    contact_person: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    logo_path: Mapped[str | None] = mapped_column(String(500))
    observations: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    ip_ranges: Mapped[list[IPRange]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    credentials: Mapped[list["Credential"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    audits: Mapped[list["Audit"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )


class IPRange(Base):
    __tablename__ = "ip_ranges"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    range: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    client: Mapped[Client] = relationship(back_populates="ip_ranges")
