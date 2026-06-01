"""
Motor principal de descubrimiento y auditoría de red.
Emite eventos de progreso vía callback asíncrono.
"""
from __future__ import annotations
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime

from ..config import settings
from ..utils.network import expand_ip_range, resolve_hostname, get_arp_table, ping_host, estimate_os_from_ttl
from ..utils.oui import lookup_manufacturer, normalize_mac
from .ports import scan_ports, detect_device_type, PortResult


@dataclass
class ScanEvent:
    type: str
    data: dict = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps({"type": self.type, **self.data})


@dataclass
class ScannedDevice:
    ip_address: str
    is_up: bool = False
    hostname: str | None = None
    netbios_name: str | None = None
    mac_address: str | None = None
    manufacturer: str | None = None
    os_type: str | None = None
    device_type: str = "unknown"
    response_time_ms: float | None = None
    ttl: int | None = None
    ports: list[PortResult] = field(default_factory=list)
    scanned_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "ip_address": self.ip_address,
            "is_up": self.is_up,
            "hostname": self.hostname,
            "netbios_name": self.netbios_name,
            "mac_address": self.mac_address,
            "manufacturer": self.manufacturer,
            "os_type": self.os_type,
            "device_type": self.device_type,
            "response_time_ms": self.response_time_ms,
            "ttl": self.ttl,
            "ports": [
                {
                    "port_number": p.port,
                    "protocol": p.protocol,
                    "service": p.service,
                    "state": p.state,
                    "banner": p.banner[:100] if p.banner else None,
                    "is_risky": p.is_risky,
                }
                for p in self.ports
            ],
        }


class NetworkScanner:
    def __init__(
        self,
        ip_ranges: list[str],
        ports: list[int] | None = None,
        timeout: float | None = None,
        max_workers: int | None = None,
        on_event=None,  # async callback(ScanEvent)
    ):
        self.ip_ranges = ip_ranges
        self.ports = ports or settings.SCAN_COMMON_PORTS
        self.timeout = timeout or settings.SCAN_TIMEOUT
        self.max_workers = max_workers or settings.SCAN_MAX_WORKERS
        self.on_event = on_event
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    async def _emit(self, event: ScanEvent):
        if self.on_event:
            try:
                await self.on_event(event)
            except Exception:
                pass

    async def run(self) -> list[ScannedDevice]:
        all_ips = []
        for range_str in self.ip_ranges:
            all_ips.extend(expand_ip_range(range_str))

        # Eliminar duplicados manteniendo orden
        seen = set()
        unique_ips = [ip for ip in all_ips if not (ip in seen or seen.add(ip))]

        await self._emit(ScanEvent("scan_start", {
            "total_ips": len(unique_ips),
            "ranges": self.ip_ranges,
        }))

        # Obtener tabla ARP antes de escanear
        arp_table = await asyncio.get_event_loop().run_in_executor(None, get_arp_table)

        # Descubrimiento de hosts
        live_hosts: list[str] = []
        host_semaphore = asyncio.Semaphore(self.max_workers)

        async def discover_host(ip: str) -> tuple[str, bool, float | None]:
            if self._cancelled:
                return ip, False, None
            async with host_semaphore:
                is_up, rtt = await asyncio.get_event_loop().run_in_executor(
                    None, ping_host, ip, self.timeout
                )
                if not is_up:
                    # Fallback: TCP connect en puerto 80 o 443
                    is_up, rtt = await _tcp_ping(ip, [80, 443, 22, 445], self.timeout)
                return ip, is_up, rtt

        discovery_tasks = [discover_host(ip) for ip in unique_ips]
        results = await asyncio.gather(*discovery_tasks)

        for ip, is_up, rtt in results:
            if is_up:
                live_hosts.append(ip)
                await self._emit(ScanEvent("host_up", {"ip": ip, "response_time_ms": rtt}))
            else:
                await self._emit(ScanEvent("host_down", {"ip": ip}))

        await self._emit(ScanEvent("discovery_complete", {
            "live_count": len(live_hosts),
            "total": len(unique_ips),
        }))

        # Escaneo detallado de hosts activos
        devices: list[ScannedDevice] = []
        for ip in live_hosts:
            if self._cancelled:
                break

            device = await self._scan_device(ip, arp_table)
            devices.append(device)
            await self._emit(ScanEvent("device_complete", {"device": device.to_dict()}))

        await self._emit(ScanEvent("scan_complete", {
            "total_devices": len(devices),
            "live_hosts": len(live_hosts),
            "scanned_ranges": self.ip_ranges,
        }))

        return devices

    async def _scan_device(self, ip: str, arp_table: dict[str, str]) -> ScannedDevice:
        device = ScannedDevice(ip_address=ip, is_up=True)

        # Hostname DNS
        device.hostname = await asyncio.get_event_loop().run_in_executor(
            None, resolve_hostname, ip, 1.0
        )

        # MAC desde tabla ARP
        raw_mac = arp_table.get(ip, "")
        if raw_mac:
            device.mac_address = normalize_mac(raw_mac)
            device.manufacturer = lookup_manufacturer(device.mac_address)

        # Escaneo de puertos
        await self._emit(ScanEvent("scanning_ports", {"ip": ip}))
        device.ports = await scan_ports(
            ip, self.ports, self.timeout,
            max_concurrent=min(50, self.max_workers)
        )

        # Tipo de dispositivo
        open_port_numbers = [p.port for p in device.ports]
        banners = {p.port: p.banner or "" for p in device.ports}
        device.device_type = detect_device_type(open_port_numbers, banners)

        # OS estimado
        device.os_type = _estimate_os(device.device_type, banners, open_port_numbers)

        return device


async def _tcp_ping(ip: str, ports: list[int], timeout: float) -> tuple[bool, float | None]:
    import time
    for port in ports:
        try:
            start = time.perf_counter()
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), timeout=timeout
            )
            rtt = (time.perf_counter() - start) * 1000
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return True, rtt
        except Exception:
            continue
    return False, None


def _estimate_os(device_type: str, banners: dict[int, str], open_ports: list[int]) -> str | None:
    type_os_map = {
        "windows_server": "Windows Server",
        "windows_workstation": "Windows",
        "linux": "Linux",
        "esxi": "VMware ESXi",
        "vcenter": "VMware vCenter",
        "fortigate": "FortiOS",
        "nas": "NAS",
        "switch": "Network OS",
        "router": "Network OS",
        "ilo": "HP iLO",
        "idrac": "Dell iDRAC",
        "printer": "Embedded",
    }
    return type_os_map.get(device_type)
