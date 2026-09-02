#Requires -Version 5.1
<#
.SYNOPSIS
    Genera el instalador de AuditCheck (AuditCheck_vX.X_Setup.exe).

.DESCRIPTION
    Este script se ejecuta en la maquina del DESARROLLADOR/TECNICO que prepara
    el instalador, no en la maquina destino. Necesita en ESTA maquina:
      - Node.js + npm      (para compilar el frontend)
      - 7-Zip              (para extraer NSIS portable la primera vez)
      - Conexion a Internet la primera vez (descarga Python embebido y NSIS;
        ambos quedan cacheados en ..\.build_cache para las siguientes
        ejecuciones, que ya no necesitan red)

    El resultado (Instalador_sfwr\output\AuditCheck_vX.X_Setup.exe) es un
    instalador NSIS real y autocontenido que el tecnico lleva al equipo del
    cliente. NO requiere absolutamente nada preinstalado en ese equipo: ni
    Python, ni Node, ni Visual C++, ni permisos de administrador. Solo
    Windows 10/11 de 64 bits.

.EXAMPLE
    .\build_installer.ps1
    .\build_installer.ps1 -Version "3.1.1" -SkipFrontend
#>
param(
    [string]$Version       = "",       # auto-detectado de backend\app\config.py si no se indica
    [string]$Publisher     = "AuditCheck",
    [string]$PythonVersion = "3.11.9",
    [string]$NsisVersion   = "3.10",
    [switch]$SkipFrontend,       # omitir npm build (usar frontend\dist ya existente)
    [switch]$KeepPayloadDir     # no eliminar la carpeta de payload intermedia al final
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -- Rutas --------------------------------------------------------------------
$INSTALLER_DIR = $PSScriptRoot
$ROOT          = Split-Path $INSTALLER_DIR -Parent

if (-not $Version) {
    $configFile = Join-Path $ROOT "backend\app\config.py"
    if (Test-Path $configFile) {
        $match = Select-String -Path $configFile -Pattern 'APP_VERSION\s*:\s*str\s*=\s*"([^"]+)"'
        if ($match) { $Version = $match.Matches[0].Groups[1].Value }
    }
    if (-not $Version) { $Version = "0.0.0" }
    Write-Host "  Version detectada desde config.py: $Version" -ForegroundColor Cyan
}

$PAYLOAD_DIR   = Join-Path $INSTALLER_DIR ".payload"
$OUTPUT_DIR    = Join-Path $INSTALLER_DIR "output"
$OUT_EXE       = Join-Path $OUTPUT_DIR "AuditCheck_v${Version}_Setup.exe"
$CACHE_DIR     = Join-Path $ROOT ".build_cache"
$PY_CACHE      = Join-Path $CACHE_DIR "python-${PythonVersion}-embed-amd64.zip"
$PY_URL        = "https://www.python.org/ftp/python/$PythonVersion/python-${PythonVersion}-embed-amd64.zip"
$GETPIP_URL    = "https://bootstrap.pypa.io/get-pip.py"
$GETPIP_CACHE  = Join-Path $CACHE_DIR "get-pip.py"
$NSIS_DIR      = Join-Path $CACHE_DIR "nsis-$NsisVersion"
$NSIS_CACHE    = Join-Path $CACHE_DIR "nsis-$NsisVersion-setup.exe"
$NSIS_URL      = "https://downloads.sourceforge.net/project/nsis/NSIS%203/$NsisVersion/nsis-$NsisVersion-setup.exe"
$MAKENSIS      = Join-Path $NSIS_DIR "makensis.exe"

# -- Helpers ------------------------------------------------------------------
function Write-Step([int]$N, [int]$Total, [string]$Msg) {
    Write-Host ""
    Write-Host "  [$N/$Total] $Msg" -ForegroundColor Cyan
}
function Write-OK([string]$Msg)   { Write-Host "      OK - $Msg" -ForegroundColor Green }
function Write-Info([string]$Msg) { Write-Host "      * $Msg"   -ForegroundColor Gray  }
function Write-Warn([string]$Msg) { Write-Host "      ! $Msg"   -ForegroundColor Yellow }
function Test-Cmd([string]$Name)  { return ($null -ne (Get-Command $Name -ErrorAction SilentlyContinue)) }
function Get-FileSize([string]$Path) { return "$([math]::Round((Get-Item $Path).Length / 1MB, 1)) MB" }

Write-Host ""
Write-Host "  +==================================================+" -ForegroundColor Green
Write-Host "  |  AuditCheck - Generador de instalador             |" -ForegroundColor Green
Write-Host "  |  Version: $Version   Python: $PythonVersion               |" -ForegroundColor Green
Write-Host "  +==================================================+" -ForegroundColor Green

# -- Paso 0: Prerequisitos (de la maquina de build, no del equipo destino) ----
Write-Step 0 8 "Verificando prerequisitos de la maquina de build..."

if (-not $SkipFrontend) {
    if (-not (Test-Cmd "node")) { Write-Error "Node.js no encontrado. Instala Node.js o usa -SkipFrontend con un frontend\dist ya compilado." }
    if (-not (Test-Cmd "npm"))  { Write-Error "npm no encontrado." }
    Write-Info "Node.js: $(node --version)"
}

$SEVEN_Z = @(
    "C:\Program Files\7-Zip\7z.exe",
    "C:\Program Files (x86)\7-Zip\7z.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $SEVEN_Z -and -not (Test-Path $MAKENSIS)) {
    Write-Error "7-Zip no encontrado. Instalalo desde https://7-zip.org (se usa una sola vez para extraer NSIS portable; a partir de ahi queda cacheado y ya no hace falta)."
}
Write-OK "Prerequisitos de build OK"

# -- Paso 1: Frontend React ----------------------------------------------------
Write-Step 1 8 "Compilando frontend React..."

if ($SkipFrontend) {
    Write-Warn "SkipFrontend activo - usando frontend\dist existente"
} else {
    Push-Location (Join-Path $ROOT "frontend")
    try {
        Write-Info "npm install..."
        npm.cmd install --silent | Out-Null
        Write-Info "npm run build..."
        npm.cmd run build | Out-Null
    } finally {
        Pop-Location
    }
}

$frontendDist = Join-Path $ROOT "frontend\dist"
if (-not (Test-Path $frontendDist)) { Write-Error "No existe frontend\dist\. El build del frontend fallo." }
Write-OK "Frontend compilado ($((Get-ChildItem $frontendDist -Recurse -File).Count) archivos)"

# -- Paso 2: Preparar directorio de payload ------------------------------------
Write-Step 2 8 "Preparando payload del instalador..."

New-Item -Path $OUTPUT_DIR -ItemType Directory -Force | Out-Null
New-Item -Path $CACHE_DIR  -ItemType Directory -Force | Out-Null
if (Test-Path $PAYLOAD_DIR) { Remove-Item -Recurse -Force $PAYLOAD_DIR }
New-Item -ItemType Directory -Path $PAYLOAD_DIR -Force | Out-Null
New-Item -ItemType Directory -Path "$PAYLOAD_DIR\assets\branding" -Force | Out-Null
Write-OK "Payload listo en Instalador_sfwr\.payload\"

# -- Paso 3: Python embebido (autocontenido, incluye vcruntime140.dll) --------
Write-Step 3 8 "Configurando Python $PythonVersion embebido..."

if (-not (Test-Path $PY_CACHE)) {
    Write-Info "Descargando python-${PythonVersion}-embed-amd64.zip ..."
    Invoke-WebRequest -Uri $PY_URL -OutFile $PY_CACHE -UseBasicParsing
} else {
    Write-Info "Usando Python embebido en cache: $PY_CACHE"
}

$PY_DIR = "$PAYLOAD_DIR\python"
Expand-Archive -Path $PY_CACHE -DestinationPath $PY_DIR -Force

if (-not (Test-Path "$PY_DIR\vcruntime140.dll")) {
    Write-Warn "El paquete embebido de Python no trae vcruntime140.dll junto a python.exe."
    Write-Warn "Revisa que la version $PythonVersion siga distribuyendolo asi (evita depender del VC++ Redistributable del equipo destino)."
} else {
    Write-Info "vcruntime140.dll incluido junto a python.exe (equipo destino no necesita Visual C++ instalado)"
}

# Habilitar site-packages en el Python embebido (el import esta comentado por defecto)
$pthFile = Get-ChildItem $PY_DIR -Filter "*._pth" | Select-Object -First 1
if (-not $pthFile) { Write-Error "No se encontro el archivo ._pth en el Python embebido." }
$pthContent = Get-Content $pthFile.FullName -Raw
if ($pthContent -match '#import site') {
    Set-Content $pthFile.FullName ($pthContent -replace '#import site', 'import site') -Encoding ASCII
    Write-Info "site-packages habilitado en $($pthFile.Name)"
}

if (-not (Test-Path $GETPIP_CACHE)) {
    Write-Info "Descargando get-pip.py..."
    Invoke-WebRequest -Uri $GETPIP_URL -OutFile $GETPIP_CACHE -UseBasicParsing
}
Write-Info "Instalando pip en Python embebido..."
& "$PY_DIR\python.exe" $GETPIP_CACHE --no-warn-script-location --quiet

Write-OK "Python $PythonVersion embebido configurado"

# -- Paso 4: Dependencias Python (incluye Pillow, usado por make_ico.py) ------
Write-Step 4 8 "Instalando dependencias Python (puede tardar unos minutos)..."

$REQ_FILE = Join-Path $ROOT "backend\requirements.txt"
& "$PY_DIR\python.exe" -m pip install --requirement $REQ_FILE --no-warn-script-location --quiet

if (-not (& "$PY_DIR\python.exe" -c "import PIL; print('ok')" 2>$null)) {
    Write-Error "Pillow no quedo instalado en el Python embebido; make_ico.py (generacion del icono de marca) no funcionaria en el equipo destino."
}

Write-OK "$((Get-ChildItem "$PY_DIR\Lib\site-packages" -Directory).Count) paquetes instalados en Lib\site-packages\"

# -- Paso 5: Copiar codigo fuente, assets y herramientas -----------------------
Write-Step 5 8 "Copiando codigo fuente, assets y herramientas..."

$appDir = "$PAYLOAD_DIR\app"
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
Copy-Item -Recurse -Path (Join-Path $ROOT "backend\app") -Destination "$appDir\backend\app"
"" | Set-Content "$appDir\backend\__init__.py" -Encoding UTF8

Copy-Item (Join-Path $ROOT "launcher.py") "$PAYLOAD_DIR\"
Copy-Item -Recurse -Path $frontendDist -Destination "$PAYLOAD_DIR\frontend_dist"

$assetsDir = Join-Path $ROOT "assets"
if (Test-Path $assetsDir) {
    Copy-Item -Recurse -Path "$assetsDir\*" -Destination "$PAYLOAD_DIR\assets\" -ErrorAction SilentlyContinue
}
$defaultIcon = Join-Path $ROOT "assets\branding\icon.ico"
if (-not (Test-Path $defaultIcon)) {
    Write-Error "Falta assets\branding\icon.ico (logo por defecto del icono del acceso directo)."
}

# Herramienta usada por el instalador para convertir el logo elegido a .ico
New-Item -ItemType Directory -Path "$PAYLOAD_DIR\tools" -Force | Out-Null
Copy-Item (Join-Path $INSTALLER_DIR "tools\make_ico.py") "$PAYLOAD_DIR\tools\make_ico.py"

Write-OK "Codigo fuente, assets y herramientas copiados"

# -- Paso 6: Scripts de lanzamiento + LEEME ------------------------------------
Write-Step 6 8 "Creando scripts de lanzamiento..."

$batContent = @'
@echo off
cd /d "%~dp0"
start "" "%~dp0python\python.exe" -W ignore "%~dp0launcher.py"
'@
Set-Content -Path "$PAYLOAD_DIR\AUDITCHECK.bat" -Value $batContent -Encoding ASCII

$batDebug = @'
@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AuditCheck
echo.
echo   AuditCheck iniciando...
echo   Navega a http://127.0.0.1:8000 (o al puerto configurado en la instalacion)
echo   Presiona Ctrl+C para detener.
echo.
"%~dp0python\python.exe" "%~dp0launcher.py"
echo.
echo   AuditCheck detenido.
pause
'@
Set-Content -Path "$PAYLOAD_DIR\AUDITCHECK_consola.bat" -Value $batDebug -Encoding ASCII

$readme = @"
AuditCheck v$Version
$(("=" * 40))

REQUISITOS DEL EQUIPO DONDE SE INSTALA
---------------------------------------
- Windows 10 o Windows 11 (64 bits)
- Nada mas. Python y sus dependencias van incluidos dentro del instalador;
  no hace falta instalar Python, Node.js ni Visual C++ por separado.
- No hacen falta permisos de administrador.
- No hace falta conexion a Internet para instalar ni para usar la aplicacion.

PRIMER USO
----------
1. Haz doble clic en el acceso directo de AuditCheck (escritorio o menu Inicio).
   El navegador se abrira automaticamente.

2. Como es la primera vez que arranca, pedira iniciar sesion con la cuenta de
   superadmin ya preconfigurada. Solicita esas credenciales a tu tecnico de
   soporte de AuditCheck (las genero al preparar este instalador). Cambia la
   contraseña desde Configuracion en cuanto inicies sesion.

MODO DEBUG (si el inicio falla)
---------------------------------
Ejecuta "AuditCheck (consola)" desde el menu Inicio para ver los mensajes de error.

DATOS Y COPIAS DE SEGURIDAD
----------------------------
La base de datos y configuracion se guardan en la carpeta "data" dentro
del directorio de instalacion. Para hacer una copia de seguridad, copia
esa carpeta completa.

DESINSTALAR
-----------
Desde "Agregar o quitar programas" de Windows, buscando "AuditCheck".
Se te preguntara si quieres conservar o borrar los datos.

REPOSITORIO
-----------
https://github.com/Edu-Estevez-Lemes/auditcheck
"@
Set-Content -Path "$PAYLOAD_DIR\LEEME.txt" -Value $readme -Encoding UTF8

Write-OK "Scripts de lanzamiento y LEEME creados"

# -- Paso 7: NSIS portable (herramienta de build, no viaja al equipo destino) -
Write-Step 7 8 "Preparando NSIS $NsisVersion..."

if (-not (Test-Path $MAKENSIS)) {
    if (-not (Test-Path $NSIS_CACHE)) {
        Write-Info "Descargando nsis-$NsisVersion-setup.exe ..."
        # SourceForge devuelve una pagina HTML intermedia (selector de espejo) al
        # User-Agent por defecto de Invoke-WebRequest; curl.exe (incluido en
        # Windows 10/11) sigue la redireccion real sin ese problema.
        if (-not (Test-Cmd "curl.exe")) { Write-Error "curl.exe no encontrado (deberia venir incluido en Windows 10/11)." }
        & curl.exe -sL -o $NSIS_CACHE $NSIS_URL
        if ($LASTEXITCODE -ne 0) { Write-Error "curl.exe fallo descargando NSIS (exit code $LASTEXITCODE)." }
    }
    $head = [System.IO.File]::ReadAllBytes($NSIS_CACHE) | Select-Object -First 2
    if (-not ($head[0] -eq 0x4D -and $head[1] -eq 0x5A)) {
        Remove-Item $NSIS_CACHE -Force
        Write-Error "La descarga de NSIS no es un ejecutable valido (posible pagina intermedia de SourceForge). Reintenta el build."
    }
    Write-Info "Extrayendo NSIS portable (el propio instalador de NSIS es un archivo que 7-Zip puede abrir sin ejecutarlo)..."
    if (-not $SEVEN_Z) { Write-Error "7-Zip no encontrado y no hay NSIS ya cacheado; hace falta 7-Zip para extraer NSIS la primera vez." }
    if (Test-Path $NSIS_DIR) { Remove-Item -Recurse -Force $NSIS_DIR }
    & $SEVEN_Z x $NSIS_CACHE "-o$NSIS_DIR" -y | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $MAKENSIS)) { Write-Error "No se pudo extraer makensis.exe del instalador de NSIS." }
    Write-OK "NSIS $NsisVersion listo en .build_cache\ (se reutiliza en builds futuros)"
} else {
    Write-Info "Usando NSIS en cache: $NSIS_DIR"
}

