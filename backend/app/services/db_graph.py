from __future__ import annotations

"""
Bloque 3 — Grafo de tablas "propiedad de un cliente", usado tanto por la
exportación selectiva (filtrar filas a copiar) como por la importación en
modo fusionar/reemplazar (remapear IDs al insertar en la BD destino).

TABLE_GRAPH: orden de dependencia (padres antes que hijos). Cada entrada es
(tabla, columna_fk_principal, tabla_referenciada). La tabla "clients" es la
raíz (columna_fk_principal=None).

EXTRA_FK_COLUMNS: columnas FK secundarias de cada tabla que también deben
remapearse en importación, además de la columna principal.
"""

TABLE_GRAPH: list[tuple[str, str | None, str | None]] = [
    ("clients", None, None),
    ("ip_ranges", "client_id", "clients"),
    ("credentials", "client_id", "clients"),
    ("audits", "client_id", "clients"),
    ("review_configs", "client_id", "clients"),
    ("devices", "audit_id", "audits"),
    ("review_sessions", "audit_id", "audits"),
    ("ports", "device_id", "devices"),
    ("findings", "audit_id", "audits"),
    ("device_knowledge", "client_id", "clients"),
    ("vmware_hosts", "audit_id", "audits"),
    ("vmware_vms", "audit_id", "audits"),
    ("datastores", "audit_id", "audits"),
    ("backup_jobs", "audit_id", "audits"),
    ("backup_repositories", "audit_id", "audits"),
    ("fortigate_status", "audit_id", "audits"),
    ("snmp_devices", "audit_id", "audits"),
    ("hardware_status", "audit_id", "audits"),
]

EXTRA_FK_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "devices": [("client_id", "clients"), ("credential_id", "credentials")],
    "review_sessions": [("client_id", "clients")],
    "ports": [("audit_id", "audits")],
    "findings": [("device_id", "devices"), ("client_id", "clients")],
    "device_knowledge": [("credential_id", "credentials"), ("last_seen_audit_id", "audits")],
    "vmware_hosts": [("device_id", "devices")],
    "vmware_vms": [("host_id", "vmware_hosts")],
    "fortigate_status": [("device_id", "devices")],
    "snmp_devices": [("device_id", "devices")],
    "hardware_status": [("device_id", "devices")],
}

# Tablas cuyo grafo depende de "devices" (necesarias para el cálculo de IDs en exportación)
TABLES_WITH_CREDENTIAL_REF = ("devices", "device_knowledge")
