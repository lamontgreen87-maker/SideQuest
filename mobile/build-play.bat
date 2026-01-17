@echo off
echo Building Play Store flavor (with Google Play IAP)...
cd android
call gradlew assemblePlayRelease
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ Build successful!
    echo APK location: android\app\build\outputs\apk\play\release\
    echo.
) else (
    echo.
    echo ✗ Build failed!
    echo.
)
pause
