@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

call "%~dp0deploy\load-deploy-env.bat" "%~dp0"

where ssh >nul 2>&1
if errorlevel 1 (
  echo Ustanovite OpenSSH Client v Windows
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Nuzhen Node.js
  pause
  exit /b 1
)

echo.
echo ========================================
echo   Yandex .env - na VPS iz lokalnogo .env
echo   %SSH_TARGET%
echo ========================================
echo   Ne trogaet TELEGRAM_BOT_TOKEN na servere
echo.

node "%~dp0scripts\sync-yandex-env-to-vps.js"
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
set /p "restart=Perезапустить pm2 na servere? (y/n): "
if /i "%restart%"=="y" (
  ssh %SSH_OPTS% %SSH_TARGET% "cd %REMOTE% && pm2 restart zona-bot"
)

echo.
pause
