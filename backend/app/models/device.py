from __future__ import annotations
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, TimestampMixin


class Device(Base, TimestampMixin):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[int] = mapped_column(Integer, nullable=False)

    ip_address: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    hostname: Mapped[str | None] = mapped_column(String(255))
    netbios_name: Mapped[str | None] = mapped_column(String(255))
    mac_address: Mapped[str | None] = mapped_column(String(17))
    manufacturer: Mapped[str | None] = mapped_column(String(255))
    os_type: Mapped[str | None] = mapped_column(String(100))
    os_version: Mapped[str | None] = mapped_column(String(255))

    device_type: Mapped[str] = mapped_column(String(50), default="unknown")
    # Tipos: windows_server, windows_workstation, linux, esxi, vcenter,
    #        fortigate, nas, switch, router, ilo, idrac, printer,
    #        vmware_appliance, veeam, unknown

    is_up: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    response_time_ms: Mapped[float | None] = mapped_column()
    ttl: Mapped[int | None] = mapped_column(Integer)

    first_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Datos adicionales de integración
    extra_data: Mapped[str | None] = mapped_column()  # JSON como texto

    audit: Mapped["Audit"] = relationship(back_populates="devices")
    ports: Mapped[list["Port"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )


class Port(Base):
    __tablename__ = "ports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False
    )
    audit_id: Mapped[int] = mapped_column(Integer, nullable=False)

    port_number: Mapped[int] = mapped_column(Integer, nullable=False)
    protocol: Mapped[str] = mapped_column(String(10), default="tcp")
    service: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(20), default="open")
    banner: Mapped[str | None] = mapped_column(String(500))
    is_risky: Mapped[bool] = mapped_column(Boolean, default=False)

    device: Mapped["Device"] = relationship(back_populates="ports")
