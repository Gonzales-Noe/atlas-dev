@echo off
echo ========================================
echo ATLAS Project - ngrok Setup Helper
echo ========================================
echo.

REM Check if ngrok is installed
where ngrok >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] ngrok is not installed!
    echo.
    echo Please install ngrok first:
    echo 1. Download from: https://ngrok.com/download
    echo 2. Extract the zip file
    echo 3. Add ngrok.exe to your PATH
    echo 4. Or place ngrok.exe in this directory
    echo.
    pause
    exit /b 1
)

echo [OK] ngrok is installed
echo.

REM Check which services are running
echo Checking running services...
netstat -ano | findstr ":8000.*LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Backend (Django) is running on port 8000
    set BACKEND_RUNNING=1
) else (
    echo [X] Backend (Django) is NOT running on port 8000
    set BACKEND_RUNNING=0
)

netstat -ano | findstr ":5173.*LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Frontend (Vite) is running on port 5173
    set FRONTEND_RUNNING=1
) else (
    echo [X] Frontend (Vite) is NOT running on port 5173
    set FRONTEND_RUNNING=0
)

echo.
echo ========================================
echo Select service to expose with ngrok:
echo ========================================
echo.

if %BACKEND_RUNNING%==1 (
    echo 1. Backend (Django) - Port 8000
)
if %FRONTEND_RUNNING%==1 (
    echo 2. Frontend (Vite) - Port 5173
)
if %BACKEND_RUNNING%==0 if %FRONTEND_RUNNING%==0 (
    echo [ERROR] No services are running!
    echo.
    echo Please start at least one service first:
    echo - Backend: docker-compose up backend
    echo - Frontend: cd frontend ^& npm run dev
    echo.
    pause
    exit /b 1
)
echo.
set /p choice="Enter your choice (1 or 2): "

if "%choice%"=="1" (
    echo.
    echo Starting ngrok tunnel for Backend (port 8000)...
    echo Your ngrok link will appear below:
    echo.
    ngrok http 127.0.0.1:8000
) else if "%choice%"=="2" (
    echo.
    echo Starting ngrok tunnel for Frontend (port 5173)...
    echo Your ngrok link will appear below:
    echo.
    ngrok http 127.0.0.1:5173
) else (
    echo Invalid choice!
    pause
    exit /b 1
)