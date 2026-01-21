@echo off
echo ========================================
echo Building Mobile App (Play Flavor)
echo ========================================
echo.

cd mobile\android
call gradlew assemblePlayRelease

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo Build successful! Copying APK to root...
copy app\build\outputs\apk\play\release\app-play-release.apk ..\..\app-play-release.apk

echo.
echo ========================================
echo SUCCESS!
echo APK location: c:\dc\app-play-release.apk
echo ========================================
echo.
pause
