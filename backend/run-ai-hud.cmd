@echo off
setlocal

set SCRIPT_DIR=%~dp0
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT_DIR%ai-server-hud.ps1"

endlocal