# -- Paso 8: Compilar el instalador con NSIS -----------------------------------
Write-Step 8 8 "Compilando el instalador (makensis)..."

# Superadmin predefinido: usuario/contraseña UNICOS para este build concreto
# (no un valor fijo compartido entre instalaciones). Se incrusta en el .exe
# via /D y el instalador lo deja como marcador que el backend consume una
# sola vez en el primer arranque (ver _seed_install_superadmin en
# backend/app/main.py). Queda registrado abajo en un TXT junto al .exe para
# que quien genera el instalador lo consulte; NO viaja al cliente aparte -
# solo dentro del .exe, y el propio cliente no lo ve en ningun momento del
# flujo normal de instalacion/arranque.
$SuperadminUser = "admin"
# Alfabeto sin comillas, barras ni '$'/'%': evita romper el literal NSIS, el
# JSON del marcador y la linea de comandos de makensis.
$SuperadminAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#-_=+'
$randomBytes = New-Object byte[] 20
# RNGCryptoServiceProvider, no RandomNumberGenerator::Fill (API de .NET Core
# que no existe en .NET Framework / Windows PowerShell 5.1).
$rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
$SuperadminPassword = -join ($randomBytes | ForEach-Object { $SuperadminAlphabet[$_ % $SuperadminAlphabet.Length] })

