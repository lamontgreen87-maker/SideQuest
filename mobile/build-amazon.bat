@echo off
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
