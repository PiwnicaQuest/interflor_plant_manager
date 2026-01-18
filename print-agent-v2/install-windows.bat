@echo off
title POLFLOR Print Agent v2 - Instalator
color 0A
chcp 65001 >nul

echo.
echo ========================================================
echo   POLFLOR Print Agent v2.0 - Instalator
echo   Inteligentne wsparcie dla wielu drukarek
echo ========================================================
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
echo.
set /p AGENT_NAME="Podaj nazwe tego komputera (np. Biuro, Magazyn): "
if "%AGENT_NAME%"=="" set AGENT_NAME=%COMPUTERNAME%

echo.
echo --------------------------------------------------------
echo Konfiguracja:
echo   Serwer: %SERVER_URL%
echo   Nazwa agenta: %AGENT_NAME%
echo --------------------------------------------------------
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
echo.
call npm install --production
if %errorlevel% neq 0 (
    echo [BLAD] Blad podczas instalacji zaleznosci
    pause
    exit /b 1
)
echo.
echo [OK] Zaleznosci zainstalowane
echo.

:: Build TypeScript if needed
if exist "src\index.ts" (
    echo Kompilacja kodu TypeScript...
    call npm run build
    if %errorlevel% neq 0 (
        echo [OSTRZEZENIE] Kompilacja nie powiodla sie, proba uzycia gotowych plikow...
    ) else (
        echo [OK] Kompilacja zakonczona
    )
)
echo.

:: Create start script
echo Tworzenie skryptu uruchomieniowego...
(
echo @echo off
echo title POLFLOR Print Agent v2
echo cd /d "%%~dp0"
echo echo.
echo echo ========================================================
echo echo   POLFLOR Print Agent v2.0
echo echo   Inteligentne wsparcie dla wielu drukarek
echo echo ========================================================
echo echo.
echo echo Uruchamianie agenta...
echo echo.
echo node dist/index.js
echo if errorlevel 1 pause
) > start-agent.bat
echo [OK] Utworzono start-agent.bat
echo.

:: Create stop script
(
echo @echo off
echo echo Zatrzymywanie Print Agent...
echo taskkill /f /im node.exe /fi "WINDOWTITLE eq POLFLOR Print Agent*" 2>nul
echo echo Zatrzymano.
) > stop-agent.bat
echo [OK] Utworzono stop-agent.bat
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
echo ========================================================
echo   INSTALACJA ZAKONCZONA POMYSLNIE!
echo ========================================================
echo.
echo Print Agent v2 automatycznie:
echo   - Wykryje wszystkie drukarki w systemie
echo   - Skategoryzuje je (etykiety/paragony/laserowe)
echo   - Przypisze dokumenty do odpowiednich drukarek
echo.
echo Twoje drukarki:
echo   - TSC MX340P      = etykiety barcode
echo   - Sewoo Elite     = paragony termiczne
echo   - HP LaserJet     = faktury, zamowienia
echo.
echo Aby uruchomic Print Agent:
echo   1. Kliknij dwukrotnie na: start-agent.bat
echo   2. Lub uruchom: npm start
echo.

set /p RUN_NOW="Czy uruchomic Print Agent teraz? (t/n): "
if /i "%RUN_NOW%"=="t" (
    echo.
    echo Uruchamianie Print Agent...
    start "" start-agent.bat
)

pause
