@echo off
echo Checking backend version via Guest Auth...
echo.
curl -X POST https://x1yi7ab2wchx3j-8000.proxy.runpod.net/api/auth/guest -H "Content-Type: application/json" -d "{}"
echo.
pause
