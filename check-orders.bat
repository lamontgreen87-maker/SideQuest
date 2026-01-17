@echo off
echo Checking pending payment orders...
echo.

curl -s https://sidequestai.org/api/payments/orders/pending

echo.
pause
