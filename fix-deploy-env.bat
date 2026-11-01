@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set "KEY=%USERPROFILE%\.ssh\zonadeck_ed25519"
call "%~dp0deploy\load-deploy-env.bat" "%~dp0"

(
echo VPS_HOST=%HOST%
echo VPS_USER=%USER%
echo VPS_PATH=%REMOTE%
echo VPS_SSH=zonadeck
echo VPS_SSH_KEY=%KEY%
) > "%~dp0deploy.local.env"

echo Sozdan deploy.local.env:
type "%~dp0deploy.local.env"
echo.
echo Zapustite: test-ssh.bat
pause
