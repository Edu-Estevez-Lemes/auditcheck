from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field

CREDENTIAL_TYPES = [
    "windows", "vmware", "veeam", "fortigate",
    "ssh", "snmp", "ilo", "idrac", "nas", "database"
]


class CredentialCreate(BaseModel):
    client_id: int | None = None
    name: str = Field(..., min_length=1, max_length=255)
    credential_type: str = Field(..., description=f"Uno de: {', '.join(CREDENTIAL_TYPES)}")
    username: str | None = None
    password: str | None = Field(None, description="Se cifra al guardar, nunca se devuelve")
    host: str | None = None
    port: int | None = None
    domain: str | None = None
    notes: str | None = None
    is_preferred: bool = False


class CredentialUpdate(BaseModel):
    name: str | None = None
    credential_type: str | None = None
    username: str | None = None
    password: str | None = None
    host: str | None = None
    port: int | None = None
    domain: str | None = None
    notes: str | None = None
    is_preferred: bool | None = None


class CredentialOut(BaseModel):
    """Credencial serializada. La contraseña NUNCA se incluye."""
    id: int
    client_id: int | None = None
    name: str
    credential_type: str
    username: str | None = None
    host: str | None = None
    port: int | None = None
    domain: str | None = None
    notes: str | None = None
    status: str
    is_preferred: bool
    last_used: datetime | None = None
    last_validated: datetime | None = None
    created_at: datetime
    updated_at: datetime
    has_password: bool = False

    model_config = {"from_attributes": True}
