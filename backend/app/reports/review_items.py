"""Definición de ítems de revisión manual por categoría.

La mayoría de categorías tienen una lista de ítems única ("_all"), válida
para cualquier tipo de dispositivo asignado a esa categoría. Las categorías
"vm_idecnet" y "antivirus" son la excepción: conservan el desglose por tipo
de dispositivo (device_type) que ya tenían antes de este rediseño.
"""
from __future__ import annotations

REVIEW_CATEGORIES: list[dict[str, str]] = [
    {"key": "hardware",        "label": "Hardware"},
    {"key": "vm",              "label": "Máquinas Virtuales"},
    {"key": "vm_idecnet",      "label": "VM Idecnet"},
    {"key": "redes",           "label": "Redes"},
    {"key": "almacenamiento",  "label": "Almacenamiento"},
    {"key": "backup",          "label": "Backup"},
    {"key": "antivirus",       "label": "Antivirus"},
]

# Categorías planas ("_all"): qué tipos de dispositivo las sugieren
# automáticamente en el wizard (el contenido del checklist ya no depende
# del tipo, pero la sugerencia de categoría por host sigue siendo útil).
CATEGORY_DEVICE_TYPES: dict[str, list[str]] = {
    "hardware":        ["windows_server", "linux", "ilo", "idrac"],
    "vm":              ["vcenter", "esxi", "vmware_appliance", "windows_server", "linux"],
    "redes":           ["fortigate", "switch", "router", "ap"],
    "almacenamiento":  ["nas"],
    "backup":          ["veeam"],
}

# category → device_type ("_all" para categorías planas) → list[{key, label}]
REVIEW_ITEMS: dict[str, dict[str, list[dict[str, str]]]] = {
    "hardware": {
        "_all": [
            {"key": "estado_general",   "label": "Estado general"},
            {"key": "firmware",         "label": "Actualización de firmware"},
            {"key": "windows_updates",  "label": "Actualizaciones pendientes de Windows"},
        ],
    },
    "vm": {
        "_all": [
            {"key": "estado_servidor",   "label": "Estado general del servidor (RAM, espacio en disco, CPU)"},
            {"key": "revision_panel",    "label": "Revisión del server panel"},
            {"key": "antivirus",         "label": "Estado del antivirus"},
            {"key": "alertas",           "label": "Alertas"},
            {"key": "actualizaciones",   "label": "Actualizaciones"},
        ],
    },
    "redes": {
        "_all": [
            {"key": "ap_status", "label": "Alertas, logs y estados de APs (si es necesario)"},
            {"key": "updates",   "label": "Revisar actualizaciones"},
        ],
    },
    "almacenamiento": {
        "_all": [
            {"key": "alertas_errores",  "label": "Alertas y errores"},
            {"key": "hw_updates",       "label": "Actualizaciones de hardware"},
            {"key": "mantenimiento_hw", "label": "Mantenimiento y hardware"},
        ],
    },
    "backup": {
        "_all": [
            {"key": "jobs",           "label": "Jobs"},
            {"key": "veeam_updates",  "label": "Actualizaciones de Veeam"},
            {"key": "license_expiry", "label": "Vencimiento de licencia"},
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
    cat_map = REVIEW_ITEMS.get(category, {})
    if "_all" in cat_map:
        return cat_map["_all"]
    return cat_map.get(device_type, [])


def get_device_types_for_category(category: str) -> list[str]:
    return list(REVIEW_ITEMS.get(category, {}).keys())
