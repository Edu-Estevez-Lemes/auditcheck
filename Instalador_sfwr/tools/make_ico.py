"""Convierte una imagen (PNG/JPG/BMP/GIF/ICO...) elegida durante la
instalacion en los formatos que AuditCheck necesita:

  - .ico multi-resolucion -> icono del acceso directo del escritorio
  - .png                  -> logo.png / icon.png / report_logo.png,
                             usados por la propia app (UI e informes)

Usado por install_wizard.ps1 / installer.nsi con el Python embebido que
viaja dentro del propio instalador (no depende de nada externo al equipo
del tecnico que genera el instalador, ni del equipo destino).

Uso:
    python make_ico.py <imagen_origen> <destino1> [<destino2> ...]

Cada destino se procesa segun su extension: ".ico" genera un icono
multi-resolucion; cualquier otra cosa (".png" en la practica) vuelca la
imagen tal cual, normalizada a RGBA.

Codigo de salida 0 = OK, 1 = error (el llamador debe conservar los
archivos de marca por defecto si esto falla).
"""
from __future__ import annotations

import sys

ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def _load_normalized(src_path: str):
    from PIL import Image

    img = Image.open(src_path)
    img.load()
    img = img.convert("RGBA")

    width, height = img.size
    if width != height:
        side = max(width, height)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(img, ((side - width) // 2, (side - height) // 2), img)
        img = canvas
    return img


def make_ico(img, dst_path: str) -> None:
    sizes = [s for s in ICO_SIZES if s <= max(img.size)] or [min(ICO_SIZES)]
    img.save(dst_path, format="ICO", sizes=[(s, s) for s in sizes])


def make_png(img, dst_path: str) -> None:
    img.save(dst_path, format="PNG")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: make_ico.py <imagen_origen> <destino1> [<destino2> ...]", file=sys.stderr)
        sys.exit(1)
    try:
        normalized = _load_normalized(sys.argv[1])
        for dst in sys.argv[2:]:
            if dst.lower().endswith(".ico"):
                make_ico(normalized, dst)
            else:
                make_png(normalized, dst)
    except Exception as exc:  # noqa: BLE001 - queremos capturar cualquier fallo de imagen
        print(f"ERROR generando el icono/logo: {exc}", file=sys.stderr)
        sys.exit(1)
    print("OK")
