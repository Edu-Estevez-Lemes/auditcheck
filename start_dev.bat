@echo off
title AUDITCHECK - Modo Desarrollo
echo.
echo  AUDITCHECK - Modo Desarrollo (Backend + Frontend)
echo  ---------------------------------------------------

REM Backend en nueva ventana
start "AUDITCHECK Backend" cmd /k "cd /d %~dp0backend && ..\backend\venv\Scripts\activate && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

REM Esperar que el backend arranque
timeout /t 3 /nobreak >nul

REM Frontend
if exist "frontend\node_modules" (
    echo [INFO] Iniciando frontend React en http://localhost:5173
    start "AUDITCHECK Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
    timeout /t 3 /nobreak >nul
    start http://localhost:5173
) else (
    echo [INFO] Instalando dependencias frontend (primera vez)...
    cd frontend
    npm install
    start "AUDITCHECK Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
    timeout /t 5 /nobreak >nul
    start http://localhost:5173
    cd ..
)

echo.
echo  Backend:  http://127.0.0.1:8000
echo  Frontend: http://localhost:5173
echo  API Docs: http://127.0.0.1:8000/docs
echo.
