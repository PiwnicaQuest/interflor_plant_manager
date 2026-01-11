@echo off
title POLFLOR Print Agent - Instalator
color 0A

echo ============================================
echo   POLFLOR Print Agent - Instalator
echo ============================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [BLAD] Node.js nie jest zainstalowany!
    echo.
    echo Pobierz i zainstaluj Node.js z: https://nodejs.org/
    echo Wybierz wersje LTS (zalecana)
    echo.
    echo Po instalacji Node.js uruchom ten skrypt ponownie.
    pause
    exit /b 1
)

echo [OK] Node.js znaleziony
for /f "tokens=*" %%i in ('node -v') do echo     Wersja: %%i
echo.

:: Get server URL from user
echo Domyslny adres serwera: https://pm.polflor.wroclaw.pl
set /p SERVER_URL="Podaj adres serwera (Enter = domyslny): "
if "%SERVER_URL%"=="" set SERVER_URL=https://pm.polflor.wroclaw.pl

:: Get agent name
set /p AGENT_NAME="Podaj nazwe tego komputera (np. Biuro, Magazyn): "
if "%AGENT_NAME%"=="" set AGENT_NAME=%COMPUTERNAME%

echo.
echo Konfiguracja:
echo   Serwer: %SERVER_URL%
echo   Nazwa agenta: %AGENT_NAME%
echo.

:: Create .env file
echo Tworzenie pliku konfiguracyjnego...
(
echo SERVER_URL=%SERVER_URL%
echo AGENT_NAME=%AGENT_NAME%
echo POLL_INTERVAL=5000
echo HEARTBEAT_INTERVAL=30000
) > .env
echo [OK] Plik .env utworzony
echo.

:: Install dependencies
echo Instalowanie zaleznosci (moze to potrwac kilka minut)...
call npm install --production
if %errorlevel% neq 0 (
    echo [BLAD] Blad podczas instalacji zaleznosci
    pause
    exit /b 1
)
echo [OK] Zaleznosci zainstalowane
echo.

:: Create start script
echo Tworzenie skryptu uruchomieniowego...
(
echo @echo off
echo title POLFLOR Print Agent
echo cd /d "%%~dp0"
echo node dist/index.js
echo pause
) > start-agent.bat
echo [OK] Utworzono start-agent.bat
echo.

:: Create startup shortcut
echo.
set /p ADD_STARTUP="Czy dodac do autostartu systemu Windows? (t/n): "
if /i "%ADD_STARTUP%"=="t" (
    echo Tworzenie skrotu w autostarcie...
    set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
    copy start-agent.bat "%STARTUP_FOLDER%\POLFLOR-PrintAgent.bat" >nul
    echo [OK] Dodano do autostartu
)

echo.
echo ============================================
echo   INSTALACJA ZAKONCZONA POMYSLNIE!
echo ============================================
echo.
echo Aby uruchomic Print Agent:
echo   1. Kliknij dwukrotnie na: start-agent.bat
echo   2. Lub uruchom: npm start
echo.
echo Agent automatycznie wykryje drukarki i polaczy
echo sie z serwerem POLFLOR.
echo.

set /p RUN_NOW="Czy uruchomic Print Agent teraz? (t/n): "
if /i "%RUN_NOW%"=="t" (
    echo.
    echo Uruchamianie Print Agent...
    start "" start-agent.bat
)

pause
