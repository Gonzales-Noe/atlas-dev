@echo off
REM ATLAS Backend Setup Script for Windows
REM This script sets up the Django backend with PostgreSQL database

echo.
echo ========================================
echo   ATLAS Backend - Database Setup
echo ========================================
echo.

REM Check if .env exists
if exist .env (
    echo [OK] .env file already exists
) else (
    echo [INFO] Creating .env from .env.example...
    copy .env.example .env
    echo [OK] .env created - Please edit it with your database credentials
    pause
)

REM Select Python runtime
if exist .venv\Scripts\python.exe (
    set "PYTHON_CMD=.venv\Scripts\python.exe"
    set "PIP_CMD=.venv\Scripts\python.exe -m pip"
) else (
    where py >nul 2>nul
    if %errorlevel% neq 0 (
        set "PYTHON_CMD=python"
        set "PIP_CMD=pip"
    ) else (
        py -3.12 --version >nul 2>&1
        if %errorlevel% neq 0 (
            set "PYTHON_CMD=python"
            set "PIP_CMD=pip"
        ) else (
            echo [INFO] Creating virtual environment with Python 3.12...
            py -3.12 -m venv .venv
            set "PYTHON_CMD=.venv\Scripts\python.exe"
            set "PIP_CMD=.venv\Scripts\python.exe -m pip"
        )
    )
)

call %PYTHON_CMD% --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.12+ and add it to PATH.
    pause
    exit /b 1
)
echo [OK] Python found

REM Install requirements
echo.
echo [INFO] Installing Python packages...
call %PIP_CMD% install -q -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install requirements
    pause
    exit /b 1
)
echo [OK] Packages installed

REM Run migrations
echo.
echo [INFO] Running Django migrations...
call %PYTHON_CMD% manage.py migrate
if %errorlevel% neq 0 (
    echo [ERROR] Migrations failed. Check database credentials in .env
    pause
    exit /b 1
)
echo [OK] Migrations completed

REM Test database connection
echo.
echo [INFO] Testing database connection...
call %PYTHON_CMD% manage.py dbshell < nul
if %errorlevel% neq 0 (
    echo [WARNING] Could not verify database connection
) else (
    echo [OK] Database connection successful
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Start the server: python manage.py runserver
echo 2. Open Postman and create a request to http://localhost:8000/api/integrations/upload-rag-document/
echo 3. Upload a PDF or DOCX file with proper authentication
echo.
pause
