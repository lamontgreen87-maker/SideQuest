@echo off
echo ===========================================
echo NUCLEAR CLEAN AND BUILD (Play/Standard Flavor)
echo ===========================================

echo [1/3] Deep Cleaning Caches...
if exist android\app\build rmdir /s /q android\app\build
if exist android\.gradle rmdir /s /q android\.gradle
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo Cleaning Metro Temp Cache...
del /q %TMP%\metro-* 2>nul
del /q %TEMP%\haste-map-* 2>nul
del /q %TEMP%\react-* 2>nul

echo.
echo [2/3] Gradle Clean & Build...
if exist app-release.apk del app-release.apk
cd android
call gradlew clean
call gradlew assemblePlayRelease
if %errorlevel% neq 0 (
    echo Build failed!
    cd ..
    exit /b %errorlevel%
)
cd ..

echo.
echo [3/3] Copying Fresh APK...
if exist android\app\build\outputs\apk\play\release\app-play-release.apk (
    copy android\app\build\outputs\apk\play\release\app-play-release.apk app-release.apk
    echo Build Success!
) else (
    echo Error: APK output not found at play/release path!
    exit /b 1
)
echo Build Complete.