if (Test-Path $OUT_EXE) { Remove-Item $OUT_EXE -Force }

Push-Location $INSTALLER_DIR
try {
    & $MAKENSIS /V2 `
        "/DVERSION=$Version" `
        "/DPUBLISHER=$Publisher" `
        "/DDIST_DIR=$PAYLOAD_DIR" `
        "/DSUPERADMIN_USER=$SuperadminUser" `
        "/DSUPERADMIN_PASSWORD=$SuperadminPassword" `
        "installer.nsi"
    if ($LASTEXITCODE -ne 0) { Write-Error "makensis fallo (exit code $LASTEXITCODE)." }
} finally {
    Pop-Location
}

if (-not (Test-Path $OUT_EXE)) { Write-Error "makensis no genero $OUT_EXE." }

$CRED_FILE = Join-Path $OUTPUT_DIR "AuditCheck_v${Version}_SUPERADMIN.txt"
@"
AuditCheck v$Version - Credenciales de superadmin predefinido
$('=' * 60)

Validas UNICAMENTE para el instalador generado en este build:
$OUT_EXE

No reutilices este usuario/contraseña en otros paquetes ni se los des al
cliente. El cliente no los ve en ningun momento del flujo normal de
instalacion o primer arranque.

Usuario:     $SuperadminUser
Contraseña:  $SuperadminPassword

