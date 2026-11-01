@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

call "%~dp0deploy\load-deploy-env.bat" "%~dp0"

echo.
echo === Proverka SSH k VPS ===
echo Target: %SSH_TARGET%
echo Key:    %VPS_SSH_KEY%
if exist "%VPS_SSH_KEY%" (echo Key file: DA) else (echo Key file: NET - zapustite setup-ssh-once.bat)
echo.

where ssh >nul 2>&1
if errorlevel 1 (
  echo OpenSSH ne ustanovlen
  pause
  exit /b 1
)

echo Podklyuchenie...
ssh %SSH_OPTS% %SSH_TARGET% "echo OK && hostname"
set RC=%ERRORLEVEL%

echo.
if %RC% EQU 0 (
  echo [OK] Vhod bez parolya rabotaet.
) else (
  echo [FAIL] Kod oshibki: %RC%
  echo.
  echo 1^) fix-deploy-env.bat
  echo 2^) setup-ssh-once.bat ^(parol VPS odin raz^)
  echo 3^) Podrobno: test-ssh.bat verbose
)
echo.
pause
exit /b %RC%
