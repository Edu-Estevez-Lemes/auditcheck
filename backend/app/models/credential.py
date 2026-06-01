from __future__ import annotations
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class Credential(Base, TimestampMixin):
    """
    Almacén cifrado de credenciales.
    Las contraseñas se almacenan SIEMPRE cifradas con Fernet.
    Nunca se exponen en texto plano en APIs, logs ni informes.
    """
    __tablename__ = "credentials"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("clients.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    credential_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Tipos: windows, vmware, veeam, fortigate, ssh, snmp, ilo, idrac, nas, database

    username: Mapped[str | None] = mapped_column(String(255))
    encrypted_password: Mapped[str | None] = mapped_column(Text)
    host: Mapped[str | None] = mapped_column(String(255))
    port: Mapped[int | None] = mapped_column(Integer)
    domain: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)

    # Estado
    status: Mapped[str] = mapped_column(String(20), default="unknown")
    # Estados: unknown, valid, invalid, expired
    last_used: Mapped[str | None] = mapped_column(DateTime, nullable=True)
    last_validated: Mapped[str | None] = mapped_column(DateTime, nullable=True)
    is_preferred: Mapped[bool] = mapped_column(default=False)

    client: Mapped["Client"] = relationship(back_populates="credentials")
