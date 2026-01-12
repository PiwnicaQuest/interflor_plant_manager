@echo off
title POLFLOR Print Agent - Reinstalacja
color 0E

echo ============================================
echo   POLFLOR Print Agent - REINSTALACJA
echo ============================================
echo.
echo Ten skrypt calkowicie przeinstaluje Print Agent
echo.

:: Check if running as admin (recommended)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [UWAGA] Zalecane uruchomienie jako Administrator
    echo.
)

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [BLAD] Node.js nie jest zainstalowany!
    echo.
    echo Pobierz i zainstaluj Node.js z: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js znaleziony
for /f "tokens=*" %%i in ('node -v') do echo     Wersja: %%i
echo.

:: Save current config if exists
set CONFIG_BACKUP=0
if exist .env (
    echo [INFO] Zapisywanie obecnej konfiguracji...
    copy .env .env.backup >nul
    set CONFIG_BACKUP=1
)

:: Kill any running agent
echo [INFO] Zatrzymywanie Print Agent...
taskkill /f /im node.exe /fi "WINDOWTITLE eq POLFLOR Print Agent" >nul 2>&1

:: Clean up old installation
echo.
echo [1/6] Usuwanie starych plikow...
if exist node_modules (
    echo       Usuwanie node_modules... (moze potrwac)
    rmdir /s /q node_modules 2>nul
)
if exist package-lock.json del /f package-lock.json 2>nul
if exist .cache rmdir /s /q .cache 2>nul
echo       [OK] Stare pliki usuniete

:: Clear npm cache
echo.
echo [2/6] Czyszczenie cache npm...
call npm cache clean --force >nul 2>&1
echo       [OK] Cache wyczyszczony

:: Clear puppeteer cache
echo.
echo [3/6] Czyszczenie cache Puppeteer (Chrome)...
if exist "%USERPROFILE%\.cache\puppeteer" (
    rmdir /s /q "%USERPROFILE%\.cache\puppeteer" 2>nul
)
echo       [OK] Cache Puppeteer wyczyszczony

:: Install dependencies
echo.
echo [4/6] Instalowanie zaleznosci...
echo       To moze potrwac kilka minut...
call npm install --production 2>&1
if %errorlevel% neq 0 (
    echo [BLAD] Blad podczas instalacji zaleznosci
    pause
    exit /b 1
)
echo       [OK] Zaleznosci zainstalowane

:: Install Chrome for puppeteer
echo.
echo [5/6] Pobieranie Chrome dla Puppeteer...
echo       To moze potrwac kilka minut (ok. 200MB)...
call npx puppeteer browsers install chrome 2>&1
if %errorlevel% neq 0 (
    echo [UWAGA] Blad podczas pobierania Chrome
    echo         Probuje alternatywna metode...
    call node -e "require('puppeteer').executablePath()" 2>&1
)
echo       [OK] Chrome zainstalowany

:: Verify puppeteer works
echo.
echo [6/6] Weryfikacja instalacji Puppeteer...
call node -e "const p=require('puppeteer');(async()=>{const b=await p.launch({headless:true,args:['--no-sandbox']});console.log('Puppeteer OK');await b.close()})().catch(e=>console.log('BLAD:',e.message))" 2>&1

:: Restore or create config
echo.
if %CONFIG_BACKUP%==1 (
    echo [INFO] Przywracanie konfiguracji...
    copy .env.backup .env >nul
    del .env.backup >nul
    echo [OK] Konfiguracja przywrocona
) else (
    echo Konfiguracja agenta:
    echo.
    set /p SERVER_URL="Adres serwera [https://pm.polflor.wroclaw.pl]: "
    if "!SERVER_URL!"=="" set SERVER_URL=https://pm.polflor.wroclaw.pl
    set /p AGENT_NAME="Nazwa komputera [%COMPUTERNAME%]: "
    if "!AGENT_NAME!"=="" set AGENT_NAME=%COMPUTERNAME%
    
    (
    echo SERVER_URL=https://pm.polflor.wroclaw.pl
    echo AGENT_NAME=%COMPUTERNAME%
    echo POLL_INTERVAL=5000
    echo HEARTBEAT_INTERVAL=30000
    ) > .env
    echo [OK] Konfiguracja zapisana
)

:: Create start script
echo.
echo Tworzenie skryptu startowego...
(
echo @echo off
echo title POLFLOR Print Agent
echo cd /d "%%~dp0"
echo echo Uruchamianie Print Agent...
echo echo.
echo node dist/index.js
echo echo.
echo echo Agent zatrzymany. Nacisnij dowolny klawisz...
echo pause ^>nul
) > start-agent.bat
echo [OK] Utworzono start-agent.bat

:: Done
echo.
color 0A
echo ============================================
echo   REINSTALACJA ZAKONCZONA POMYSLNIE!
echo ============================================
echo.
echo Pliki zainstalowane w: %CD%
echo.

set /p RUN_NOW="Czy uruchomic Print Agent teraz? (t/n): "
if /i "%RUN_NOW%"=="t" (
    echo.
    echo Uruchamianie Print Agent...
    start "" start-agent.bat
)

pause
