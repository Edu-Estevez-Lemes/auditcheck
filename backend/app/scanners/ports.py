"""Escáner de puertos TCP asíncrono con detección de banners."""
from __future__ import annotations
import asyncio
import socket
from dataclasses import dataclass, field


RISKY_PORTS = {23, 21, 135, 445, 1433, 3389, 5900, 27017, 6379}

SERVICE_MAP: dict[int, str] = {
    21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP",
    53: "DNS", 80: "HTTP", 110: "POP3", 111: "RPC",
    123: "NTP", 135: "MSRPC", 139: "NetBIOS", 143: "IMAP",
    161: "SNMP", 389: "LDAP", 443: "HTTPS", 445: "SMB",
    465: "SMTPS", 514: "Syslog", 587: "SMTP-TLS",
    636: "LDAPS", 902: "VMware", 903: "VMware",
    993: "IMAPS", 995: "POP3S", 1433: "MSSQL", 1521: "Oracle",
    1723: "PPTP", 2049: "NFS", 3306: "MySQL", 3389: "RDP",
    3690: "SVN", 4443: "HTTPS-Alt", 5432: "PostgreSQL",
    5480: "VMware-VAMI", 5900: "VNC", 5985: "WinRM-HTTP",
    5986: "WinRM-HTTPS", 6379: "Redis", 7443: "HTTPS-Alt",
    8000: "HTTP-Alt", 8080: "HTTP-Proxy", 8081: "HTTP-Alt",
    8443: "HTTPS-Alt", 8888: "HTTP-Alt", 9090: "HTTP-Alt",
    9200: "Elasticsearch", 9440: "Veeam", 9443: "HTTPS-Alt",
    27017: "MongoDB",
}

# Fingerprints para identificar dispositivos
DEVICE_SIGNATURES: list[tuple[str, str]] = [
    ("VMware ESX", "esxi"),
    ("VMware vCenter", "vcenter"),
    ("vSphere", "vcenter"),
    ("FortiOS", "fortigate"),
    ("FortiGate", "fortigate"),
    ("HP iLO", "ilo"),
    ("Integrated Lights-Out", "ilo"),
    ("iDRAC", "idrac"),
    ("Dell Remote", "idrac"),
    ("OpenSSH", "linux"),
    ("Microsoft-HTTPAPI", "windows_server"),
    ("IIS", "windows_server"),
    ("QNAP", "nas"),
    ("Synology", "nas"),
    ("FreeNAS", "nas"),
    ("TrueNAS", "nas"),
    ("Veeam", "veeam"),
    ("Windows", "windows_server"),
    ("Ubuntu", "linux"),
    ("Debian", "linux"),
    ("CentOS", "linux"),
    ("Red Hat", "linux"),
    ("MikroTik", "router"),
    ("Cisco", "switch"),
    ("HP Jetdirect", "printer"),
    ("Xerox", "printer"),
    ("Kyocera", "printer"),
]


@dataclass
class PortResult:
    port: int
    protocol: str = "tcp"
    state: str = "closed"
    service: str = ""
    banner: str = ""
    is_risky: bool = False


async def scan_port(
    ip: str,
    port: int,
    timeout: float = 2.0,
    grab_banner: bool = True,
) -> PortResult:
    result = PortResult(
        port=port,
        service=SERVICE_MAP.get(port, ""),
        is_risky=port in RISKY_PORTS,
    )
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout,
        )
        result.state = "open"

        if grab_banner:
            try:
                if port in (80, 8080, 8081, 8000, 8888):
                    writer.write(b"HEAD / HTTP/1.0\r\nHost: " + ip.encode() + b"\r\n\r\n")
                    await writer.drain()
                banner_data = await asyncio.wait_for(reader.read(512), timeout=1.5)
                if banner_data:
                    result.banner = banner_data.decode(errors="replace").strip()[:200]
                    _refine_service_from_banner(result)
            except (asyncio.TimeoutError, ConnectionResetError):
                pass

        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass

    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        pass
    except Exception:
        pass

    return result


def _refine_service_from_banner(result: PortResult) -> None:
    banner = result.banner.lower()
    if "ssh" in banner:
        result.service = "SSH"
    elif "ftp" in banner:
        result.service = "FTP"
    elif "smtp" in banner:
        result.service = "SMTP"
    elif "imap" in banner:
        result.service = "IMAP"
    elif "http" in banner and result.service not in ("HTTPS",):
        result.service = "HTTP"


async def scan_ports(
    ip: str,
    ports: list[int],
    timeout: float = 2.0,
    max_concurrent: int = 50,
    progress_callback=None,
) -> list[PortResult]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def _scan_with_sem(port: int) -> PortResult:
        async with semaphore:
            result = await scan_port(ip, port, timeout)
            if progress_callback and result.state == "open":
                await progress_callback(port, result)
            return result

    tasks = [_scan_with_sem(p) for p in ports]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return [r for r in results if isinstance(r, PortResult) and r.state == "open"]


def detect_device_type(open_ports: list[int], banners: dict[int, str]) -> str:
    """Heurística de tipo de dispositivo basada en puertos abiertos y banners."""
    all_banners = " ".join(banners.values()).lower()

    for signature, device_type in DEVICE_SIGNATURES:
        if signature.lower() in all_banners:
            return device_type

    port_set = set(open_ports)

    if 902 in port_set or 5480 in port_set:
        return "esxi"
    if 9443 in port_set and 443 in port_set:
        return "vcenter"
    if 9440 in port_set:
        return "veeam"
    if {443, 22} <= port_set and len(port_set) <= 5:
        return "fortigate"
    if {135, 445} <= port_set or {3389, 445} <= port_set:
        return "windows_server"
    if 5985 in port_set or 5986 in port_set:
        return "windows_server"
    if 22 in port_set and 80 not in port_set and 443 not in port_set:
        return "linux"
    if 161 in port_set and (22 in port_set or 23 in port_set):
        return "switch"
    if 9100 in port_set or 631 in port_set:
        return "printer"

    return "unknown"
