@echo off
cd /d "%~dp0"
if not exist ".env" (
  echo Missing .env - run start.bat option 4
  pause
  exit /b 1
)
node --no-deprecation bot\index.js
pause
