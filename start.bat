@echo off
title AUDITCHECK - Iniciando...
echo.
echo  =====================================
echo   AUDITCHECK v1.0
echo   Plataforma de Auditoria Tecnica MSP
echo  =====================================
echo.

REM Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no encontrado. Instala Python 3.11+
    pause
    exit /b 1
)

REM Crear entorno virtual si no existe
if not exist "backend\venv" (
    echo [INFO] Creando entorno virtual Python...
    python -m venv backend\venv
)

REM Activar entorno virtual e instalar dependencias
echo [INFO] Activando entorno virtual...
call backend\venv\Scripts\activate.bat

echo [INFO] Verificando dependencias...
pip install -r backend\requirements.txt -q --no-warn-script-location

REM Crear .env si no existe
if not exist ".env" (
    echo [INFO] Creando archivo .env desde plantilla...
    copy .env.example .env >nul
    echo [AVISO] Edita .env y cambia SECRET_KEY por una clave segura
)

REM Crear directorios necesarios
if not exist "data" mkdir data
if not exist "assets\branding" mkdir assets\branding
if not exist "data\clients" mkdir data\clients
if not exist "data\audits" mkdir data\audits

echo.
echo [INFO] Iniciando backend en http://127.0.0.1:8000
echo [INFO] Accede a la aplicacion en http://127.0.0.1:8000
echo.
echo  Credenciales iniciales:
echo   Usuario: admin
echo   Password: AuditCheck2024!
echo.
echo  IMPORTANTE: Cambia la contrasena en Configuracion - Mi Perfil
echo.
echo  Para subir el logo corporativo:
echo   1. Copia logo.png e icon.png a assets\branding\
echo   2. O usa Configuracion - Identidad Visual en la aplicacion
echo.
echo  Presiona Ctrl+C para detener el servidor
echo  ======================================
echo.

cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

pause
