# ── Consola de Red ───────────────────────────────────────────────────────────
"""Whitelist cerrada de comandos de diagnóstico de red para la Consola de Red.
Ningún comando fuera de COMMANDS puede ejecutarse; toda entrada se valida
(ipaddress/regex) antes de tocar subprocess o sockets."""
from __future__ import annotations
import asyncio
import errno
import ipaddress
import platform
import re
import socket
import time
from dataclasses import dataclass
from typing import AsyncIterator, Callable

from fastapi.concurrency import run_in_threadpool

from ..utils.network import expand_ip_range, ping_host

if platform.system() == "Windows":
    import ctypes
    _CONSOLE_ENCODING = f"cp{ctypes.windll.kernel32.GetOEMCP()}"
else:
    _CONSOLE_ENCODING = "utf-8"


class ConsoleValidationError(Exception):
    pass


@dataclass
class ConsolePrompt:
    """Cuando un handler hace `yield ConsolePrompt(...)`, la consola envía un
    mensaje type=prompt al cliente, espera la respuesta por el mismo WebSocket
    y la reinyecta en el generador vía `asend()` (ver api/console.py). Permite
    comandos interactivos (p.ej. pedir una clave) sin salir del modelo de
    whitelist cerrada: solo comandos de COMMANDS pueden iniciar un prompt."""
    text: str
    secret: bool = False


