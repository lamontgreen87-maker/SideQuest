@echo off
set "LOG_DIR=C:\ProgramData\SideQuest"
set "LOG_FILE=%LOG_DIR%\run-ai-server.log"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
cd /d "C:\Users\Lamont\Desktop\dungeon crawler\backend"
echo [%date% %time%] starting > "%LOG_FILE%"
"C:\Users\Lamont\Desktop\dungeon crawler\backend\venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 >> "%LOG_FILE%" 2>&1
