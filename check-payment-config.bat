@echo off
echo Checking backend payment wallet configuration...
echo.

curl -s %1/api/payments/packs

echo.
echo.
echo If you see a wallet address above, it's configured!
echo If you see an error, the backend needs to be restarted.
pause
