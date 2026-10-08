@echo off
title Fraud Detection System - Service Launcher

echo ====================================================================
echo             Starting Fraud Detection System Services
echo ====================================================================
echo.

:: Ensure current working directory is the project root
cd /d "%~dp0"

:: 1. Start Node.js Backend Server (Port 5000)
echo [1/3] Starting Backend Server (Port 5000)...
start "Backend Server (Port 5000)" /D "%~dp0backend" cmd /k "npm run dev"

:: 2. Start FastAPI ML Model Service (Port 8000)
echo [2/3] Starting ML Model Service (Port 8000)...
start "ML Model Service (Port 8000)" /D "%~dp0model" cmd /k "call venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

:: 3. Reverse ADB port and launch React Native Android app
echo [3/3] Setting up ADB port reverse and starting React Native Android...
adb reverse tcp:5000 tcp:5000 2>nul
start "React Native (Android)" /D "%~dp0MyApp" cmd /k "adb reverse tcp:5000 tcp:5000 & npx react-native run-android"

echo.
echo ====================================================================
echo All 3 services have been launched in separate terminal windows:
echo   1. Backend Server:   http://localhost:5000 (Node / Express)
echo   2. ML Model API:     http://localhost:8000 (FastAPI / Uvicorn)
echo   3. React Native App: Android build and Metro Bundler (MyApp)
echo.
echo Note: Each service window remains open so you can view live logs.
echo ====================================================================
echo.
pause
