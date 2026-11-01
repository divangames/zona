@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set "ROOT=%~dp0"
set "RELEASE=%ROOT%release"
set "STAGING=%RELEASE%\.build-tmp"
set "OUT=%RELEASE%\zonadeck-deploy"
set "ZIP=%RELEASE%\zonadeck-deploy.zip"

if /i "%~1"=="silent" set "WITH_CATALOG=0" & set "MAKE_ZIP=1" & goto do_build
if /i "%~1"=="catalog" set "WITH_CATALOG=1" & set "MAKE_ZIP=1" & goto do_build
if /i "%~1"=="zip" set "WITH_CATALOG=0" & set "MAKE_ZIP=1" & goto do_build

:menu
cls
echo.
echo ========================================
echo   ZonaDeck - sborka dlya VPS
echo ========================================
echo   Papka dist BOLSHE NE ISPOLZUETSYA
echo   Zagruzhaite: release\zonadeck-deploy
echo            ili release\zonadeck-deploy.zip
echo ========================================
echo   1 - Sobrat papku release\zonadeck-deploy
echo   2 - Papka + catalog-cache + ZIP
echo   3 - Tolko obnovit ZIP iz papki
echo   4 - Komandy scp/rsync
echo   0 - Vyhod
echo ========================================
set /p "choice=Vyberite: "

if "%choice%"=="1" set "WITH_CATALOG=0" & set "MAKE_ZIP=0" & goto do_build
if "%choice%"=="2" set "WITH_CATALOG=1" & set "MAKE_ZIP=1" & goto do_build
if "%choice%"=="3" goto zip_only
if "%choice%"=="4" goto upload_hint
if "%choice%"=="0" exit /b 0
goto menu

:do_build
where node >nul 2>&1
if errorlevel 1 (
  echo Ustanovite Node.js 18+
  pause
  goto menu
)

if not exist "%RELEASE%" mkdir "%RELEASE%"

echo.
echo [1/5] Sborka vo vremennuyu papku (dist ne trogaem)...
if exist "%STAGING%" (
  rmdir /s /q "%STAGING%" 2>nul
  if exist "%STAGING%" (
    echo Ne udalos ochistit .build-tmp - zakroyte WinSCP/Cursor iz etoy papki
    pause
    goto menu
  )
)
mkdir "%STAGING%"
mkdir "%STAGING%\data"
mkdir "%STAGING%\deploy\vps"

echo [2/5] Kopirovanie faylov...
call :copy_tree bot
if errorlevel 1 goto build_fail
call :copy_tree services
if errorlevel 1 goto build_fail
call :copy_tree ai
if errorlevel 1 goto build_fail
call :copy_tree scripts
if errorlevel 1 goto build_fail

copy /Y "%ROOT%package.json" "%STAGING%\" >nul
copy /Y "%ROOT%package-lock.json" "%STAGING%\" >nul
copy /Y "%ROOT%.env.example" "%STAGING%\.env.example" >nul
copy /Y "%ROOT%ecosystem.config.cjs" "%STAGING%\" >nul
copy /Y "%ROOT%deploy\vps\install.sh" "%STAGING%\deploy\vps\" >nul
copy /Y "%ROOT%deploy\vps\start.sh" "%STAGING%\deploy\vps\" >nul
copy /Y "%ROOT%deploy\vps\zona-bot.service" "%STAGING%\deploy\vps\" >nul
copy /Y "%ROOT%deploy\DEPLOY-VPS.md" "%STAGING%\deploy\" >nul
copy /Y "%ROOT%data\.gitkeep" "%STAGING%\data\" >nul 2>nul
if exist "%ROOT%data\basketball-birthdays.json" (
  copy /Y "%ROOT%data\basketball-birthdays.json" "%STAGING%\data\" >nul
)

if "%WITH_CATALOG%"=="1" (
  if exist "%ROOT%data\catalog-cache.json" (
    echo Kopirovanie catalog-cache.json...
    copy /Y "%ROOT%data\catalog-cache.json" "%STAGING%\data\" >nul
  ) else (
    echo catalog-cache.json ne nayden
  )
  if exist "%ROOT%data\style-samples.json" (
    copy /Y "%ROOT%data\style-samples.json" "%STAGING%\data\" >nul
  )
)

if not exist "%STAGING%\bot\index.js" goto build_fail

echo [3/5] Publikaciya v release\zonadeck-deploy...
if exist "%OUT%" (
  rmdir /s /q "%OUT%" 2>nul
)
if exist "%OUT%" (
  echo.
  echo VNIMANIE: %OUT% zanyata - zakroyte WinSCP/FileZilla.
  echo Sborka sohranena v: %STAGING%
  echo Perezapustite sborku posle zakrytiya.
  pause
  goto menu
)
move "%STAGING%" "%OUT%" >nul
if errorlevel 1 (
  echo Oshibka move - probuy robocopy...
  mkdir "%OUT%" 2>nul
  robocopy "%STAGING%" "%OUT%" /E /NFL /NDL /NJH /NJS /nc /ns /np
  if errorlevel 8 goto build_fail
  rmdir /s /q "%STAGING%" 2>nul
)

echo [4/5] Gotovo papka: %OUT%

if "%MAKE_ZIP%"=="1" call :make_zip

echo.
echo [5/5] Mozhno zalivat na VPS. dist ne peresobiraetsya.
echo.
if /i not "%~1"=="silent" if /i not "%~1"=="catalog" if /i not "%~1"=="zip" pause
if not "%~1"=="" exit /b 0
goto menu

:zip_only
if not exist "%OUT%\bot\index.js" (
  echo Snachala punkt 1 ili 2 - net papki zonadeck-deploy
  pause
  goto menu
)
call :make_zip
pause
goto menu

:make_zip
echo Sozdanie ZIP...
if exist "%ZIP%" del /f /q "%ZIP%" 2>nul
powershell -NoProfile -Command "Compress-Archive -Path '%OUT%\*' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 (
  echo Oshibka sozdaniya ZIP
  exit /b 1
)
echo ZIP: %ZIP%
exit /b 0

:build_fail
echo.
echo Oshibka sborki.
pause
goto menu

:copy_tree
set "SRC=%~1"
if not exist "%ROOT%%SRC%" (
  echo Net papki %SRC%
  exit /b 1
)
robocopy "%ROOT%%SRC%" "%STAGING%\%SRC%" /E /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 (
  echo Oshibka robocopy %SRC%
  exit /b 1
)
exit /b 0

:upload_hint
echo.
echo === Papka (rsync) ===
echo   rsync -avz release/zonadeck-deploy/ user@IP:/opt/zonadeck/
echo.
echo === ZIP (odin fayl) ===
echo   scp release/zonadeck-deploy.zip user@IP:/opt/
echo   ssh user@IP
echo   cd /opt ^&^& rm -rf zonadeck ^&^& mkdir zonadeck ^&^& unzip zonadeck-deploy.zip -d zonadeck
echo.
echo Na servere: cd /opt/zonadeck ^&^& ./deploy/vps/install.sh
echo.
pause
goto menu
