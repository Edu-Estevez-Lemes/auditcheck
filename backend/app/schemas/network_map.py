# ── Mapa de Red ──────────────────────────────────────────────────────────────
from __future__ import annotations
from pydantic import BaseModel


class NetworkMapNode(BaseModel):
    id: str
    label: str
    ip: str | None = None
    hostname: str | None = None
    type: str
    risk_level: str
    open_ports: list[int] = []
    findings_count: int = 0


class NetworkMapEdge(BaseModel):
    source: str
    target: str
    relation: str = "same_subnet"


class NetworkMapOut(BaseModel):
    nodes: list[NetworkMapNode]
    edges: list[NetworkMapEdge]