_HOSTNAME_RE = re.compile(
    r"^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)


def _valid_ip(s: str) -> str:
    try:
        ipaddress.ip_address(s)
        return s
    except ValueError:
        raise ConsoleValidationError(f"IP inválida: {s}")


def _valid_host(s: str) -> str:
    try:
        ipaddress.ip_address(s)
        return s
    except ValueError:
        pass
    if _HOSTNAME_RE.fullmatch(s):
        return s
    raise ConsoleValidationError(f"Host inválido: {s}")


def _valid_port(s: str) -> int:
    try:
        port = int(s)
    except ValueError:
        raise ConsoleValidationError(f"Puerto inválido: {s}")
    if not (1 <= port <= 65535):
        raise ConsoleValidationError(f"Puerto fuera de rango (1-65535): {s}")
    return port


def _valid_cidr_max24(s: str) -> ipaddress.IPv4Network:
    try:
        net = ipaddress.IPv4Network(s, strict=False)
    except ValueError:
        raise ConsoleValidationError(f"Rango CIDR inválido: {s}")
    if net.prefixlen < 24:
        raise ConsoleValidationError("El rango no puede superar un /24 (máx. 254 hosts)")
    return net


async def _stream_subprocess(argv: list[str], timeout: float = 15.0) -> AsyncIterator[str]:
    """Ejecuta argv (sin shell=True) y hace streaming línea a línea del stdout,
    con un límite global de `timeout` segundos para todo el comando."""
    proc = await asyncio.create_subprocess_exec(
        *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout
    try:
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise asyncio.TimeoutError
            line = await asyncio.wait_for(proc.stdout.readline(), timeout=remaining)
            if not line:
                break
            yield line.decode(_CONSOLE_ENCODING, errors="replace").rstrip()
        await proc.wait()
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()


async def _cmd_ping(args: list[str], user_id: int) -> AsyncIterator[str]:
    host = _valid_host(args[0])
    argv = ["ping", "-n", "4", host] if platform.system() == "Windows" else ["ping", "-c", "4", host]
    async for line in _stream_subprocess(argv):
        yield line


async def _cmd_traceroute(args: list[str], user_id: int) -> AsyncIterator[str]:
    host = _valid_host(args[0])
    argv = ["tracert", "-h", "20", host] if platform.system() == "Windows" else ["traceroute", "-m", "20", host]
    async for line in _stream_subprocess(argv):
        yield line


async def _cmd_nslookup(args: list[str], user_id: int) -> AsyncIterator[str]:
    host = _valid_host(args[0])
    async for line in _stream_subprocess(["nslookup", host]):
        yield line


async def _cmd_rdns(args: list[str], user_id: int) -> AsyncIterator[str]:
    ip = _valid_ip(args[0])
    try:
        hostname, _, _ = await run_in_threadpool(socket.gethostbyaddr, ip)
        yield f"{ip} -> {hostname}"
    except (socket.herror, OSError):
        yield f"{ip}: sin registro PTR"


def _sync_testport(ip: str, port: int, timeout: float = 3.0) -> tuple[str, float]:
    start = time.perf_counter()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        result = sock.connect_ex((ip, port))
        elapsed = (time.perf_counter() - start) * 1000
        if result == 0:
            return "open", elapsed
        if result in (errno.ECONNREFUSED, 10061):
            return "closed", elapsed
        return "filtered", elapsed
    except socket.timeout:
        return "filtered", (time.perf_counter() - start) * 1000
    finally:
        sock.close()


async def _cmd_testport(args: list[str], user_id: int) -> AsyncIterator[str]:
    ip = _valid_ip(args[0])
    port = _valid_port(args[1])
    state, elapsed_ms = await run_in_threadpool(_sync_testport, ip, port)
    labels = {"open": "abierto", "closed": "cerrado", "filtered": "filtrado"}
    yield f"{ip}:{port} {labels[state]} ({elapsed_ms:.0f} ms)"


def _sync_banner(ip: str, port: int, timeout: float = 3.0) -> str | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect((ip, port))
        try:
            data = sock.recv(256)
        except socket.timeout:
            data = b""
        return data.decode(errors="replace").strip()
    except OSError:
        return None
    finally:
        sock.close()


async def _cmd_banner(args: list[str], user_id: int) -> AsyncIterator[str]:
    ip = _valid_ip(args[0])
    port = _valid_port(args[1])
    banner = await run_in_threadpool(_sync_banner, ip, port)
    if banner is None:
        yield f"{ip}:{port} no se pudo conectar"
    elif banner == "":
        yield f"{ip}:{port} conectado, sin banner"
    else:
        yield f"{ip}:{port} banner: {banner}"


async def _cmd_pingsweep(args: list[str], user_id: int) -> AsyncIterator[str]:
    net = _valid_cidr_max24(args[0])
    hosts = expand_ip_range(str(net))
    semaphore = asyncio.Semaphore(50)

    async def _ping_one(ip: str):
        async with semaphore:
            is_up, rtt = await run_in_threadpool(ping_host, ip, 0.5)
            return ip, is_up, rtt

    tasks = [asyncio.create_task(_ping_one(ip)) for ip in hosts]
    active = 0
    for task in asyncio.as_completed(tasks):
        ip, is_up, rtt = await task
        if is_up:
            active += 1
            yield f"{ip} activo ({rtt:.0f} ms)" if rtt else f"{ip} activo"
    yield f"{active} de {len(hosts)} hosts activos"


async def _cmd_syncmatriz(args: list[str], user_id: int) -> AsyncIterator[str | ConsolePrompt]:
    """Sincroniza la BD embebida con la matriz MySQL. Interactivo: pide la
    passphrase del vault (para descifrar la conexión a la matriz) y una
    confirmación explícita antes de aplicar nada. Ver services/matrix_sync.py."""
    from datetime import datetime
    from sqlalchemy import create_engine
    from ..database import SessionLocal, engine as local_engine
    from ..models import Base as ModelsBase
    from ..models.user import User
    from ..models.matrix_sync import MatrixSyncConfig
    from ..services import vault as vault_service, matrix_sync, backup as backup_service
    from ..services.audit_log import log_action
    from ..utils import crypto as crypto_module

    direction = args[0].lower()
    if direction not in ("pull", "push"):
        raise ConsoleValidationError("Dirección inválida. Usa: syncmatriz pull | syncmatriz push")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()  # noqa: E712
        if not user:
            yield "Sesión no válida."
            return
        if direction == "push" and user.role != "superadmin":
            yield "Solo un superadmin puede sincronizar hacia la matriz (push). Usa 'syncmatriz pull'."
            return

        config = db.query(MatrixSyncConfig).first()
        if not config:
            yield "No hay conexión con la matriz configurada. Ve a Configuración > Base de Datos."
            return

        passphrase = yield ConsolePrompt("Clave del vault para autorizar la sincronización:", secret=True)
        fernet = vault_service.get_fernet_for_passphrase(db, passphrase)
        if fernet is None:
            yield "Clave incorrecta. Sincronización cancelada."
            return

        try:
            matriz_password = fernet.decrypt(config.encrypted_password.encode()).decode()
        except Exception:
            yield "No se pudo descifrar la contraseña de la matriz con esa clave."
            return

        yield f"Conectando a mysql://{config.host}:{config.port}/{config.database} como {config.username}..."
        remote_url = matrix_sync.build_mysql_url(config.host, config.port, config.username, matriz_password, config.database)
        remote_engine = create_engine(remote_url, connect_args={"connect_timeout": 10})
        try:
            ModelsBase.metadata.create_all(bind=remote_engine)

            yield "Calculando diferencias..."
            preview = matrix_sync.run_sync(local_engine, remote_engine, direction, dry_run=True)
            for line in preview.summary_lines():
                yield line

            if preview.total_changes == 0:
                yield "Nada que sincronizar."
                return

            answer = yield ConsolePrompt("¿Aplicar estos cambios? (escribe SI para confirmar)")
            if (answer or "").strip().upper() != "SI":
                yield "Sincronización cancelada por el usuario."
                return

            backup_result = backup_service.create_backup()
            yield f"Backup de seguridad creado en {backup_result['path']}"

            yield "Aplicando cambios..."
            result = matrix_sync.run_sync(local_engine, remote_engine, direction, dry_run=False)
            for line in result.summary_lines():
                yield line

            config.last_sync_at = datetime.utcnow()
            config.last_sync_direction = direction
            db.commit()

            vault_diff = result.per_table.get("vault_config")
            if vault_diff and vault_diff.total > 0:
                crypto_module.clear_session()
                yield "La configuración del vault ha cambiado: tendrás que desbloquearlo de nuevo."

            log_action(db, user, "matrix_sync", target_type="database",
                       details={"direction": direction, "changes": result.total_changes})
            yield f"Sincronización '{direction}' completada: {result.total_changes} cambio(s)."
        finally:
            remote_engine.dispose()
    finally:
        db.close()


@dataclass
class ConsoleCommand:
    name: str
    usage: str
    min_args: int
    max_args: int
    handler: Callable[[list[str], int], AsyncIterator[str | ConsolePrompt]]


COMMANDS: dict[str, ConsoleCommand] = {
    "ping": ConsoleCommand("ping", "ping <host>", 1, 1, _cmd_ping),
    "traceroute": ConsoleCommand("traceroute", "traceroute <host>", 1, 1, _cmd_traceroute),
    "nslookup": ConsoleCommand("nslookup", "nslookup <host>", 1, 1, _cmd_nslookup),
    "rdns": ConsoleCommand("rdns", "rdns <ip>", 1, 1, _cmd_rdns),
    "testport": ConsoleCommand("testport", "testport <ip> <puerto>", 2, 2, _cmd_testport),
    "banner": ConsoleCommand("banner", "banner <ip> <puerto>", 2, 2, _cmd_banner),
    "pingsweep": ConsoleCommand("pingsweep", "pingsweep <cidr>", 1, 1, _cmd_pingsweep),
    "syncmatriz": ConsoleCommand("syncmatriz", "syncmatriz <pull|push>", 1, 1, _cmd_syncmatriz),
}

WHITELIST_HELP = "Comandos disponibles: " + ", ".join(COMMANDS.keys())
