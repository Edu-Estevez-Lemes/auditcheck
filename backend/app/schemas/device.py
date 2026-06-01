from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel


class PortOut(BaseModel):
    id: int
    port_number: int
    protocol: str
    service: str | None = None
    state: str
    banner: str | None = None
    is_risky: bool

    model_config = {"from_attributes": True}


class DeviceOut(BaseModel):
    id: int
    audit_id: int
    ip_address: str
    hostname: str | None = None
    netbios_name: str | None = None
    mac_address: str | None = None
    manufacturer: str | None = None
    os_type: str | None = None
    os_version: str | None = None
    device_type: str
    is_up: bool
    response_time_ms: float | None = None
    ttl: int | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    ports: list[PortOut] = []

    model_config = {"from_attributes": True}