Uso: tras la instalacion en el equipo del cliente, conectate remotamente
(AnyDesk/RDP), inicia sesion con estas credenciales y crea ahi la cuenta
("admin" o "user", segun corresponda) que va a usar el cliente. Guarda
estas credenciales en vuestro gestor de contraseñas y borra este TXT.

Nota de seguridad: la contraseña queda incrustada en el propio .exe (quien
tenga el instalador y sepa inspeccionar el binario podria extraerla) y se
escribe brevemente en texto plano en el equipo destino durante la
instalacion, hasta que la aplicacion la consume en su primer arranque y
borra el marcador. No es un secreto criptografico fuerte: es una barrera
practica para que quien simplemente instala y arranca la app no obtenga
superadmin por su cuenta, no para resistir a alguien que analice el .exe.
"@ | Set-Content -Path $CRED_FILE -Encoding UTF8

Write-OK "Credenciales de superadmin: $CRED_FILE"
Write-Warn "Guardalas en vuestro gestor de contraseñas y borra ese TXT despues. No lo entregues al cliente."

if (-not $KeepPayloadDir) {
    Remove-Item -Recurse -Force $PAYLOAD_DIR
}

Write-OK "Instalador creado: $OUT_EXE ($(Get-FileSize $OUT_EXE))"

# -- Resumen -------------------------------------------------------------------
Write-Host ""
Write-Host "  ==================================================" -ForegroundColor Green
Write-Host "  Build completado correctamente" -ForegroundColor Green
Write-Host ""
Write-Host "  Instalador: $OUT_EXE" -ForegroundColor White
Write-Host "  Credenciales de superadmin: $CRED_FILE" -ForegroundColor White
Write-Host ""
Write-Host "  Este .exe es autocontenido: se puede copiar a cualquier" -ForegroundColor Gray
Write-Host "  equipo con Windows 10/11 de 64 bits y ejecutarse sin" -ForegroundColor Gray
Write-Host "  instalar nada mas antes." -ForegroundColor Gray
Write-Host "  ==================================================" -ForegroundColor Green
Write-Host ""
