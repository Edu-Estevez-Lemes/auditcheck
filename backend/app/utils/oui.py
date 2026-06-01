"""Base de datos OUI compacta para identificación de fabricantes por MAC."""
from __future__ import annotations

OUI_DB: dict[str, str] = {
    "00:00:0C": "Cisco Systems",
    "00:01:42": "Cisco Systems",
    "00:04:96": "Extreme Networks",
    "00:0C:29": "VMware",
    "00:50:56": "VMware",
    "00:0E:0C": "Fujitsu",
    "00:1A:4B": "Hewlett Packard",
    "00:17:A4": "Cisco Systems",
    "00:1E:BD": "Cisco Systems",
    "00:50:BA": "D-Link",
    "00:15:5D": "Microsoft (Hyper-V)",
    "00:03:FF": "Microsoft (Hyper-V)",
    "52:54:00": "QEMU/KVM",
    "00:16:3E": "Xen",
    "00:1B:21": "Intel",
    "00:1C:C0": "Intel",
    "00:1D:09": "Dell",
    "00:21:9B": "Dell",
    "00:24:E8": "Dell",
    "B8:CA:3A": "Dell",
    "F8:DB:88": "Dell",
    "00:1B:63": "Apple",
    "00:23:12": "Apple",
    "00:25:BC": "Apple",
    "00:26:BB": "Apple",
    "00:50:F2": "Microsoft",
    "00:03:47": "Intel",
    "00:07:E9": "Intel",
    "00:0E:35": "Intel",
    "00:13:20": "Intel",
    "00:19:D1": "Intel",
    "00:1B:21": "Intel",
    "00:1E:67": "Intel",
    "00:21:6A": "Intel",
    "00:23:14": "Intel",
    "00:24:D7": "Intel",
    "F4:CE:46": "Intel",
    "00:04:75": "3Com",
    "00:10:5A": "3Com",
    "00:50:DA": "3Com",
    "00:0A:E4": "Fortinet",
    "00:09:0F": "Fortinet",
    "70:4C:A5": "Fortinet",
    "00:09:0F": "Fortinet",
    "90:6C:AC": "Fortinet",
    "00:19:07": "Hewlett Packard (HPE)",
    "00:1C:C4": "Hewlett Packard (HPE)",
    "00:21:5A": "Hewlett Packard (HPE)",
    "00:25:B3": "Hewlett Packard (HPE)",
    "3C:D9:2B": "Hewlett Packard (HPE)",
    "9C:8E:99": "Hewlett Packard (HPE)",
    "00:17:A4": "Cisco",
    "00:1B:54": "Cisco",
    "00:1E:BD": "Cisco",
    "00:22:BD": "Cisco",
    "00:24:14": "Cisco",
    "00:25:45": "Cisco",
    "00:26:CB": "Cisco",
    "68:EF:BD": "Cisco",
    "A4:93:4C": "Cisco",
    "00:1D:A1": "NETGEAR",
    "00:26:F2": "NETGEAR",
    "A0:21:B7": "NETGEAR",
    "00:18:01": "NETGEAR",
    "C0:3F:0E": "NETGEAR",
    "00:26:5A": "QNAP",
    "00:08:9B": "QNAP",
    "24:5E:BE": "QNAP",
    "00:08:9B": "QNAP",
    "00:11:32": "Synology",
    "00:11:32": "Synology",
    "BC:5F:F4": "Synology",
    "F4:EC:38": "Synology",
    "00:0C:42": "MikroTik",
    "2C:C8:1B": "MikroTik",
    "4C:5E:0C": "MikroTik",
    "74:4D:28": "MikroTik",
    "00:18:E7": "Ubiquiti",
    "00:27:22": "Ubiquiti",
    "04:18:D6": "Ubiquiti",
    "24:A4:3C": "Ubiquiti",
    "44:D9:E7": "Ubiquiti",
    "78:8A:20": "Ubiquiti",
    "DC:9F:DB": "Ubiquiti",
    "F0:9F:C2": "Ubiquiti",
    "00:A0:C9": "Intel",
    "00:1C:2E": "HP Proliant",
    "B0:5A:DA": "HP Proliant",
}


def lookup_manufacturer(mac: str) -> str:
    """Devuelve el fabricante a partir de los primeros 3 octetos de la MAC."""
    if not mac:
        return "Desconocido"
    mac_upper = mac.upper().replace("-", ":").replace(".", ":")
    parts = mac_upper.split(":")
    if len(parts) < 3:
        return "Desconocido"
    oui = ":".join(parts[:3])
    return OUI_DB.get(oui, "Desconocido")


def normalize_mac(mac: str) -> str:
    """Normaliza una MAC a formato AA:BB:CC:DD:EE:FF."""
    if not mac:
        return ""
    clean = mac.upper().replace("-", "").replace(":", "").replace(".", "")
    if len(clean) != 12:
        return mac
    return ":".join(clean[i:i+2] for i in range(0, 12, 2))
