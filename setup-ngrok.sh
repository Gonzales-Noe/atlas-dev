#!/bin/bash

echo "========================================"
echo "ATLAS Project - ngrok Setup Helper"
echo "========================================"
echo.

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "[ERROR] ngrok is not installed!"
    echo.
    echo "Please install ngrok first:"
    echo "1. Download from: https://ngrok.com/download"
    echo "2. Extract the zip file"
    echo "3. Add ngrok to your PATH"
    echo.
    read -p "Press Enter to exit..."
    exit 1
fi

echo "[OK] ngrok is installed"
echo.

# Check which services are running
echo "Checking running services..."

if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[OK] Backend (Django) is running on port 8000"
    BACKEND_RUNNING=1
else
    echo "[X] Backend (Django) is NOT running on port 8000"
    BACKEND_RUNNING=0
fi

if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[OK] Frontend (Vite) is running on port 5173"
    FRONTEND_RUNNING=1
else
    echo "[X] Frontend (Vite) is NOT running on port 5173"
    FRONTEND_RUNNING=0
fi

echo.
echo "========================================"
echo "Select service to expose with ngrok:"
echo "========================================"
echo.

if [ $BACKEND_RUNNING -eq 1 ]; then
    echo "1. Backend (Django) - Port 8000"
fi
if [ $FRONTEND_RUNNING -eq 1 ]; then
    echo "2. Frontend (Vite) - Port 5173"
fi
if [ $BACKEND_RUNNING -eq 0 ] && [ $FRONTEND_RUNNING -eq 0 ]; then
    echo "[ERROR] No services are running!"
    echo.
    echo "Please start at least one service first:"
    echo "- Backend: docker-compose up backend"
    echo "- Frontend: cd frontend && npm run dev"
    echo.
    read -p "Press Enter to exit..."
    exit 1
fi

echo.
read -p "Enter your choice (1 or 2): " choice

if [ "$choice" == "1" ]; then
    echo.
    echo "Starting ngrok tunnel for Backend (port 8000)..."
    echo "Your ngrok link will appear below:"
    echo.
    ngrok http 127.0.0.1:8000
elif [ "$choice" == "2" ]; then
    echo.
    echo "Starting ngrok tunnel for Frontend (port 5173)..."
    echo "Your ngrok link will appear below:"
    echo.
    ngrok http 127.0.0.1:5173
else
    echo "Invalid choice!"
    read -p "Press Enter to exit..."
    exit 1
fi