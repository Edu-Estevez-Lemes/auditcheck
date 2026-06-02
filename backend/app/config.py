from __future__ import annotations
import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Aplicación
    APP_NAME: str = "ÃUDITCHECK"
    APP_VERSION: str = "1.1.0"
    DEBUG: bool = False

    # Seguridad JWT
    SECRET_KEY: str = "cambia-esta-clave-en-produccion-usa-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 horas

    # Base de datos — calculada en model_post_init si está vacío
    DATABASE_URL: str = ""

    # Servidor
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Rutas — calculadas relativamente al proyecto (3 niveles sobre config.py)
    # Pueden sobreescribirse con AUDITCHECK_BASE_DIR / AUDITCHECK_FRONTEND_DIR
    # (usadas por launcher.py en distribución empaquetada y PyInstaller)
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    ASSETS_DIR: Path = BASE_DIR / "assets"
    BRANDING_DIR: Path = BASE_DIR / "assets" / "branding"
    CLIENTS_DIR: Path = BASE_DIR / "data" / "clients"
    AUDITS_DIR: Path = BASE_DIR / "data" / "audits"
    KEY_FILE: Path = BASE_DIR / "data" / ".key"

    # Frontend (archivos compilados de React)
    FRONTEND_DIR: Path = BASE_DIR / "frontend" / "dist"

    # Escáner
    SCAN_TIMEOUT: float = 2.0
    SCAN_MAX_WORKERS: int = 100
    SCAN_COMMON_PORTS: list[int] = [
        21, 22, 23, 25, 53, 80, 110, 111, 123, 135, 139, 143, 161, 389,
        443, 445, 465, 514, 587, 636, 993, 995, 1433, 1521, 1723,
        2049, 3306, 3389, 3690, 4443, 5432, 5900, 5985, 5986, 6379,
        7443, 8000, 8080, 8081, 8443, 8888, 9090, 9200, 9440, 9443,
        902, 903, 5480, 27017
    ]

    model_config = {"env_file": ".env", "case_sensitive": True}

    def model_post_init(self, __context: object) -> None:
        # ── Soporte para distribución empaquetada (launcher.py establece estas vars) ──
        # AUDITCHECK_BASE_DIR: raíz de la distribución (contiene data/, assets/, etc.)
        # AUDITCHECK_FRONTEND_DIR: carpeta frontend_dist/ dentro del paquete
        base_override = os.environ.get("AUDITCHECK_BASE_DIR")
        if base_override:
            base = Path(base_override).resolve()
            object.__setattr__(self, "BASE_DIR",    base)
            object.__setattr__(self, "DATA_DIR",    base / "data")
            object.__setattr__(self, "ASSETS_DIR",  base / "assets")
            object.__setattr__(self, "BRANDING_DIR",base / "assets" / "branding")
            object.__setattr__(self, "CLIENTS_DIR", base / "data" / "clients")
            object.__setattr__(self, "AUDITS_DIR",  base / "data" / "audits")
            object.__setattr__(self, "KEY_FILE",    base / "data" / ".key")

        frontend_override = os.environ.get("AUDITCHECK_FRONTEND_DIR")
        if frontend_override:
            object.__setattr__(self, "FRONTEND_DIR", Path(frontend_override).resolve())

        # Si hay override de rutas, la DATABASE_URL siempre apunta a la ruta absoluta
        # (ignora cualquier valor relativo que pudiera venir del .env)
        if not self.DATABASE_URL or base_override:
            db_path = self.DATA_DIR / "auditcheck.db"
            object.__setattr__(self, "DATABASE_URL", f"sqlite:///{db_path}")


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
