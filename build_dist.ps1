#Requires -Version 5.1
<#
.SYNOPSIS
    Crea la distribución portable de AUDITCHECK.

.DESCRIPTION
    Genera una carpeta autocontenida con:
      - Python 3.11 embebido (no requiere instalar Python en el equipo destino)
      - Todas las dependencias preinstaladas
      - Frontend React compilado
      - Scripts de lanzamiento

    Resultado:
      dist\AUDITCHECK_vX.X\          <- carpeta portable
      dist\AUDITCHECK_vX.X.zip       <- ZIP listo para distribuir
      dist\AUDITCHECK_vX.X_Setup.exe <- Instalador NSIS (si NSIS está instalado)

.EXAMPLE
    .\build_dist.ps1
    .\build_dist.ps1 -Version "1.2.0" -SkipFrontend
#>
param(
    [string]$Version       = "1.1.0",
    [string]$PythonVersion = "3.11.9",
    [switch]$SkipFrontend,       # omitir npm build (usar dist/ ya existente)
    [switch]$SkipDownload,       # omitir descarga de Python (usar caché)
    [switch]$KeepBuildDir        # no eliminar la carpeta dist\ al final
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Rutas ────────────────────────────────────────────────────────────────────
$ROOT        = $PSScriptRoot
$DIST_NAME   = "AUDITCHECK_v$Version"
$DIST_DIR    = Join-Path $ROOT "dist\$DIST_NAME"
$ZIP_OUT     = Join-Path $ROOT "dist\${DIST_NAME}.zip"
$CACHE_DIR   = Join-Path $ROOT ".build_cache"
$PY_CACHE    = Join-Path $CACHE_DIR "python-${PythonVersion}-embed-amd64.zip"
$PY_URL      = "https://www.python.org/ftp/python/$PythonVersion/python-${PythonVersion}-embed-amd64.zip"
$GETPIP_URL  = "https://bootstrap.pypa.io/get-pip.py"
$GETPIP_CACHE= Join-Path $CACHE_DIR "get-pip.py"

# ── Helpers ──────────────────────────────────────────────────────────────────
function Write-Step([int]$N, [int]$Total, [string]$Msg) {
    Write-Host ""
    Write-Host "  [$N/$Total] $Msg" -ForegroundColor Cyan
}

function Write-OK([string]$Msg)   { Write-Host "      OK — $Msg" -ForegroundColor Green }
function Write-Info([string]$Msg) { Write-Host "      · $Msg"   -ForegroundColor Gray  }
function Write-Warn([string]$Msg) { Write-Host "      ! $Msg"   -ForegroundColor Yellow }

function Test-Cmd([string]$Name) {
    return ($null -ne (Get-Command $Name -ErrorAction SilentlyContinue))
}

function Get-FileSize([string]$Path) {
    $mb = (Get-Item $Path).Length / 1MB
    return "$([math]::Round($mb, 1)) MB"
}

# ── Banner ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║  AUDITCHECK — Build Distribución Portable        ║" -ForegroundColor Green
Write-Host "  ║  Versión: $Version   Python: $PythonVersion               ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Green

# ── Paso 0: Prerequisitos ─────────────────────────────────────────────────────
Write-Step 0 7 "Verificando prerequisitos..."

if (-not (Test-Cmd "node") -and -not $SkipFrontend) {
    Write-Error "Node.js no encontrado. Instala Node.js o usa -SkipFrontend."
}
if (-not (Test-Cmd "npm") -and -not $SkipFrontend) {
    Write-Error "npm no encontrado."
}

$VENV_PYTHON = Join-Path $ROOT "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $VENV_PYTHON)) {
    Write-Error "No se encontró backend\.venv\. Ejecuta start.bat primero para crear el entorno."
}

if (-not $SkipFrontend) {
    Write-Info "Node.js: $(node --version)"
    Write-Info "npm:     $(npm --version)"
}
Write-Info "Python (venv): $(& $VENV_PYTHON --version)"
Write-OK "Prerequisitos OK"

# ── Paso 1: Frontend React ────────────────────────────────────────────────────
Write-Step 1 7 "Compilando frontend React..."

