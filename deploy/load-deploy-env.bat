@echo off
REM deploy.local.env + SSH_OPTS (bez ControlMaster - na Windows lomaetsya)

if not "%~1"=="" (
  set "ROOT=%~1"
) else (
  set "ROOT=%~dp0..\"
)

set "HOST=45.12.72.82"
set "USER=root"
set "REMOTE=/root/zonadeck-deploy"
set "VPS_SSH="
set "VPS_SSH_KEY="
set "SSH_OPTS="
set "SSH_TARGET=%USER%@%HOST%"
set "ZONADECK_KEY=%USERPROFILE%\.ssh\zonadeck_ed25519"

if exist "%ROOT%deploy.local.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%ROOT%deploy.local.env") do (
    call :env_line "%%a" "%%b"
  )
)

if not defined VPS_SSH_KEY if exist "%ZONADECK_KEY%" set "VPS_SSH_KEY=%ZONADECK_KEY%"

if defined VPS_SSH (
  set "SSH_TARGET=%VPS_SSH%"
) else (
  set "SSH_TARGET=%USER%@%HOST%"
)

call :build_ssh_opts
exit /b 0

:env_line
set "ek=%~1"
set "ev=%~2"
if /i "%ek%"=="VPS_HOST" set "HOST=%ev%"
if /i "%ek%"=="VPS_USER" set "USER=%ev%"
if /i "%ek%"=="VPS_PATH" set "REMOTE=%ev%"
if /i "%ek%"=="VPS_SSH" set "VPS_SSH=%ev%"
if /i "%ek%"=="VPS_SSH_KEY" set "VPS_SSH_KEY=%ev%"
exit /b 0

:build_ssh_opts
REM Bez ControlMaster/ControlPath - na Windows OpenSSH dae oshibku -1
set "SSH_OPTS=-o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o PreferredAuthentications=publickey -o PubkeyAuthentication=yes"
if defined VPS_SSH_KEY if exist "%VPS_SSH_KEY%" set "SSH_OPTS=%SSH_OPTS% -i "%VPS_SSH_KEY%""
exit /b 0
