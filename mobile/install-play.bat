@echo off
echo ========================================
echo Play Build - Uninstall and Install
echo ========================================
echo.
echo This script will:
echo 1. Uninstall any existing version of the app
echo 2. Install the fresh Play build (Google Play IAP)
echo.
pause

echo.
echo [1/2] Uninstalling existing app...
adb uninstall com.anonymous.dungeoncrawler.play
if %ERRORLEVEL% EQU 0 (
    echo ✓ Uninstall successful
) else (
    echo ⚠ No existing app found or uninstall failed
)

echo.
echo [2/2] Installing Play build...
adb install -r android\app\build\outputs\apk\play\release\app-play-release.apk
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ Installation successful!
    echo.
    echo Play flavor installed with:
    echo - Google Play IAP
    echo - No app icon (as designed)
    echo - IS_PLAY = true
    echo.
) else (
    echo.
    echo ✗ Installation failed!
    echo Make sure your device is connected via USB debugging
    echo.
)

pause
