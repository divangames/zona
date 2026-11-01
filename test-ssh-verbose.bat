@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
call "%~dp0deploy\load-deploy-env.bat" "%~dp0"
echo SSH_OPTS=%SSH_OPTS%
echo TARGET=%SSH_TARGET%
ssh %SSH_OPTS% -v %SSH_TARGET% "echo OK"
pause
