@echo off
echo Building both Play and Amazon flavors...
cd android
call gradlew assembleRelease
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ Build successful!
    echo Play APK: android\app\build\outputs\apk\play\release\
    echo Amazon APK: android\app\build\outputs\apk\amazon\release\
    echo.
) else (
    echo.
    echo ✗ Build failed!
    echo.
)
pause
