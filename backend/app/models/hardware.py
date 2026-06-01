from __future__ import annotations
from sqlalchemy import String, Text, Integer, ForeignKey, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin


class FortiGateStatus(Base, TimestampMixin):
    __tablename__ = "fortigate_status"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("audits.id", ondelete="CASCADE"))
    device_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)

    hostname: Mapped[str | None] = mapped_column(String(255))
    firmware: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))

    cpu_usage_percent: Mapped[float | None] = mapped_column(Float)
    ram_usage_percent: Mapped[float | None] = mapped_column(Float)
    uptime_seconds: Mapped[int | None] = mapped_column(Integer)

    ha_mode: Mapped[str | None] = mapped_column(String(50))
    ha_status: Mapped[str | None] = mapped_column(String(50))

    wan_interfaces: Mapped[str | None] = mapped_column(Text)  # JSON
    vpn_tunnels: Mapped[str | None] = mapped_column(Text)  # JSON
    license_status: Mapped[str | None] = mapped_column(Text)  # JSON
    alerts: Mapped[str | None] = mapped_column(Text)  # JSON


class SNMPDevice(Base, TimestampMixin):
    __tablename__ = "snmp_devices"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("audits.id", ondelete="CASCADE"))
    device_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)

    sys_name: Mapped[str | None] = mapped_column(String(255))
    sys_description: Mapped[str | None] = mapped_column(Text)
    sys_location: Mapped[str | None] = mapped_column(String(255))
    sys_contact: Mapped[str | None] = mapped_column(String(255))
    uptime_ticks: Mapped[int | None] = mapped_column(Integer)

    interfaces: Mapped[str | None] = mapped_column(Text)  # JSON
    snmp_version: Mapped[str | None] = mapped_column(String(10))


class HardwareStatus(Base, TimestampMixin):
    """Estado hardware de iLO / iDRAC"""
    __tablename__ = "hardware_status"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("audits.id", ondelete="CASCADE"))
    device_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)

    hardware_type: Mapped[str | None] = mapped_column(String(20))  # ilo, idrac
    server_model: Mapped[str | None] = mapped_column(String(255))
    firmware_version: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))

    overall_health: Mapped[str | None] = mapped_column(String(50))  # OK, Degraded, Critical
    raid_status: Mapped[str | None] = mapped_column(String(50))
    power_status: Mapped[str | None] = mapped_column(String(50))

    temperatures: Mapped[str | None] = mapped_column(Text)  # JSON
    fans: Mapped[str | None] = mapped_column(Text)  # JSON
    disks: Mapped[str | None] = mapped_column(Text)  # JSON
    power_supplies: Mapped[str | None] = mapped_column(Text)  # JSON
