"""
AUDITCHECK — Launcher principal para distribución empaquetada.

Detecta si estamos en la carpeta de distribución (junto a python\ y frontend_dist\)
y configura las variables de entorno que config.py necesita para encontrar los datos.
Inicia el servidor FastAPI y abre el navegador automáticamente.

Uso:
  python\python.exe launcher.py           ← desde distribución
  python launcher.py                      ← desde desarrollo (sin efecto en rutas)
"""
from __future__ import annotations

import os
import sys
import threading
import time
import webbrowser
import multiprocessing

# ── Detectar modo distribución ──────────────────────────────────────────────
# Este archivo está en la raíz del paquete distribuido:
#   AUDITCHECK_v1.x/
#     launcher.py        ← aquí
#     python\            ← Python embebido
#     app\backend\       ← código fuente
#     frontend_dist\     ← React compilado
#     data\              ← base de datos y claves (se crea en el primer arranque)
# ───────────────────────────────────────────────────────────────────────────

HERE = os.path.dirname(os.path.abspath(__file__))

# El instalador escribe el puerto elegido en un .env junto a este archivo.
# Sin esto, .env queda ahí escrito pero nadie lo lee: AUDITCHECK_PORT nunca
# llega a os.environ y el servidor siempre arranca en el puerto por defecto.
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(HERE, ".env"))
except ImportError:
    pass

_is_dist = os.path.isdir(os.path.join(HERE, "python")) and \
           os.path.isdir(os.path.join(HERE, "frontend_dist"))

if _is_dist:
    # Rutas del paquete distribuido
    _app_src = os.path.join(HERE, "app")
    _frontend = os.path.join(HERE, "frontend_dist")

    os.environ.setdefault("AUDITCHECK_BASE_DIR",     HERE)
    os.environ.setdefault("AUDITCHECK_FRONTEND_DIR", _frontend)

    # Añadir app/ al path para que `import backend.app.main` funcione
    if _app_src not in sys.path:
        sys.path.insert(0, _app_src)

# ── Configuración del servidor ───────────────────────────────────────────────
HOST = os.environ.get("AUDITCHECK_HOST", "127.0.0.1")
PORT = int(os.environ.get("AUDITCHECK_PORT", "8000"))
URL  = f"http://{HOST}:{PORT}"


def _open_browser() -> None:
    """Abre el navegador 2 segundos después de que el servidor esté listo."""
    time.sleep(2.0)
    webbrowser.open(URL)


def main() -> None:
    multiprocessing.freeze_support()

    # Abrir navegador en segundo plano
    threading.Thread(target=_open_browser, daemon=True).start()

    import uvicorn  # importar aquí para que las env vars estén puestas antes

    print(f"\n  AUDITCHECK arrancando en {URL}\n"
          f"  Presiona Ctrl+C para detener.\n")

    uvicorn.run(
        "backend.app.main:app",
        host=HOST,
        port=PORT,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
