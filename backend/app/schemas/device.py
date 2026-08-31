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

    # Campos editables manualmente
    display_name: str | None = None
    custom_category: str | None = None
    location: str | None = None
    description: str | None = None
    observations: str | None = None
    manually_edited: bool = False
    is_new_device: bool = True

    # Credencial asociada
    credential_id: int | None = None
    credential_name: str | None = None      # nombre legible de la credencial
    credential_username: str | None = None  # usuario (para RDP pre-relleno)
    credential_domain: str | None = None    # dominio Windows (para RDP)

    is_up: bool
    response_time_ms: float | None = None
    ttl: int | None = None
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    ports: list[PortOut] = []

    model_config = {"from_attributes": True}


class DeviceCreate(BaseModel):
    ip_address: str
    hostname: str | None = None
    device_type: str = "unknown"
    mac_address: str | None = None
    manufacturer: str | None = None
    os_type: str | None = None
    display_name: str | None = None
    custom_category: str | None = None
    location: str | None = None
    description: str | None = None
    observations: str | None = None
    credential_id: int | None = None


class DeviceUpdate(BaseModel):
    display_name: str | None = None
    hostname: str | None = None
    device_type: str | None = None
    custom_category: str | None = None
    manufacturer: str | None = None
    os_type: str | None = None
    location: str | None = None
    description: str | None = None
    observations: str | None = None
    credential_id: int | None = None
