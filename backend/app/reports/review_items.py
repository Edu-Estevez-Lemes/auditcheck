"""Definición de ítems de revisión manual por categoría y tipo de dispositivo."""
from __future__ import annotations

REVIEW_CATEGORIES: list[dict[str, str]] = [
    {"key": "hardware",       "label": "Hardware"},
    {"key": "vm",             "label": "VM / Virtualización"},
    {"key": "vm_idecnet",     "label": "VM Idecnet"},
    {"key": "redes",          "label": "Redes"},
    {"key": "almacenamiento", "label": "Almacenamiento"},
    {"key": "backup",         "label": "Backup"},
    {"key": "antivirus",      "label": "Antivirus"},
]

# category → device_type → list[{key, label}]
REVIEW_ITEMS: dict[str, dict[str, list[dict[str, str]]]] = {
    "hardware": {
        "windows_server": [
            {"key": "event_viewer",  "label": "Event Viewer > Errores críticos"},
            {"key": "memory_usage",  "label": "Uso de memoria RAM"},
            {"key": "disk_health",   "label": "Estado discos / SMART"},
            {"key": "cpu_temp",      "label": "Temperatura CPU"},
            {"key": "fans_psu",      "label": "Ventiladores y fuentes alimentación"},
        ],
        "linux": [
            {"key": "system_logs",   "label": "Logs del sistema (journalctl)"},
            {"key": "memory_usage",  "label": "Uso de memoria"},
            {"key": "disk_health",   "label": "Estado discos"},
        ],
        "ilo": [
            {"key": "health_summary","label": "iLO Health Summary"},
            {"key": "system_health", "label": "System Health > Overview"},
            {"key": "fans",          "label": "Fans Status"},
            {"key": "power_supply",  "label": "Power Supply Status"},
            {"key": "temp_sensors",  "label": "Temperature Sensors"},
            {"key": "firmware",      "label": "Firmware actualizado"},
        ],
        "idrac": [
            {"key": "system_health", "label": "System Health Overview"},
            {"key": "storage_health","label": "Storage > Controllers"},
            {"key": "power_supply",  "label": "Power Supply"},
            {"key": "firmware",      "label": "Firmware actualizado"},
        ],
    },
    "vm": {
        "vcenter": [
            {"key": "cluster_health","label": "Cluster > Health Status"},
            {"key": "alarms",        "label": "Alarms & Events activos"},
            {"key": "ha_drs",        "label": "HA / DRS Status"},
            {"key": "snapshots",     "label": "Snapshots > 7 días pendientes"},
            {"key": "datastore_usage","label": "Datastore Usage"},
            {"key": "vcsa_backup",   "label": "VCSA Backup reciente"},
        ],
        "esxi": [
            {"key": "host_status",   "label": "Host > Summary > Status"},
            {"key": "datastore_usage","label": "Datastores > Usage"},
            {"key": "vm_status",     "label": "Virtual Machines > States"},
            {"key": "hw_health",     "label": "Hardware Health Sensors"},
            {"key": "system_logs",   "label": "System Logs > vmkernel"},
        ],
        "vmware_appliance": [
            {"key": "service_status","label": "Services Status"},
            {"key": "disk_usage",    "label": "Disk Usage"},
        ],
    },
    "redes": {
        "fortigate": [
            {"key": "dashboard_status",     "label": "Dashboard > Status"},
            {"key": "firmware",             "label": "Firmware actualizado"},
            {"key": "forward_traffic_deny", "label": "Forward Traffic Deny"},
            {"key": "vpn_tunnels",          "label": "VPN Tunnels Status"},
            {"key": "ha_status",            "label": "HA Status (si aplica)"},
            {"key": "system_resources",     "label": "Dashboard > Resources"},
        ],
        "switch": [
            {"key": "diagnostics_logging", "label": "Diagnostics > Logging"},
            {"key": "system_resources",    "label": "Dashboard > System Resources"},
            {"key": "port_errors",         "label": "Port Error Counters"},
            {"key": "firmware",            "label": "Firmware actualizado"},
        ],
        "router": [
            {"key": "interface_status", "label": "Interface Status"},
            {"key": "routing_table",    "label": "Routing Table"},
            {"key": "firmware",         "label": "Firmware actualizado"},
        ],
    },
    "almacenamiento": {
        "nas": [
            {"key": "volume_health",  "label": "Volume / Pool Health"},
            {"key": "disk_health",    "label": "Disk Health > SMART"},
            {"key": "storage_usage",  "label": "Storage Usage %"},
            {"key": "snapshots",      "label": "Snapshots actualizados"},
            {"key": "replication",    "label": "Replication / Sync Status"},
            {"key": "shares_active",  "label": "Shared Folders activos"},
        ],
    },
    "vm_idecnet": {
        "windows_server": [
            {"key": "vm_status",     "label": "Estado de las VMs"},
            {"key": "cpu_usage",     "label": "Uso de CPU"},
            {"key": "memory_usage",  "label": "Uso de memoria"},
            {"key": "disk_usage",    "label": "Uso de disco"},
            {"key": "replication",   "label": "Replicación activa"},
            {"key": "backups",       "label": "Backups recientes"},
            {"key": "alerts",        "label": "Alertas activas"},
        ],
        "linux": [
            {"key": "vm_status",     "label": "Estado de las VMs"},
            {"key": "resource_usage","label": "Uso de recursos"},
            {"key": "replication",   "label": "Replicación activa"},
            {"key": "backups",       "label": "Backups recientes"},
        ],
        "vcenter": [
            {"key": "vm_status",     "label": "Estado de las VMs Idecnet"},
            {"key": "alarms",        "label": "Alarmas activas"},
            {"key": "resource_usage","label": "Uso de recursos del cluster"},
            {"key": "replication",   "label": "Replicación Idecnet"},
        ],
    },
    "backup": {
        "veeam": [
            {"key": "job_status",       "label": "Últimos Jobs > Status"},
            {"key": "last_backup",      "label": "Último backup completado"},
            {"key": "retention_policy", "label": "Retention Policy correcta"},
            {"key": "repo_space",       "label": "Espacio en repositorio"},
            {"key": "restore_test",     "label": "Test de restore reciente"},
            {"key": "immutable",        "label": "Backup inmutable activo"},
        ],
    },
    "antivirus": {
        "windows_server": [
            {"key": "av_active",    "label": "Antivirus activo y protegiendo"},
            {"key": "definitions",  "label": "Definiciones actualizadas"},
            {"key": "last_scan",    "label": "Último escaneo completado"},
            {"key": "threats",      "label": "Amenazas detectadas (últimas 24h)"},
            {"key": "quarantine",   "label": "Cuarentena vacía o revisada"},
        ],
        "windows_workstation": [
            {"key": "av_active",    "label": "Antivirus activo"},
            {"key": "definitions",  "label": "Definiciones actualizadas"},
            {"key": "last_scan",    "label": "Último escaneo completado"},
        ],
        "linux": [
            {"key": "av_active",    "label": "Antivirus / ClamAV activo"},
            {"key": "last_scan",    "label": "Último escaneo"},
        ],
    },
}


def get_items_for_device(device_type: str, category: str) -> list[dict[str, str]]:
    return REVIEW_ITEMS.get(category, {}).get(device_type, [])


def get_device_types_for_category(category: str) -> list[str]:
    return list(REVIEW_ITEMS.get(category, {}).keys())
