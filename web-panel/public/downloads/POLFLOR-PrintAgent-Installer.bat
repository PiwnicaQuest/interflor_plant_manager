@echo off
setlocal EnableDelayedExpansion
title POLFLOR Print Agent - Instalator
color 0A

echo ============================================
echo   POLFLOR Print Agent - INSTALATOR
echo ============================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [BLAD] Node.js nie jest zainstalowany!
    echo Pobierz z: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js znaleziony
for /f "tokens=*" %%i in ('node -v') do echo     Wersja: %%i
echo.

:: Set directory
set INSTALL_DIR=%LOCALAPPDATA%\POLFLOR-PrintAgent
echo Katalog: %INSTALL_DIR%

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"

:: Clean old
echo.
echo [1/6] Czyszczenie starej instalacji...
if exist node_modules rmdir /s /q node_modules 2>nul
if exist package-lock.json del /f package-lock.json 2>nul
if exist "%USERPROFILE%\.cache\puppeteer" rmdir /s /q "%USERPROFILE%\.cache\puppeteer" 2>nul
call npm cache clean --force >nul 2>&1
echo       Gotowe

:: Create package.json
echo.
echo [2/6] Tworzenie package.json...
(
echo {
echo   "name": "plantmanager-print-agent",
echo   "version": "1.0.0",
echo   "main": "dist/index.js",
echo   "scripts": { "start": "node dist/index.js" },
echo   "dependencies": {
echo     "axios": "^1.6.0",
echo     "dotenv": "^16.3.1",
echo     "node-html-to-image": "^4.0.0",
echo     "pdf-to-printer": "^5.3.0",
echo     "puppeteer": "^21.5.0",
echo     "uuid": "^9.0.0"
echo   }
echo }
) > package.json
echo       Gotowe

:: Download dist
echo.
echo [3/6] Pobieranie aplikacji z serwera...
if not exist dist mkdir dist
powershell -Command "try { Invoke-WebRequest -Uri 'https://pm.polflor.wroclaw.pl/api/print/agent-files/dist/index.js' -OutFile 'dist/index.js' -ErrorAction Stop; Write-Host '       Gotowe' } catch { Write-Host '       Blad pobierania - sprawdz polaczenie'; exit 1 }"
if not exist dist\index.js (
    echo [BLAD] Nie udalo sie pobrac aplikacji
    pause
    exit /b 1
)

:: Install npm
echo.
echo [4/6] Instalowanie zaleznosci npm...
echo       To moze potrwac kilka minut...
call npm install --production
if %errorlevel% neq 0 (
    echo [BLAD] npm install nie powiodl sie
    pause
    exit /b 1
)
echo       Gotowe

:: Install Chrome
echo.
echo [5/6] Pobieranie Chrome dla Puppeteer...
echo       To moze potrwac kilka minut (~200MB)...
call npx puppeteer browsers install chrome
echo       Gotowe

:: Config
echo.
echo [6/6] Konfiguracja agenta...
if not exist .env (
    set /p AGENT_NAME="Podaj nazwe tego komputera [%COMPUTERNAME%]: "
    if "!AGENT_NAME!"=="" set AGENT_NAME=%COMPUTERNAME%
    (
echo SERVER_URL=https://pm.polflor.wroclaw.pl
echo AGENT_NAME=!AGENT_NAME!
echo POLL_INTERVAL=5000
echo HEARTBEAT_INTERVAL=30000
    ) > .env
    echo       Konfiguracja zapisana
) else (
    echo       Konfiguracja juz istnieje
)

:: Start script
(
echo @echo off
echo title POLFLOR Print Agent
echo cd /d "%INSTALL_DIR%"
echo node dist/index.js
echo pause
) > start-agent.bat

:: Verify
echo.
echo Weryfikacja Puppeteer...
node -e "const p=require('puppeteer');(async()=>{const b=await p.launch({headless:true,args:['--no-sandbox']});console.log('       Puppeteer OK');await b.close()})().catch(e=>console.log('       Puppeteer blad:',e.message))"

:: Shortcut
echo.
set /p SHORTCUT="Utworzyc skrot na pulpicie? (t/n): "
if /i "%SHORTCUT%"=="t" (
    powershell -Command "$ws=New-Object -ComObject WScript.Shell;$s=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\POLFLOR Print Agent.lnk');$s.TargetPath='%INSTALL_DIR%\start-agent.bat';$s.Save()"
    echo       Skrot utworzony
)

:: Autostart
set /p AUTOSTART="Dodac do autostartu Windows? (t/n): "
if /i "%AUTOSTART%"=="t" (
    copy start-agent.bat "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\POLFLOR-PrintAgent.bat" >nul
    echo       Dodano do autostartu
)

echo.
color 0A
echo ============================================
echo   INSTALACJA ZAKONCZONA POMYSLNIE!
echo ============================================
echo.
echo Lokalizacja: %INSTALL_DIR%
echo.

set /p RUN="Uruchomic Print Agent teraz? (t/n): "
if /i "%RUN%"=="t" start "" start-agent.bat

pause
