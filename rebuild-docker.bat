@echo off
echo ========================================
echo Rebuild and Push Docker Image
echo ========================================
echo.
echo This will:
echo 1. Build Docker image with payment wallet config
echo 2. Push to Docker Hub
echo 3. RunPod will auto-update on next restart
echo.
pause

echo.
echo [1/2] Building Docker image...
docker build -t lamonster87/dungeoncrawler-backend:latest .

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Docker build failed!
    pause
    exit /b 1
)

echo.
echo [2/2] Pushing to Docker Hub...
docker push lamonster87/dungeoncrawler-backend:latest

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Docker push failed!
    echo Make sure you're logged in: docker login
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS!
echo ========================================
echo.
echo Docker image updated with payment wallet config.
echo.
echo Next: Restart your RunPod instance to use the new image.
echo.
pause
