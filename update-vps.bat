@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

call "%~dp0deploy\load-deploy-env.bat" "%~dp0"
set "LOCAL=%ROOT%release\zonadeck-deploy"

if /i "%~1"=="quick" goto quick_update
if /i "%~1"=="upload" goto upload_only
if /i "%~1"=="restart" goto restart_only
goto menu

REM --- podprogrammy (do menu, chtoby call :label rabotal) ---
:check_ssh
where scp >nul 2>&1
if errorlevel 1 (
  echo Ustanovite OpenSSH Client v Windows
  pause
  exit /b 1
)
exit /b 0

:scp_one
echo   - %~1
scp %SSH_OPTS% -r "%LOCAL%\%~1" %SSH_TARGET%:%REMOTE%/
if errorlevel 1 exit /b 1
exit /b 0

:upload_data_files
echo   - data/basketball-birthdays.json
ssh %SSH_OPTS% %SSH_TARGET% "mkdir -p %REMOTE%/data"
set "BDAY_SRC=%LOCAL%\data\basketball-birthdays.json"
if not exist "%BDAY_SRC%" set "BDAY_SRC=%ROOT%data\basketball-birthdays.json"
if not exist "%BDAY_SRC%" (
  echo     basketball-birthdays.json ne nayden lokalno
  exit /b 1
)
scp %SSH_OPTS% "%BDAY_SRC%" %SSH_TARGET%:%REMOTE%/data/basketball-birthdays.json
if errorlevel 1 exit /b 1
exit /b 0

:upload_code
ssh %SSH_OPTS% %SSH_TARGET% "mkdir -p %REMOTE%/deploy/vps"
call :scp_one bot
if errorlevel 1 exit /b 1
call :scp_one services
if errorlevel 1 exit /b 1
call :scp_one ai
if errorlevel 1 exit /b 1
call :scp_one scripts
if errorlevel 1 exit /b 1
call :scp_one deploy
if errorlevel 1 exit /b 1
scp %SSH_OPTS% "%LOCAL%\package.json" %SSH_TARGET%:%REMOTE%/
if errorlevel 1 exit /b 1
scp %SSH_OPTS% "%LOCAL%\package-lock.json" %SSH_TARGET%:%REMOTE%/
if errorlevel 1 exit /b 1
scp %SSH_OPTS% "%LOCAL%\ecosystem.config.cjs" %SSH_TARGET%:%REMOTE%/
if errorlevel 1 exit /b 1
call :upload_data_files
if errorlevel 1 exit /b 1
exit /b 0

REM --- menyu i scenarii ---
:menu
cls
echo.
echo ========================================
echo   ZonaDeck - OBNOVLENIE na VPS
echo   %SSH_TARGET%:%REMOTE%
if defined VPS_SSH_KEY echo   Key: %VPS_SSH_KEY%
echo ========================================
echo   1 - BYSTRO: sborka + zalivka + pm2 restart
echo   2 - Tolko sborka (build-prod)
echo   3 - Tolko zalivka koda (bez .env i data)
echo   4 - Tolko pm2 restart na servere
echo   5 - Zagruzka + restart (bez sborki)
echo   0 - Vyhod
echo ========================================
echo .env na servere NE perezapisyvaetsya
echo.
set /p "choice=Vyberite: "

if "%choice%"=="1" goto quick_update
if "%choice%"=="2" goto build_only
if "%choice%"=="3" goto upload_only
if "%choice%"=="4" goto restart_only
if "%choice%"=="5" goto upload_restart
if "%choice%"=="0" exit /b 0
goto menu

:quick_update
echo.
echo === [1/4] Sborka ===
call "%ROOT%build-prod.bat" silent
if errorlevel 1 (
  echo Oshibka sborki
  pause
  exit /b 1
)
goto do_upload

:build_only
call "%ROOT%build-prod.bat" silent
pause
goto menu

:upload_only
if not exist "%LOCAL%\bot\index.js" (
  echo Net sborki. Snachala punkt 1 ili 2.
  pause
  goto menu
)
goto do_upload

:upload_restart
if not exist "%LOCAL%\bot\index.js" (
  echo Net papki release\zonadeck-deploy
  pause
  goto menu
)
goto do_upload

:do_upload
call :check_ssh
if errorlevel 1 exit /b 1
echo.
echo === [2/4] Zagruzka koda na server ===
call :upload_code
if errorlevel 1 (
  echo Oshibka zagruzki
  pause
  exit /b 1
)
echo.
echo === [3/4] npm ci na servere ===
ssh %SSH_OPTS% %SSH_TARGET% "cd %REMOTE% && npm ci --omit=dev"
if errorlevel 1 (
  echo Oshibka npm ci
  pause
  exit /b 1
)
goto do_restart

:restart_only
call :check_ssh
if errorlevel 1 exit /b 1
goto do_restart

:do_restart
echo.
echo === [4/4] pm2 restart ===
ssh %SSH_OPTS% %SSH_TARGET% "cd %REMOTE% && (pm2 restart zona-bot 2>/dev/null || (npm install -g pm2 2>/dev/null; ./deploy/vps/start.sh))"
if errorlevel 1 (
  echo Oshibka restart. Proverite: ssh %SSH_OPTS% %SSH_TARGET% "pm2 logs zona-bot"
  pause
  exit /b 1
)
echo.
echo === Gotovo! Proverte bota v Telegram ===
echo   ssh %SSH_OPTS% %SSH_TARGET% "pm2 logs zona-bot --lines 20"
echo.
if /i "%~1"=="quick" exit /b 0
pause
goto menu
