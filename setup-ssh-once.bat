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

set "KEY=%USERPROFILE%\.ssh\zonadeck_ed25519"
set "PUB=%KEY%.pub"
set "SSH_CONFIG=%USERPROFILE%\.ssh\config"
set "HOST_ALIAS=zonadeck"

echo.
echo ========================================
echo   SSH-klyuch na VPS (parol - 1 raz)
echo   Server: %USER%@%HOST%
echo ========================================
echo.

if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"

if not exist "%KEY%" (
  echo Sozdanie klyucha %KEY%
  ssh-keygen -t ed25519 -f "%KEY%" -N "" -C "zonadeck-deploy"
  if errorlevel 1 (
    echo Oshibka ssh-keygen
    pause
    exit /b 1
  )
) else (
  echo Klyuch uzhe est: %KEY%
)

call :start_agent_and_add

echo.
echo Vvedite PAROL ot VPS ODIN RAZ (dalshe - bez parolya):
echo.

ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new %USER%@%HOST% "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
if errorlevel 1 (
  echo Ne udalos podklyuchitsya. Proverite parol i IP.
  pause
  exit /b 1
)

type "%PUB%" | ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no %USER%@%HOST% "cat >> ~/.ssh/authorized_keys"
if errorlevel 1 (
  echo Ne udalos skopirovat klyuch.
  pause
  exit /b 1
)

call :write_ssh_config
call :write_deploy_env

call "%~dp0deploy\load-deploy-env.bat" "%~dp0"

echo.
echo Proverka bez parolya (%SSH_TARGET%)...
ssh %SSH_OPTS% %SSH_TARGET% "echo OK"
if errorlevel 1 (
  echo.
  echo Proverka NE proshla. Zapustite: test-ssh.bat
  pause
  exit /b 1
)

echo.
echo Gotovo. deploy.local.env obnovlen.
echo   VPS_SSH=%HOST_ALIAS%
echo   VPS_SSH_KEY=%KEY%
echo.
echo Teper update-vps.bat ne dolzhen sprashivat parol kazhdyy raz.
echo.
pause
exit /b 0

:start_agent_and_add
where ssh-add >nul 2>&1
if errorlevel 1 exit /b 0

sc query ssh-agent | findstr /i RUNNING >nul 2>&1
if errorlevel 1 (
  sc start ssh-agent >nul 2>&1
  timeout /t 2 /nobreak >nul
)

ssh-add "%KEY%" 2>nul
exit /b 0

:write_ssh_config
findstr /i /c:"Host %HOST_ALIAS%" "%SSH_CONFIG%" >nul 2>&1
if not errorlevel 1 (
  echo Blok Host %HOST_ALIAS% uzhe est v config
  exit /b 0
)
echo.>> "%SSH_CONFIG%"
echo Host %HOST_ALIAS%>> "%SSH_CONFIG%"
echo   HostName %HOST%>> "%SSH_CONFIG%"
echo   User %USER%>> "%SSH_CONFIG%"
echo   IdentityFile %KEY%>> "%SSH_CONFIG%"
echo   IdentitiesOnly yes>> "%SSH_CONFIG%"
echo   PreferredAuthentications publickey>> "%SSH_CONFIG%"
echo Dobavlen %HOST_ALIAS% v %SSH_CONFIG%
exit /b 0

:write_deploy_env
set "ENV_FILE=%~dp0deploy.local.env"
(
echo VPS_HOST=%HOST%
echo VPS_USER=%USER%
echo VPS_PATH=%REMOTE%
echo VPS_SSH=%HOST_ALIAS%
echo VPS_SSH_KEY=%KEY%
) > "%ENV_FILE%"
exit /b 0
