@echo off
echo ========================================
echo Crash Log Capture
echo ========================================
echo.
echo Instructions:
echo 1. This window will start capturing logs
echo 2. Open the app on your phone
echo 3. Tap "Connect Wallet"
echo 4. When it crashes, press Ctrl+C here
echo 5. Logs will be saved to crash_log.txt
echo.
pause

echo Starting log capture...
echo Press Ctrl+C when the app crashes
echo.

adb logcat -v time *:E ReactNativeJS:V > crash_log.txt

echo.
echo Logs saved to crash_log.txt
pause