if ($SkipFrontend) {
    Write-Warn "SkipFrontend activo — usando dist/ existente"
} else {
    Push-Location (Join-Path $ROOT "frontend")
    try {
        Write-Info "npm install..."
        npm install --silent 2>&1 | Out-Null
        Write-Info "npm run build..."
        npm run build 2>&1 | Out-Null
    } finally {
        Pop-Location
    }
}

$frontendDist = Join-Path $ROOT "frontend\dist"
if (-not (Test-Path $frontendDist)) {
    Write-Error "No existe frontend\dist\. El build del frontend falló."
}
$frontendFiles = (Get-ChildItem $frontendDist -Recurse -File).Count
Write-OK "Frontend compilado ($frontendFiles archivos)"

# ── Paso 2: Preparar directorio de distribución ───────────────────────────────
Write-Step 2 7 "Preparando directorio de distribución..."

New-Item -Path (Join-Path $ROOT "dist") -ItemType Directory -Force | Out-Null
New-Item -Path $CACHE_DIR -ItemType Directory -Force | Out-Null

if (Test-Path $DIST_DIR) {
    Remove-Item -Recurse -Force $DIST_DIR
}
New-Item -ItemType Directory -Path $DIST_DIR     -Force | Out-Null
New-Item -ItemType Directory -Path "$DIST_DIR\data"             -Force | Out-Null
New-Item -ItemType Directory -Path "$DIST_DIR\assets\branding"  -Force | Out-Null
Write-OK "Directorio $DIST_NAME\ listo"

# ── Paso 3: Python embebido ───────────────────────────────────────────────────
Write-Step 3 7 "Configurando Python $PythonVersion embebido..."

# Descargar Python embeddable (con caché)
if (-not (Test-Path $PY_CACHE) -or $SkipDownload -eq $false) {
    if (-not (Test-Path $PY_CACHE)) {
        Write-Info "Descargando python-${PythonVersion}-embed-amd64.zip ..."
        Write-Info "(se guarda en .build_cache\ para futuros builds)"
        Invoke-WebRequest -Uri $PY_URL -OutFile $PY_CACHE -UseBasicParsing
    }
} else {
    Write-Info "Usando Python embebido en caché: $PY_CACHE"
}

$PY_DIR = "$DIST_DIR\python"
Write-Info "Extrayendo Python embebido..."
Expand-Archive -Path $PY_CACHE -DestinationPath $PY_DIR -Force

# Habilitar site-packages en el Python embebido
# El archivo *.pth controla qué directorios incluye Python al arrancar.
# La línea '#import site' viene comentada por defecto; hay que descomentarla
# para que pip instale en Lib/site-packages y sea encontrado después.
$pthFile = Get-ChildItem $PY_DIR -Filter "*._pth" | Select-Object -First 1
if (-not $pthFile) {
    Write-Error "No se encontró el archivo ._pth en el Python embebido."
}
$pthContent = Get-Content $pthFile.FullName -Raw
if ($pthContent -match '#import site') {
    $pthContent = $pthContent -replace '#import site', 'import site'
    Set-Content $pthFile.FullName $pthContent -Encoding ASCII
    Write-Info "site-packages habilitado en $($pthFile.Name)"
}

# Descargar e instalar pip (con caché)
if (-not (Test-Path $GETPIP_CACHE)) {
    Write-Info "Descargando get-pip.py..."
    Invoke-WebRequest -Uri $GETPIP_URL -OutFile $GETPIP_CACHE -UseBasicParsing
}
Write-Info "Instalando pip en Python embebido..."
& "$PY_DIR\python.exe" $GETPIP_CACHE --no-warn-script-location --quiet

Write-OK "Python $PythonVersion embebido configurado"

# ── Paso 4: Instalar dependencias ─────────────────────────────────────────────
Write-Step 4 7 "Instalando dependencias Python (puede tardar unos minutos)..."

