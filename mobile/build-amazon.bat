@echo off
echo Building Amazon flavor (with USDT/WalletConnect)...
cd android
call gradlew assembleAmazonRelease
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ Build successful!
    echo APK location: android\app\build\outputs\apk\amazon\release\
    echo.
) else (
    echo.
    echo ✗ Build failed!
    echo.
)
pause
