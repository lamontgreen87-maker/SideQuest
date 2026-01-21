@echo off
echo ========================================
echo Standard/Play Build - Uninstall and Install
echo ========================================
echo.
echo [1/2] Cleaning up old versions...
adb uninstall com.anonymous.dungeoncrawler
adb uninstall com.anonymous.dungeoncrawler.play

echo.
echo [2/2] Installing new build...
if exist app-release.apk (
    adb install -r app-release.apk
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ✓ Installation successful!
        echo.
        echo Launching...
        adb shell monkey -p com.anonymous.dungeoncrawler.play -c android.intent.category.LAUNCHER 1
    ) else (
        echo.
        echo ✗ Installation failed!
    )
) else (
    echo.
    echo ✗ app-release.apk not found!
    echo Run build-amazon.bat first.
)
pause
