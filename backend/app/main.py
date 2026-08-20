"""
AUDITCHECK - Backend Principal
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
from .utils.crypto import VaultLockedError
from .api import auth, clients, credentials, audits, scanners, dashboard, branding, rdp as rdp_router, access as access_router, reviews as reviews_router, review_categories as review_categories_router, review_templates as review_templates_router, console as console_router, audit_log as audit_log_router, vault as vault_router, database as database_router
from .database import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auditcheck")


def _ensure_dirs():
    for d in [settings.DATA_DIR, settings.ASSETS_DIR, settings.BRANDING_DIR,
              settings.CLIENTS_DIR, settings.AUDITS_DIR,
              settings.BACKUPS_DIR, settings.EXPORTS_DIR, settings.LOGS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


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

    # Migración review_sessions — columna exported_at añadida en v1.2.20
    try:
        if "review_sessions" in inspector.get_table_names():
            existing_rs = {c["name"] for c in inspector.get_columns("review_sessions")}
            with engine.connect() as conn:
                if "exported_at" not in existing_rs:
                    conn.execute(text("ALTER TABLE review_sessions ADD COLUMN exported_at DATETIME"))
                    logger.info("Migración: columna review_sessions.exported_at añadida")
                    conn.commit()
    except Exception as e:
        logger.warning(f"Migración DB (review_sessions): {e}")

    # Migración users — Bloque 1: usuarios y roles
    new_user_cols = {
        "role":                   "VARCHAR(20) DEFAULT 'tecnico'",
        "created_by":             "INTEGER",
        "last_login":             "DATETIME",
        "failed_login_attempts":  "INTEGER DEFAULT 0",
        "locked_until":           "DATETIME",
    }
    try:
        existing_u = {c["name"] for c in inspector.get_columns("users")}
        with engine.connect() as conn:
            for col, col_type in new_user_cols.items():
                if col not in existing_u:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_type}"))
                    logger.info(f"Migración: columna users.{col} añadida")
            conn.commit()
    except Exception as e:
        logger.warning(f"Migración DB (users): {e}")

    # Migración review_configs — personalización de checklist (plantillas + overrides por cliente)
    new_review_config_cols = {
        "template_id":    "INTEGER",
        "removed_items":  "JSON",
        "custom_items":   "JSON",
    }
    try:
        if "review_configs" in inspector.get_table_names():
            existing_rc = {c["name"] for c in inspector.get_columns("review_configs")}
            with engine.connect() as conn:
                added = False
                for col, col_type in new_review_config_cols.items():
                    if col not in existing_rc:
                        conn.execute(text(f"ALTER TABLE review_configs ADD COLUMN {col} {col_type}"))
                        logger.info(f"Migración: columna review_configs.{col} añadida")
                        added = True
                if added:
                    # Filas preexistentes quedan con NULL en las columnas JSON nuevas — normalizar a '{}'
                    conn.execute(text("UPDATE review_configs SET removed_items = '{}' WHERE removed_items IS NULL"))
                    conn.execute(text("UPDATE review_configs SET custom_items = '{}' WHERE custom_items IS NULL"))
                conn.commit()
    except Exception as e:
        logger.warning(f"Migración DB (review_configs): {e}")


def _migrate_roles():
    """
    Bloque 1 — Migra usuarios existentes de is_admin (bool) a role (str).
    is_admin=True -> "admin", is_admin=False -> "tecnico".
    Promueve a "superadmin" al usuario admin más antiguo (created_at mínimo).
    Idempotente: solo actúa sobre usuarios sin role asignado.
    """
    from sqlalchemy import text
    db = SessionLocal()
    try:
        from .models.user import User
        pending = db.query(User).filter((User.role == None) | (User.role == "")).all()  # noqa: E711
        if not pending:
            return
        for u in pending:
            u.role = "admin" if u.is_admin else "tecnico"
        db.commit()

        if db.query(User).filter(User.role == "superadmin").count() == 0:
            oldest_admin = (
                db.query(User)
                .filter(User.role == "admin")
                .order_by(User.created_at.asc())
                .first()
            )
            if oldest_admin:
                oldest_admin.role = "superadmin"
                db.commit()
                logger.info(f"Migración de roles: {oldest_admin.username} promovido a superadmin")
    except Exception as e:
        logger.warning(f"Migración de roles: {e}")
    finally:
        db.close()


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


def _seed_review_categories():
    """Siembra las categorías de revisión predefinidas si la tabla está vacía."""
    db = SessionLocal()
    try:
        from .services.review_checklist import seed_categories
        seed_categories(db)
    except Exception as e:
        logger.warning(f"Error sembrando categorías de revisión: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_dirs()
    Base.metadata.create_all(bind=engine)
    _migrate_db()
    _migrate_roles()
    _seed_login_profiles()
    _seed_review_categories()

    from .services.backup import maybe_auto_backup
    maybe_auto_backup()
    logger.info(f"AUDITCHECK v{settings.APP_VERSION} iniciado en http://{settings.HOST}:{settings.PORT}")
    yield
    logger.info("AUDITCHECK detenido")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Plataforma profesional de auditoría técnica para MSP y departamentos IT",
    lifespan=lifespan,
)

@app.exception_handler(VaultLockedError)
def vault_locked_handler(request, exc: VaultLockedError):
    return JSONResponse(status_code=423, content={"detail": str(exc)})


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
app.include_router(reviews_router.router, prefix=API_PREFIX)
app.include_router(review_categories_router.router, prefix=API_PREFIX)
app.include_router(review_templates_router.router, prefix=API_PREFIX)
app.include_router(console_router.router, prefix=API_PREFIX)
app.include_router(audit_log_router.router, prefix=API_PREFIX)
app.include_router(vault_router.router, prefix=API_PREFIX)
app.include_router(database_router.router, prefix=API_PREFIX)

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


@app.get("/api/v1/branding/report-logo")
def get_report_logo():
    from .reports.report_branding import get_report_logo_path
    path = get_report_logo_path()
    if path:
        return FileResponse(str(path), media_type="image/png")
    return JSONResponse(status_code=404, content={"detail": "Sin logo de informes ni logo corporativo configurados"})


@app.get("/api/v1/branding/emoji1")
def get_emoji1():
    path = settings.BRANDING_DIR / "emoji1.png"
    if path.exists():
        return FileResponse(str(path), media_type="image/png")
    return JSONResponse(status_code=404, content={"detail": "emoji1.png no encontrado en assets/branding/"})


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
