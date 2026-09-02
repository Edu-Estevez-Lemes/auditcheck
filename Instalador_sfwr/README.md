# Instalador de AuditCheck

Genera un único `AuditCheck_vX.X_Setup.exe` (instalador NSIS real) para
desplegar AuditCheck en el equipo de un cliente **sin asumir que ese equipo
tiene nada preinstalado**.

## Qué necesita el equipo DESTINO (donde se instala AuditCheck)

- Windows 10 u 11 de 64 bits. Nada más.
- No necesita Python, Node.js ni Visual C++ Redistributable: el instalador
  lleva dentro un Python embebido (con `vcruntime140.dll` incluido junto a
  `python.exe`, que es justo lo que evita depender del runtime de Visual C++
  del sistema) y todas las dependencias ya instaladas.
- No necesita permisos de administrador: se instala en el perfil del usuario
  (`%LOCALAPPDATA%\AuditCheck`) y solo escribe en `HKCU`.
- No necesita conexión a Internet, ni para instalar ni para funcionar.

## Qué necesita la máquina donde se GENERA el instalador (esta carpeta)

- Node.js + npm (para compilar el frontend).
- 7-Zip instalado en `C:\Program Files\7-Zip\` — se usa **una sola vez** para
  extraer NSIS portable (ver siguiente punto); no hace falta para nada más.
- Conexión a Internet la primera vez que se ejecuta: descarga el Python
  embebido oficial de python.org y NSIS (el compilador de instaladores,
  `makensis.exe`) desde SourceForge. Ambos quedan cacheados en
  `..\.build_cache\` para builds posteriores, que ya no necesitan red.

Ninguno de estos requisitos viaja al equipo destino: son solo herramientas
para *construir* el instalador, no para *ejecutarlo*.

## Uso

```powershell
cd Instalador_sfwr
.\build_installer.ps1
```

El resultado queda en `Instalador_sfwr\output\AuditCheck_vX.X_Setup.exe`.

Parámetros opcionales:

- `-Version "3.2.2"` — si no se indica, se detecta automáticamente desde
  `backend\app\config.py` (`APP_VERSION`).
- `-Publisher "Nombre del MSP"` — texto que aparece en "Agregar o quitar
  programas". Por defecto `AuditCheck`.
- `-SkipFrontend` — omite `npm install && npm run build` y reutiliza el
  `frontend\dist\` ya compilado (útil para iterar rápido sobre el propio
  instalador sin recompilar el frontend cada vez).

## Qué hace el instalador en el equipo destino

Es un instalador NSIS estándar (el mismo tipo de `Setup.exe` que genera
cualquier software de escritorio), con estas páginas:

1. **Bienvenida** — bloquea (con opción de continuar bajo aviso) en Windows
   anteriores a 10 o en sistemas de 32 bits: no asume que el equipo cumple
   los requisitos, los comprueba.
2. **Directorio** — por defecto `%LOCALAPPDATA%\AuditCheck`, editable, sin
   necesitar permisos de administrador.
3. **Personalización** — el técnico que instala puede elegir una imagen
   (PNG/JPG/BMP/ICO) para usarla como icono del acceso directo del
   escritorio. El instalador la convierte automáticamente al formato `.ico`
   multi-resolución correcto usando el Python + Pillow embebidos
   (`tools/make_ico.py`), sea cual sea el formato de origen. Si se deja en
   blanco, se usa el logo por defecto de AuditCheck (la berenjena, sin el
   texto "AUDITCHECK") — `assets/branding/icon.ico`.
4. **Puerto** — por defecto 8000; comprueba si ya está en uso y avisa antes
   de continuar.
5. **Instalando** — copia archivos, genera el icono, crea accesos directos
   (escritorio + menú Inicio) ya con ese icono aplicado, registra la app en
   "Agregar o quitar programas" con su propio desinstalador.
6. **Finalizar** — opción de arrancar la app y ver el LEEME.

Cada build genera un usuario/contraseña de superadmin **aleatorio y único
para ese `.exe`** (no un valor fijo compartido entre instalaciones) y lo dev
uelve en `output\AuditCheck_vX.X_SUPERADMIN.txt`, junto al instalador. El
cliente no lo ve en ningún momento del flujo normal de instalación o primer
arranque: soporte se conecta remotamente (AnyDesk/RDP) tras la instalación,
inicia sesión con esas credenciales y crea ahí la cuenta ("admin" o "user")
que va a usar el cliente. Guarda ese TXT en vuestro gestor de contraseñas y
bórralo de `output\` — no se lo entregues al cliente.

Nota de seguridad: la contraseña queda incrustada en el propio `.exe` y se
escribe brevemente en texto plano en el equipo destino durante la
instalación (se borra en cuanto la app la consume en su primer arranque).
No es un secreto criptográfico fuerte frente a alguien que analice el
binario; es una barrera práctica para que quien simplemente instala y
arranca la app no obtenga superadmin por su cuenta.

Si se compila `installer.nsi` a mano sin pasar `SUPERADMIN_USER`/
`SUPERADMIN_PASSWORD` (lo que sí hace siempre `build_installer.ps1`), no se
crea ningún marcador y la app cae al flujo anterior: la propia aplicación
pide crear la cuenta de administrador en el primer arranque.

También admite instalación silenciosa (`AuditCheck_vX.X_Setup.exe /S`) y
desinstalación silenciosa (`Desinstalar.exe /S`) para despliegue
desatendido; en ese modo se usan los valores por defecto (puerto 8000, logo
por defecto) porque las páginas personalizadas no se muestran.

## Estructura de esta carpeta

```
Instalador_sfwr/
  build_installer.ps1   Script de build (se ejecuta en la máquina del técnico)
  installer.nsi          Script NSIS: páginas, textos, lógica de instalación
  tools/make_ico.py      Conversor de imagen -> .ico multi-resolución (Pillow)
  output/                 (generado) Setup.exe final
  .payload/               (generado, temporal) contenido de la distribución
```

`output/` y `.payload/` están en `.gitignore`: son artefactos, no código
fuente. Solo se versionan los scripts.

## Por qué NSIS y no un .7z autoextraíble

La primera versión de este instalador usaba un módulo SFX de 7-Zip con un
script de instalación personalizado (formato `;!@Install@!`). El
`7z.sfx` que trae la instalación estándar de 7-Zip **no interpreta ese
script** (esa capacidad se distribuía en el paquete "7-Zip Extra", que ya
no la incluye en versiones recientes) — el resultado era el diálogo
genérico "7-Zip self-extracting archive: Extract to...", no un instalador
de verdad. NSIS es la herramienta estándar para esto: produce un `Setup.exe`
real con páginas, elección de carpeta, accesos directos y desinstalador,
sin depender de comportamientos no garantizados de un extractor genérico.
