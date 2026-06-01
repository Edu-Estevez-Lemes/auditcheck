"""Clase base para todas las integraciones de auditoría."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class IntegrationCredentials:
    host: str
    username: str
    password: str
    port: int | None = None
    domain: str | None = None
    use_ssl: bool = True


class BaseIntegration(ABC):
    def __init__(self, credentials: IntegrationCredentials):
        self.credentials = credentials
        self._connected = False

    @abstractmethod
    async def connect(self) -> bool: ...

    @abstractmethod
    async def disconnect(self) -> None: ...

    @abstractmethod
    async def collect(self) -> dict: ...

    async def test_connection(self) -> tuple[bool, str]:
        try:
            ok = await self.connect()
            await self.disconnect()
            return ok, "OK" if ok else "Conexión fallida"
        except Exception as e:
            return False, str(e)
