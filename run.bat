@echo off
title VSBEC Academic Task Management System
color 0A

echo =================================================
echo    VSBEC Academic Task Management System
echo =================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo [ACTION] Please install Node.js from https://nodejs.org/
    pause
    exit /b
)

:: Check for .env file
if not exist ".env" (
    echo [INFO] .env file not found. Creating from template...
    copy .env.example .env >nul
)

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Installing dependencies. This may take a minute...
    call npm install
)

echo [INFO] Starting the development server...
echo [INFO] Local URL: http://localhost:3000
echo.

:: Run the dev server
call npm run dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] The server failed to start.
    echo.
    echo Troubleshooting Steps:
    echo 1. Close any other terminal windows.
    echo 2. Run 'npm install' manually.
    echo 3. If port is in use, check task manager for 'node.exe'.
)

echo.
echo Press any key to exit...
pause >nul
