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
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed. Check your internet connection.
        pause
        exit /b
    )
)

:: Kill any existing process on port 3000 to avoid EADDRINUSE
echo [INFO] Checking for existing server on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING" 2^>nul') do (
    echo [INFO] Killing existing process %%a on port 3000...
    taskkill /PID %%a /F >nul 2>nul
)

echo.
echo [INFO] Starting the development server...
echo [INFO] Once started, open your browser at: http://localhost:3000
echo [INFO] Press Ctrl+C to stop the server.
echo.

:: Run the dev server
call npm run dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] The server failed to start.
    echo.
    echo Troubleshooting Steps:
    echo 1. Make sure MongoDB is accessible (check your .env MONGODB_URI).
    echo 2. Run 'npm install' manually in this folder.
    echo 3. If port is in use, open Task Manager and end 'node.exe'.
    echo.
)

echo.
pause
