@echo off
setlocal

set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run-ai-server.ps1" -BindHost 0.0.0.0
exit /b 0

endlocal

