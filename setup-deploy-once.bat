@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
echo ========================================
echo   Odin raz: nastrojka deploy.local.env
echo ========================================
echo.

if exist "deploy.local.env" (
  echo Fayl deploy.local.env uzhe est.
  notepad deploy.local.env
) else (
  copy /Y "deploy.local.env.example" "deploy.local.env" >nul
  echo Sozdan deploy.local.env - otkroetsya v blocnote.
  echo Popravte VPS_HOST / VPS_USER / VPS_PATH pri nuzhde.
  notepad deploy.local.env
)

echo.
echo Chtoby NE vvodit parol pri kazhdoj zalivke, zapustite:
echo   setup-ssh-once.bat
echo   (parol VPS - odin raz, dalshe SSH-klyuch)
echo.
pause
