@echo off
setlocal enabledelayedexpansion
title AUDITCHECK - Iniciando...
chcp 65001 >nul 2>&1

echo.
echo  =============================================
echo   AUDITCHECK v1.0
echo   Plataforma de Auditoria Tecnica MSP
echo  =============================================
echo.

REM ─────────────────────────────────────────────
REM  1. PYTHON
REM ─────────────────────────────────────────────
echo  [1/5] Verificando Python...
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
goto :check_venv

:python_old
echo.
echo  [ERROR] Python !PYVER! detectado. Se requiere Python 3.11 o superior.
echo.
pause & exit /b 1

REM ─────────────────────────────────────────────
REM  2. ENTORNO VIRTUAL
REM ─────────────────────────────────────────────
:check_venv
echo  [2/5] Verificando entorno virtual Python...
if not exist "backend\.venv\Scripts\python.exe" (
    echo  [INFO] Creando entorno virtual en backend\.venv ...
    python -m venv backend\.venv
    if errorlevel 1 (
        echo  [ERROR] No se pudo crear el entorno virtual.
        pause & exit /b 1
    )
    echo  [OK] Entorno virtual creado.
) else (
    echo  [OK] Entorno virtual existente.
)

REM ─────────────────────────────────────────────
REM  3. DEPENDENCIAS PYTHON
REM ─────────────────────────────────────────────
echo  [3/5] Verificando dependencias Python...
backend\.venv\Scripts\python.exe -c "import uvicorn, fastapi, sqlalchemy, alembic, pydantic, cryptography" >nul 2>&1
if errorlevel 1 (
    echo  [INFO] Instalando dependencias (puede tardar unos minutos)...
    backend\.venv\Scripts\pip.exe install -r backend\requirements.txt -q --no-warn-script-location
    if errorlevel 1 (
        echo.
        echo  [ERROR] Fallo al instalar dependencias Python.
        echo  Comprueba tu conexion a internet y el archivo backend\requirements.txt
        echo.
        pause & exit /b 1
    )
    echo  [OK] Dependencias instaladas.
) else (
    echo  [OK] Dependencias Python presentes.
)

REM ─────────────────────────────────────────────
REM  4. CONFIGURACION Y DIRECTORIOS
REM ─────────────────────────────────────────────
echo  [4/5] Verificando configuracion...
if not exist ".env" (
    if not exist ".env.example" (
        echo  [ERROR] No se encuentra .env ni .env.example.
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
REM  5. BASE DE DATOS
REM ─────────────────────────────────────────────
echo  [5/5] Verificando base de datos...
cd backend
.\.venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'.');  from app.database import engine; from app.models import Base; Base.metadata.create_all(bind=engine)" >nul 2>&1
if errorlevel 1 (
    echo  [AVISO] No se pudo pre-verificar la BD. El servidor lo reintentara al arrancar.
) else (
    echo  [OK] Base de datos accesible.
)
cd ..

REM ─────────────────────────────────────────────
REM  ARRANCAR SERVIDOR
REM ─────────────────────────────────────────────
echo.
echo  =============================================
echo   Iniciando servidor en http://127.0.0.1:8000
echo.
echo   Credenciales iniciales:
echo     Usuario:  admin
echo     Password: AuditCheck2024!
echo   (Cambiala en Configuracion ^> Mi Perfil)
echo.
echo   Para subir logo corporativo:
echo     Copia logo.png e icon.png a assets\branding\
echo     O usa Configuracion ^> Identidad Visual
echo.
echo   Presiona Ctrl+C para detener
echo  =============================================
echo.

cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload

pause
