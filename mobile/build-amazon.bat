@echo off
<<<<<<< HEAD
echo Building Release...
cd android
call gradlew clean
call gradlew assembleRelease
if %errorlevel% neq 0 (
    echo Build failed!
    cd ..
    exit /b %errorlevel%
)
cd ..
echo Copying APK...
copy android\app\build\outputs\apk\release\app-release.apk app-release.apk
echo Build Complete.
=======
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
>>>>>>> 103d520eb5d4a39c7d419f2ad707fe2460c9f9e9
