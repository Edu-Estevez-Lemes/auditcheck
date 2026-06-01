from __future__ import annotations
from sqlalchemy import String, Text, Integer, ForeignKey, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, TimestampMixin


class VMwareHost(Base, TimestampMixin):
    __tablename__ = "vmware_hosts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("audits.id", ondelete="CASCADE"))
    device_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vcenter_host: Mapped[str | None] = mapped_column(String(255))
    state: Mapped[str | None] = mapped_column(String(50))  # connected, disconnected, notResponding
    power_state: Mapped[str | None] = mapped_column(String(50))
    version: Mapped[str | None] = mapped_column(String(50))
    build: Mapped[str | None] = mapped_column(String(50))

    cpu_model: Mapped[str | None] = mapped_column(String(255))
    cpu_cores: Mapped[int | None] = mapped_column(Integer)
    cpu_usage_mhz: Mapped[int | None] = mapped_column(Integer)
    cpu_total_mhz: Mapped[int | None] = mapped_column(Integer)

    memory_size_gb: Mapped[float | None] = mapped_column(Float)
    memory_usage_gb: Mapped[float | None] = mapped_column(Float)

    uptime_seconds: Mapped[int | None] = mapped_column(Integer)
    vms_running: Mapped[int | None] = mapped_column(Integer)
    vms_total: Mapped[int | None] = mapped_column(Integer)

    has_alarms: Mapped[bool] = mapped_column(Boolean, default=False)
    alarm_summary: Mapped[str | None] = mapped_column(Text)


class VMwareVM(Base, TimestampMixin):
    __tablename__ = "vmware_vms"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("audits.id", ondelete="CASCADE"))
    host_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("vmware_hosts.id", ondelete="SET NULL"), nullable=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    power_state: Mapped[str | None] = mapped_column(String(50))  # poweredOn, poweredOff, suspended
    tools_status: Mapped[str | None] = mapped_column(String(50))
    tools_version: Mapped[str | None] = mapped_column(String(50))

    guest_os: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(45))

    cpu_count: Mapped[int | None] = mapped_column(Integer)
    memory_mb: Mapped[int | None] = mapped_column(Integer)
    disk_gb: Mapped[float | None] = mapped_column(Float)

    snapshot_count: Mapped[int | None] = mapped_column(Integer)
    oldest_snapshot_days: Mapped[int | None] = mapped_column(Integer)

    has_issues: Mapped[bool] = mapped_column(Boolean, default=False)
    issue_summary: Mapped[str | None] = mapped_column(Text)


class Datastore(Base, TimestampMixin):
    __tablename__ = "datastores"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    audit_id: Mapped[int] = mapped_column(Integer, ForeignKey("audits.id", ondelete="CASCADE"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    datastore_type: Mapped[str | None] = mapped_column(String(50))  # VMFS, NFS, vSAN
    capacity_gb: Mapped[float | None] = mapped_column(Float)
    free_gb: Mapped[float | None] = mapped_column(Float)
    used_percent: Mapped[float | None] = mapped_column(Float)
    accessible: Mapped[bool] = mapped_column(Boolean, default=True)
    hosts_count: Mapped[int | None] = mapped_column(Integer)
