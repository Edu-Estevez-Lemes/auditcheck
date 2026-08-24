@echo off
setlocal enabledelayedexpansion
title AUDITCHECK - Modo Desarrollo
chcp 65001 >nul 2>&1

echo.
echo  =============================================
echo   AUDITCHECK - Modo Desarrollo
echo   Backend  ^>  http://127.0.0.1:8000
echo   Frontend ^>  http://localhost:5173
echo  =============================================
echo.

REM ─────────────────────────────────────────────
REM  1. PYTHON
REM ─────────────────────────────────────────────
echo  [1/6] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Python no encontrado en PATH.
    echo  Instala Python 3.11+ desde https://www.python.org/downloads/
    echo  Marca "Add Python to PATH" durante la instalacion.
    echo.
    pause & exit /b 1
)
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
for /f "tokens=1,2 delims=." %%a in ("!PYVER!") do (set PYMAJ=%%a & set PYMIN=%%b)
if !PYMAJ! LSS 3 goto :python_old
if !PYMAJ! EQU 3 if !PYMIN! LSS 11 goto :python_old
echo  [OK] Python !PYVER!
goto :check_node

:python_old
echo.
echo  [ERROR] Python !PYVER! detectado. Se requiere Python 3.11 o superior.
echo  Descarga la version actualizada desde https://www.python.org/downloads/
echo.
pause & exit /b 1

REM ─────────────────────────────────────────────
REM  2. NODE.JS
REM ─────────────────────────────────────────────
:check_node
echo  [2/6] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js no encontrado en PATH.
    echo  Instala Node.js 18+ desde https://nodejs.org/
    echo.
    pause & exit /b 1
)
for /f %%v in ('node --version 2^>^&1') do set NODEVER=%%v
echo  [OK] Node.js !NODEVER!

REM ─────────────────────────────────────────────
REM  3. ENTORNO VIRTUAL PYTHON
REM ─────────────────────────────────────────────
echo  [3/6] Verificando entorno virtual Python...
if not exist "backend\.venv\Scripts\python.exe" (
    echo  [INFO] Creando entorno virtual en backend\.venv ...
    python -m venv backend\.venv
    if errorlevel 1 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        echo  Comprueba que Python esta correctamente instalado.
        pause & exit /b 1
    )
    echo  [OK] Entorno virtual creado.
) else (
    echo  [OK] Entorno virtual existente.
)

REM ─────────────────────────────────────────────
REM  4. DEPENDENCIAS PYTHON
REM ─────────────────────────────────────────────
echo  [4/6] Verificando dependencias Python...
backend\.venv\Scripts\python.exe -c "import uvicorn, fastapi, sqlalchemy, alembic, pydantic, cryptography" >nul 2>&1
if errorlevel 1 (
    echo  [INFO] Instalando dependencias backend, puede tardar unos minutos...
    backend\.venv\Scripts\pip.exe install -r backend\requirements.txt -q --no-warn-script-location
    if errorlevel 1 (
        echo.
        echo  [ERROR] Fallo al instalar dependencias Python.
        echo  Comprueba tu conexion a internet y el archivo backend\requirements.txt
        echo.
        pause & exit /b 1
    )
    echo  [OK] Dependencias backend instaladas.
) else (
    echo  [OK] Dependencias Python presentes.
)

REM ─────────────────────────────────────────────
REM  5. DEPENDENCIAS FRONTEND
REM ─────────────────────────────────────────────
echo  [5/6] Verificando dependencias frontend...
if not exist "frontend\node_modules\vite" (
    echo  [INFO] Instalando dependencias frontend, puede tardar unos minutos...
    cd frontend
    npm install --silent
    if errorlevel 1 (
        echo  [ERROR] Fallo al instalar dependencias npm.
        cd ..
        pause & exit /b 1
    )
    cd ..
    echo  [OK] Dependencias frontend instaladas.
) else (
    echo  [OK] Dependencias frontend presentes.
)

REM ─────────────────────────────────────────────
REM  6. CONFIGURACION Y DIRECTORIOS
REM ─────────────────────────────────────────────
echo  [6/6] Verificando configuracion...
if not exist ".env" (
    if not exist ".env.example" (
        echo  [ERROR] No se encuentra .env ni .env.example.
        echo  Asegurate de clonar el repositorio completo.
        pause & exit /b 1
    )
    copy .env.example .env >nul
    echo  [AVISO] Creado .env desde plantilla. Edita SECRET_KEY para produccion.
) else (
    echo  [OK] Archivo .env presente.
)
if not exist "data"            mkdir data
if not exist "assets\branding" mkdir assets\branding 2>nul
if not exist "data\clients"    mkdir data\clients 2>nul
if not exist "data\audits"     mkdir data\audits 2>nul
echo  [OK] Directorios de datos listos.

REM ─────────────────────────────────────────────
REM  ARRANCAR SERVICIOS
REM ─────────────────────────────────────────────
echo.
echo  =============================================
echo   Todo listo. Arrancando servicios...
echo  =============================================
echo.
echo   Backend   ^>  http://127.0.0.1:8000
echo   Frontend  ^>  http://localhost:5173
echo   API Docs  ^>  http://127.0.0.1:8000/docs
echo.
echo   Credenciales iniciales:
echo     Usuario:  admin
echo     Password: AuditCheck2024!
echo   (Cambiala en Configuracion ^> Mi Perfil)
echo  =============================================
echo.

start "AUDITCHECK Backend" cmd /k "cd /d %~dp0backend && .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 4 /nobreak >nul

start "AUDITCHECK Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 5 /nobreak >nul
start http://localhost:5173

echo  Servicios arrancados en ventanas independientes.
echo  Cierra esas ventanas para detenerlos.
echo.
pause