$REQ_FILE = Join-Path $ROOT "backend\requirements.txt"
Write-Info "pip install -r requirements.txt ..."
& "$PY_DIR\python.exe" -m pip install `
    --requirement $REQ_FILE `
    --no-warn-script-location `
    --quiet

$pkgCount = (Get-ChildItem "$PY_DIR\Lib\site-packages" -Directory).Count
Write-OK "$pkgCount paquetes instalados en Lib\site-packages\"

# ── Paso 5: Copiar código fuente y assets ─────────────────────────────────────
Write-Step 5 7 "Copiando código fuente y assets..."

# Backend Python
$appDir = "$DIST_DIR\app"
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

# Copiar solo el paquete backend (sin venv, sin __pycache__)
$backendSrc = Join-Path $ROOT "backend\app"
Copy-Item -Recurse -Path $backendSrc -Destination "$appDir\backend\app"

# Recrear paquete __init__ para que sea importable como backend.app
@"" | Set-Content "$appDir\backend\__init__.py" -Encoding UTF8
# Copiar requirements y el launcher
Copy-Item (Join-Path $ROOT "launcher.py") "$DIST_DIR\"

# Frontend compilado
Copy-Item -Recurse -Path $frontendDist -Destination "$DIST_DIR\frontend_dist"

# Assets (logos, branding)
$assetsDir = Join-Path $ROOT "assets"
if (Test-Path $assetsDir) {
    Copy-Item -Recurse -Path "$assetsDir\*" -Destination "$DIST_DIR\assets\" -ErrorAction SilentlyContinue
}

# .env.example como referencia
$envExample = Join-Path $ROOT ".env.example"
if (Test-Path $envExample) {
    Copy-Item $envExample "$DIST_DIR\.env.example"
}

Write-OK "Código fuente y assets copiados"

# ── Paso 6: Crear scripts de lanzamiento ──────────────────────────────────────
Write-Step 6 7 "Creando scripts de lanzamiento y accesos directos..."

# ── AUDITCHECK.bat — Lanzador principal (sin ventana de consola) ──
$batContent = @'
@echo off
cd /d "%~dp0"
start "" "%~dp0python\python.exe" -W ignore "%~dp0launcher.py"
'@
Set-Content -Path "$DIST_DIR\AUDITCHECK.bat" -Value $batContent -Encoding ASCII

# ── AUDITCHECK_consola.bat — Lanzador con consola (debug / primer arranque) ──
$batDebug = @'
@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AUDITCHECK
echo.
echo   AUDITCHECK iniciando...
echo   Navega a http://127.0.0.1:8000
echo   Presiona Ctrl+C para detener.
echo.
"%~dp0python\python.exe" "%~dp0launcher.py"
echo.
echo   AUDITCHECK detenido.
pause
'@
Set-Content -Path "$DIST_DIR\AUDITCHECK_consola.bat" -Value $batDebug -Encoding ASCII

# ── Instalar_accesos.bat — Crea accesos directos sin admin ──
$batInstall = @'
@echo off
chcp 65001 >nul
echo.
echo   AUDITCHECK - Creando accesos directos...
echo.
set "APP_DIR=%~dp0"
set "SHORTCUT=AUDITCHECK"
set "DESKTOP=%USERPROFILE%\Desktop"
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"

powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut('%DESKTOP%\%SHORTCUT%.lnk'); " ^
    "$s.TargetPath = '%APP_DIR%AUDITCHECK.bat'; " ^
    "$s.WorkingDirectory = '%APP_DIR%'; " ^
    "$s.WindowStyle = 7; " ^
    "$s.Save()"
echo   Acceso directo creado en el escritorio.

powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$s = $ws.CreateShortcut('%STARTMENU%\%SHORTCUT%.lnk'); " ^
    "$s.TargetPath = '%APP_DIR%AUDITCHECK.bat'; " ^
    "$s.WorkingDirectory = '%APP_DIR%'; " ^
    "$s.WindowStyle = 7; " ^
    "$s.Save()"
echo   Acceso directo creado en el menu Inicio.

echo.
echo   Listo. Usa el acceso AUDITCHECK en el escritorio.
echo.
pause
'@
Set-Content -Path "$DIST_DIR\Instalar_accesos.bat" -Value $batInstall -Encoding ASCII

# ── Desinstalar_accesos.bat ──
$batUninstall = @'
@echo off
del "%USERPROFILE%\Desktop\AUDITCHECK.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\AUDITCHECK.lnk" 2>nul
echo Accesos directos eliminados.
pause
'@
Set-Content -Path "$DIST_DIR\Desinstalar_accesos.bat" -Value $batUninstall -Encoding ASCII

# ── LEEME.txt ──
$readme = @"
AUDITCHECK v$Version
$(("=" * 40))

REQUISITOS
----------
- Windows 10 o Windows 11 (64 bits)
- No se necesita instalar nada (Python incluido)

PRIMER USO
----------
1. Haz doble clic en  AUDITCHECK.bat  para iniciar.
   El navegador se abrira automaticamente.

2. Accede con:
   Usuario:    admin
   Contraseña: AuditCheck2024!
   (Cambia la contrasena en el primer acceso)

3. OPCIONAL: ejecuta  Instalar_accesos.bat  una sola vez
   para crear accesos directos en escritorio y menu Inicio.

MODO DEBUG (si el inicio falla)
---------------------------------
Ejecuta  AUDITCHECK_consola.bat  para ver los mensajes de error.

DATOS Y COPIAS DE SEGURIDAD
----------------------------
La base de datos y configuracion se guardan en:
   .\data\

Para hacer backup, copia esa carpeta.
Para resetear a fabrica, elimina .\data\auditcheck.db

MOVER LA INSTALACION
--------------------
Puedes mover esta carpeta a cualquier ubicacion sin reinstalar.
Si tienes accesos directos, ejecuta Instalar_accesos.bat de nuevo.

REPOSITORIO
-----------
https://github.com/Edu-Estevez-Lemes/auditcheck
"@
Set-Content -Path "$DIST_DIR\LEEME.txt" -Value $readme -Encoding UTF8

Write-OK "Scripts creados"

# ── Paso 7: Empaquetar ────────────────────────────────────────────────────────
Write-Step 7 7 "Creando ZIP portable..."

if (Test-Path $ZIP_OUT) { Remove-Item $ZIP_OUT -Force }
Compress-Archive -Path "$DIST_DIR\*" -DestinationPath $ZIP_OUT
Write-OK "ZIP: $ZIP_OUT  ($(Get-FileSize $ZIP_OUT))"

# ── NSIS installer (opcional) ─────────────────────────────────────────────────
$nsisExe = @(
    "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
    "${env:ProgramFiles}\NSIS\makensis.exe",
    "C:\Program Files (x86)\NSIS\makensis.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$nsisScript = Join-Path $ROOT "build\setup.nsi"

if ($nsisExe -and (Test-Path $nsisScript)) {
    Write-Host ""
    Write-Host "  [+] NSIS encontrado. Generando instalador .exe..." -ForegroundColor Cyan
    $env:AUDITCHECK_VERSION = $Version
    $env:AUDITCHECK_DIST_DIR = $DIST_DIR
    & $nsisExe /DVERSION=$Version /DDIST_DIR=$DIST_DIR $nsisScript
    $setupExe = Join-Path $ROOT "dist\${DIST_NAME}_Setup.exe"
    if (Test-Path $setupExe) {
        Write-OK "Instalador: $setupExe  ($(Get-FileSize $setupExe))"
    }
} elseif (-not $nsisExe) {
    Write-Host ""
    Write-Warn "NSIS no encontrado — solo se generó el ZIP."
    Write-Info "Para crear un instalador .exe, instala NSIS desde https://nsis.sf.net"
    Write-Info "y vuelve a ejecutar este script."
}

# ── Resumen ───────────────────────────────────────────────────────────────────
$folderSize = (Get-ChildItem $DIST_DIR -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host ""
Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Build completado correctamente" -ForegroundColor Green
Write-Host ""
Write-Host "  Carpeta:   dist\$DIST_NAME\"  -ForegroundColor White
Write-Host "             ($([math]::Round($folderSize,1)) MB sin comprimir)" -ForegroundColor Gray
Write-Host "  ZIP:       dist\${DIST_NAME}.zip" -ForegroundColor White
if ($nsisExe -and (Test-Path (Join-Path $ROOT "dist\${DIST_NAME}_Setup.exe"))) {
    Write-Host "  Installer: dist\${DIST_NAME}_Setup.exe" -ForegroundColor White
}
Write-Host ""
Write-Host "  Pasos para distribuir:" -ForegroundColor Cyan
Write-Host "    1. Copia el ZIP al equipo destino" -ForegroundColor Gray
Write-Host "    2. Extrae en cualquier carpeta (ej: C:\AuditCheck\)" -ForegroundColor Gray
Write-Host "    3. Ejecuta Instalar_accesos.bat (una vez)" -ForegroundColor Gray
Write-Host "    4. Doble clic en AUDITCHECK.bat para iniciar" -ForegroundColor Gray
Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
