@echo off
echo ========================================
echo Amazon Build - Uninstall and Install
echo ========================================
echo.
echo This script will:
echo 1. Uninstall any existing version of the app
echo 2. Install the fresh Amazon build (USDT/WalletConnect)
echo.
pause

echo.
echo [1/2] Uninstalling existing app...
adb uninstall com.anonymous.dungeoncrawler
if %ERRORLEVEL% EQU 0 (
    echo ✓ Uninstall successful
) else (
    echo ⚠ No existing app found or uninstall failed
)

echo.
echo [2/2] Installing Amazon build...
adb install -r "c:\dc\mobile\android\app\build\outputs\apk\amazon\release\app-amazon-release.apk"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ Installation successful!
    echo.
    echo Amazon flavor installed with:
    echo - USDT/WalletConnect payments
    echo - App icon enabled
    echo - IS_PLAY = false
    echo.
) else (
    echo.
    echo ✗ Installation failed!
    echo Make sure your device is connected via USB debugging
    echo.
)

pause
