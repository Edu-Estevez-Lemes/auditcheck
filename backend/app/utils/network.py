"""Utilidades de red: parseo de rangos IP, resolución DNS, ARP."""
from __future__ import annotations
import ipaddress
import socket
import subprocess
import platform
import re
from typing import Iterator


def expand_ip_range(range_str: str) -> list[str]:
    """
    Expande un rango de IPs a lista de strings.
    Formatos soportados:
      - CIDR: 192.168.1.0/24
      - Rango: 192.168.1.1-192.168.1.254
      - IP simple: 192.168.1.1
    """
    range_str = range_str.strip()
    try:
        if "/" in range_str:
            net = ipaddress.IPv4Network(range_str, strict=False)
            return [str(ip) for ip in net.hosts()]
        elif "-" in range_str:
            parts = range_str.split("-")
            if len(parts) == 2:
                start = ipaddress.IPv4Address(parts[0].strip())
                end_part = parts[1].strip()
                if "." in end_part:
                    end = ipaddress.IPv4Address(end_part)
                else:
                    base = str(start).rsplit(".", 1)[0]
                    end = ipaddress.IPv4Address(f"{base}.{end_part}")
                result = []
                current = int(start)
                end_int = int(end)
                while current <= end_int:
                    result.append(str(ipaddress.IPv4Address(current)))
                    current += 1
                return result
        else:
            ipaddress.IPv4Address(range_str)
            return [range_str]
    except ValueError:
        return []


def resolve_hostname(ip: str, timeout: float = 1.0) -> str | None:
    """Resuelve IP a hostname vía DNS."""
    try:
        socket.setdefaulttimeout(timeout)
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except (socket.herror, socket.gaierror, OSError):
        return None


def get_arp_table() -> dict[str, str]:
    """
    Lee la tabla ARP del sistema y devuelve {ip: mac}.
    Compatible con Windows y Linux.
    """
    table: dict[str, str] = {}
    try:
        if platform.system() == "Windows":
            result = subprocess.run(
                ["arp", "-a"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                match = re.search(
                    r"(\d+\.\d+\.\d+\.\d+)\s+([\w-]+-[\w-]+-[\w-]+-[\w-]+-[\w-]+|[\w]{2}-[\w]{2}-[\w]{2}-[\w]{2}-[\w]{2}-[\w]{2})",
                    line
                )
                if match:
                    ip = match.group(1)
                    mac = match.group(2).replace("-", ":").upper()
                    table[ip] = mac
        else:
            result = subprocess.run(
                ["arp", "-n"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                match = re.search(
                    r"(\d+\.\d+\.\d+\.\d+)\s+\S+\s+([\w:]{17})",
                    line
                )
                if match:
                    table[match.group(1)] = match.group(2).upper()
    except Exception:
        pass
    return table


def ping_host(ip: str, timeout: float = 1.0) -> tuple[bool, float | None]:
    """
    Hace ping a un host. Devuelve (is_up, response_time_ms).
    Compatible con Windows y Linux.
    """
    import time
    try:
        if platform.system() == "Windows":
            cmd = ["ping", "-n", "1", "-w", str(int(timeout * 1000)), ip]
        else:
            cmd = ["ping", "-c", "1", "-W", str(int(timeout)), ip]

        start = time.perf_counter()
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout + 1
        )
        elapsed = (time.perf_counter() - start) * 1000

        if result.returncode == 0:
            # Intentar extraer el tiempo del output
            match = re.search(r"time[<=](\d+(?:\.\d+)?)", result.stdout, re.IGNORECASE)
            rtt = float(match.group(1)) if match else elapsed
            return True, rtt
        return False, None
    except subprocess.TimeoutExpired:
        return False, None
    except Exception:
        return False, None


def extract_ttl(ping_output: str) -> int | None:
    """Extrae TTL de la salida de ping."""
    match = re.search(r"TTL=(\d+)", ping_output, re.IGNORECASE)
    return int(match.group(1)) if match else None


def estimate_os_from_ttl(ttl: int | None) -> str | None:
    """Estimación muy básica del OS basada en TTL."""
    if ttl is None:
        return None
    if 120 <= ttl <= 128:
        return "Windows"
    if 60 <= ttl <= 64:
        return "Linux/Unix"
    if ttl > 200:
        return "Network Device"
    return None
