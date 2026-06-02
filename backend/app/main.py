"""
ÃUDITCHECK - Backend Principal
FastAPI application con soporte WebSocket para escaneos en tiempo real.
"""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .config import settings
from .database import engine
from .models import Base
from .api import auth, clients, credentials, audits, scanners, dashboard, branding, rdp as rdp_router, access as access_router
from .services.auth import hash_password
from .database import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auditcheck")


def _ensure_dirs():
    for d in [settings.DATA_DIR, settings.ASSETS_DIR, settings.BRANDING_DIR,
              settings.CLIENTS_DIR, settings.AUDITS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def _create_default_admin():
    """Crea el usuario admin por defecto si no existe ningún usuario."""
    db = SessionLocal()
    try:
        from .models.user import User
        if db.query(User).count() == 0:
            admin = User(
                username="admin",
                email="admin@auditcheck.example",
                full_name="Administrador",
                hashed_password=hash_password("AuditCheck2024!"),
                is_active=True,
                is_admin=True,
                must_change_password=True,
            )
            db.add(admin)
            db.commit()
            logger.info("Usuario admin creado: admin / AuditCheck2024! — CAMBIA LA CONTRASEÑA")
    finally:
        db.close()


def _migrate_db():
    """Añade columnas nuevas a tablas existentes (SQLite compatible)."""
    from sqlalchemy import text, inspect
    inspector = inspect(engine)

    new_device_cols = {
        "display_name":   "VARCHAR(255)",
        "custom_category": "VARCHAR(100)",
        "location":       "VARCHAR(255)",
        "description":    "VARCHAR(1000)",
        "observations":   "VARCHAR(1000)",
        "manually_edited": "BOOLEAN DEFAULT 0",
        "is_new_device":  "BOOLEAN DEFAULT 1",
        "credential_id":  "INTEGER",
    }

    try:
        existing = {c["name"] for c in inspector.get_columns("devices")}
        with engine.connect() as conn:
            for col, col_type in new_device_cols.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE devices ADD COLUMN {col} {col_type}"))
                    logger.info(f"Migración: columna devices.{col} añadida")
            conn.commit()
    except Exception as e:
        logger.warning(f"Migración DB (devices): {e}")

    # Migración device_knowledge
    new_knowledge_cols = {
        "credential_id": "INTEGER",
    }
    try:
        existing_k = {c["name"] for c in inspector.get_columns("device_knowledge")}
        with engine.connect() as conn:
            for col, col_type in new_knowledge_cols.items():
                if col not in existing_k:
                    conn.execute(text(f"ALTER TABLE device_knowledge ADD COLUMN {col} {col_type}"))
                    logger.info(f"Migración: columna device_knowledge.{col} añadida")
            conn.commit()
    except Exception as e:
        logger.warning(f"Migración DB (device_knowledge): {e}")


def _seed_login_profiles():
    """
    Carga los perfiles de login predefinidos para plataformas conocidas.
    Solo inserta si la tabla está vacía para no duplicar en cada arranque.
    Los perfiles son editables via API /access/login-profiles.
    """
    from .models.login_profile import LoginProfile

    db = SessionLocal()
    try:
        if db.query(LoginProfile).count() > 0:
            return  # Ya sembrado

        profiles = [
            LoginProfile(
                name="FortiGate",
                device_type="fortigate",
                username_selector="#username",
                password_selector="#secretkey",
                submit_selector="#login_button, button[type=submit]",
                notes="FortiOS web UI. Campo contraseña: #secretkey (no #password).",
            ),
            LoginProfile(
                name="HPE iLO",
                device_type="ilo",
                username_selector="#login-form-username",
                password_selector="#login-form-password",
                submit_selector="#login-form__login",
                notes="HP Integrated Lights-Out. iLO 4 y iLO 5.",
            ),
            LoginProfile(
                name="Dell iDRAC",
                device_type="idrac",
                username_selector="#user",
                password_selector="#password",
                submit_selector="button[type=submit], #btnOK",
                notes="Dell iDRAC 7/8/9. iDRAC 9 puede usar #idrac-username.",
            ),
            LoginProfile(
                name="VMware ESXi",
                device_type="esxi",
                username_selector="#username",
                password_selector="#password",
                submit_selector=".btn-primary",
                notes="ESXi Host Client (puerto 443). URL: /ui/",
            ),
            LoginProfile(
                name="VMware vCenter",
                device_type="vcenter",
                username_selector="#username",
                password_selector="#password",
                submit_selector="button[class*='button-primary'], .btn-submit",
                pre_login_path="/ui/#/login",
                notes="vCenter Server Appliance (VCSA). URL: /ui/#/login",
            ),
            LoginProfile(
                name="Veeam Backup & Replication",
                device_type="veeam",
                username_selector="input[name=Username], #username",
                password_selector="input[name=Password], #password",
                submit_selector="button[type=submit]",
                notes="Veeam Backup Enterprise Manager. Puerto 9080 (HTTP) o 9443 (HTTPS).",
            ),
            LoginProfile(
                name="NAS QNAP",
                device_type="nas",
                url_pattern="qnap|QTS|QuTS",
                username_selector="#username-input, input[name=username]",
                password_selector="#pwd-input, input[name=password]",
                submit_selector="#login-btn",
                notes="QNAP QTS / QuTS Hero.",
            ),
            LoginProfile(
                name="NAS Synology",
                device_type="nas",
                url_pattern="synology|DSM",
                username_selector="#login-username",
                password_selector="#current-password",
                submit_selector=".login-btn, button[type=submit]",
                notes="Synology DSM. La detección usa url_pattern='synology|DSM'.",
            ),
            LoginProfile(
                name="Printer Web",
                device_type="printer",
                username_selector="input[name=user], input[name=username], input[type=text]",
                password_selector="input[name=password], input[type=password]",
                submit_selector="input[type=submit], button[type=submit]",
                notes="Selectores genéricos para impresoras con interfaz web.",
            ),
        ]
        db.add_all(profiles)
        db.commit()
        logger.info(f"Perfiles de login sembrados: {len(profiles)} perfiles")
    except Exception as e:
        logger.warning(f"Error sembrando perfiles de login: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_dirs()
    Base.metadata.create_all(bind=engine)
    _migrate_db()
    _create_default_admin()
    _seed_login_profiles()
    logger.info(f"ÃUDITCHECK v{settings.APP_VERSION} iniciado en http://{settings.HOST}:{settings.PORT}")
    yield
    logger.info("ÃUDITCHECK detenido")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Plataforma profesional de auditoría técnica para MSP y departamentos IT",
    lifespan=lifespan,
)

# CORS — permite frontend React en desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rutas API v1
API_PREFIX = "/api/v1"
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(clients.router, prefix=API_PREFIX)
app.include_router(credentials.router, prefix=API_PREFIX)
app.include_router(audits.router, prefix=API_PREFIX)
app.include_router(scanners.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(branding.router, prefix=API_PREFIX)
app.include_router(rdp_router.router, prefix=API_PREFIX)
app.include_router(access_router.router, prefix=API_PREFIX)

# Branding — logo corporativo
@app.get("/api/v1/branding/logo")
def get_corp_logo():
    path = settings.BRANDING_DIR / "logo.png"
    if path.exists():
        return FileResponse(str(path), media_type="image/png")
    return JSONResponse(status_code=404, content={"detail": "Logo corporativo no encontrado. Coloca logo.png en assets/branding/"})


@app.get("/api/v1/branding/icon")
def get_corp_icon():
    path = settings.BRANDING_DIR / "icon.png"
    if path.exists():
        return FileResponse(str(path), media_type="image/png")
    return JSONResponse(status_code=404, content={"detail": "Icono no encontrado. Coloca icon.png en assets/branding/"})


@app.get("/api/v1/info")
def app_info():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "branding": {
            "logo": (settings.BRANDING_DIR / "logo.png").exists(),
            "icon": (settings.BRANDING_DIR / "icon.png").exists(),
        }
    }


# Servir frontend compilado (producción)
frontend_dist = settings.FRONTEND_DIR
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(str(frontend_dist / "index.html"))
