@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

call "%~dp0deploy\load-deploy-env.bat" "%~dp0"
set "LOCAL=%~dp0release\zonadeck-deploy"
set "ZIP=%~dp0release\zonadeck-deploy.zip"

if not exist "%LOCAL%\bot\index.js" (
  echo Snachala: build-prod.bat ^(punkt 1 ili 2^)
  pause
  exit /b 1
)

where scp >nul 2>&1
if errorlevel 1 (
  echo Ustanovite OpenSSH Client v Windows
  echo Parametry: Settings - Apps - Optional features - OpenSSH Client
  pause
  exit /b 1
)

echo.
echo ========================================
echo   Zagruzka na VPS
echo   %SSH_TARGET%:%REMOTE%
echo ========================================
echo   1 - Polnaya papka ^(scp, ostorozhno s .env^)
echo   2 - ZIP
echo   3 - Bystroe obnovlenie ^(update-vps.bat^)
echo   0 - Vyhod
echo ========================================
echo Parol vvodite v konsoli - v fayly NE sohranyaetsya
echo.
set /p "choice=Vyberite: "

if "%choice%"=="0" exit /b 0
if "%choice%"=="1" goto upload_dir
if "%choice%"=="2" goto upload_zip
if "%choice%"=="3" goto update
goto :eof

:update
call "%~dp0update-vps.bat"
goto :eof

:upload_dir
echo Sozdanie papki na servere...
ssh %SSH_OPTS% %SSH_TARGET% "mkdir -p %REMOTE%"
echo Zagruzka faylov...
scp %SSH_OPTS% -r "%LOCAL%\*" %SSH_TARGET%:%REMOTE%/
if errorlevel 1 (
  echo Oshibka scp
  pause
  exit /b 1
)
goto done

:upload_zip
if not exist "%ZIP%" (
  echo Net ZIP - build-prod.bat punkt 2
  pause
  exit /b 1
)
scp %SSH_OPTS% "%ZIP%" %SSH_TARGET%:/root/zonadeck-deploy.zip
if errorlevel 1 goto scp_fail
echo Raspakovka na servere...
ssh %SSH_OPTS% %SSH_TARGET% "mkdir -p %REMOTE% && unzip -o /root/zonadeck-deploy.zip -d %REMOTE%"
if errorlevel 1 (
  echo Esli net unzip: apt install unzip
  pause
  exit /b 1
)
goto done

:scp_fail
echo Oshibka scp
pause
exit /b 1

:done
echo.
echo Gotovo. Na servere:
echo   ssh %SSH_OPTS% %SSH_TARGET%
echo   cd %REMOTE%
echo   chmod +x deploy/vps/*.sh
echo   ./deploy/vps/install.sh
echo   nano .env
echo   ./deploy/vps/start.sh
echo.
pause
exit /b 0
