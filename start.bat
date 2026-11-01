@echo off
cd /d "%~dp0"

:menu
cls
echo.
echo ========================================
echo   ZonaDeck Telegram Bot
echo ========================================
echo   1 - npm install
echo   2 - Run bot
echo   3 - Reload catalog
echo   4 - Create .env
echo   5 - Check Ollama
echo   6 - Build for VPS (build-prod.bat)
echo   7 - Upload to VPS
echo   8 - UPDATE VPS (build+upload+restart)
echo   9 - Deploy: odin raz (env + SSH klyuch)
echo  10 - Test SSH (bez parolya?)
echo   0 - Exit
echo ========================================
set /p choice=Choice: 

if "%choice%"=="1" goto install
if "%choice%"=="2" goto run
if "%choice%"=="3" goto reload
if "%choice%"=="4" goto env
if "%choice%"=="5" goto ollama
if "%choice%"=="6" goto prod
if "%choice%"=="7" goto upload
if "%choice%"=="8" goto update
if "%choice%"=="9" goto deploy_once
if "%choice%"=="10" goto test_ssh
if "%choice%"=="0" exit /b 0
goto menu

:install
where node >nul 2>&1
if errorlevel 1 goto no_node
call npm install
pause
goto menu

:run
if not exist ".env" goto no_env
where node >nul 2>&1
if errorlevel 1 goto no_node
echo Run Ollama app first. First time: option 5, then: ollama pull llava
echo.
node --no-deprecation bot\index.js
pause
goto menu

:reload
if not exist "node_modules\" call npm install
node scripts\reload-catalog.js
pause
goto menu

:env
if exist ".env" goto env_exists
copy /Y ".env.example" ".env"
echo Created .env - add TELEGRAM_BOT_TOKEN
goto env_done
:env_exists
echo .env already exists
:env_done
pause
goto menu

:ollama
where ollama >nul 2>&1
if errorlevel 1 goto no_ollama
node scripts\check-ollama.js
echo.
echo ollama pull llava
echo ollama pull llama3.2
pause
goto menu

:no_node
echo Install Node.js 18+ from https://nodejs.org
pause
goto menu

:no_env
echo Create .env first - menu option 4
pause
goto menu

:no_ollama
echo Install Ollama from https://ollama.com
pause
goto menu

:prod
call "%~dp0build-prod.bat"
goto menu

:upload
call "%~dp0upload-vps.bat"
goto menu

:update
call "%~dp0update-vps.bat"
goto menu

:deploy_once
call "%~dp0setup-deploy-once.bat"
call "%~dp0setup-ssh-once.bat"
goto menu

:test_ssh
call "%~dp0test-ssh.bat"
goto menu
