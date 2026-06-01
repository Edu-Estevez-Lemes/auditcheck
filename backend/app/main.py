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
from .api import auth, clients, credentials, audits, scanners, dashboard, branding
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_dirs()
    Base.metadata.create_all(bind=engine)
    _create_default_admin()
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
