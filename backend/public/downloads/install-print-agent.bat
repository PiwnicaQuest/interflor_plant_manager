@echo off
chcp 65001 >nul 2>nul
title PlantManager Print Agent - Instalator
color 0A

echo.
echo  =============================================
echo   PlantManager Print Agent - Instalator
echo  =============================================
echo.

:: Stay in current directory, don't require admin
cd /d "%~dp0"

echo [1/6] Sprawdzam Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [BLAD] Node.js nie jest zainstalowany!
    echo.
    echo Pobierz Node.js z: https://nodejs.org/
    echo Wybierz wersje LTS i zainstaluj.
    echo Potem uruchom ten plik ponownie.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo [OK] Node.js %%i

echo.
echo [2/6] Tworze folder instalacji...
set "INSTALL_DIR=%USERPROFILE%\PrintAgent"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"
echo [OK] Folder: %INSTALL_DIR%

echo.
echo [3/6] Pobieram Print Agent...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://polflor.fast-site.pl/api/downloads/print-agent.tar.gz' -OutFile 'print-agent.tar.gz'" 2>nul
if not exist "print-agent.tar.gz" (
    echo [BLAD] Nie udalo sie pobrac pliku!
    echo Sprawdz polaczenie z internetem.
    pause
    exit /b 1
)
echo [OK] Pobrano

echo.
echo [4/6] Rozpakowuje...
tar -xzf print-agent.tar.gz --strip-components=1 2>nul
del print-agent.tar.gz 2>nul
if not exist "package.json" (
    echo [BLAD] Rozpakowywanie nie powiodlo sie!
    pause
    exit /b 1
)
echo [OK] Rozpakowano

echo.
echo [5/6] Instaluje zaleznosci (to moze potrwac 2-3 minuty)...
echo      Prosze czekac...
call npm install --silent 2>nul
if %errorlevel% neq 0 (
    echo [BLAD] npm install nie powiodl sie
    echo Sprobuj uruchomic recznie: npm install
    pause
    exit /b 1
)
echo [OK] Zaleznosci zainstalowane

echo.
echo [6/6] Buduje aplikacje...
call npm run build --silent 2>nul
if %errorlevel% neq 0 (
    echo [BLAD] Budowanie nie powiodlo sie
    pause
    exit /b 1
)
echo [OK] Zbudowano

echo.
echo  ---------------------------------------------
echo   KONFIGURACJA
echo  ---------------------------------------------
echo.
set "SERVER_URL=https://polflor.fast-site.pl/api"
echo Serwer: %SERVER_URL%
echo.
set /p "AGENT_NAME=Podaj nazwe komputera (lub Enter dla %COMPUTERNAME%): "
if "%AGENT_NAME%"=="" set "AGENT_NAME=%COMPUTERNAME%"

:: Create .env
(
echo SERVER_URL=%SERVER_URL%
echo AGENT_NAME=%AGENT_NAME%
echo POLL_INTERVAL=5000
echo HEARTBEAT_INTERVAL=30000
echo NODE_TLS_REJECT_UNAUTHORIZED=0
) > "%INSTALL_DIR%\.env"

:: Create start script
(
echo @echo off
echo chcp 65001 ^>nul 2^>nul
echo title Print Agent - %AGENT_NAME%
echo cd /d "%INSTALL_DIR%"
echo set NODE_TLS_REJECT_UNAUTHORIZED=0
echo node dist/index.js
echo pause
) > "%INSTALL_DIR%\START.bat"

:: Desktop shortcut
echo.
echo Tworze skrot na pulpicie...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%USERPROFILE%\Desktop\Print Agent.lnk'); $s.TargetPath = '%INSTALL_DIR%\START.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Save()" 2>nul

echo.
echo  =============================================
echo   INSTALACJA ZAKONCZONA!
echo  =============================================
echo.
echo   Folder: %INSTALL_DIR%
echo   Skrot na pulpicie: "Print Agent"
echo.
echo   Aby uruchomic: kliknij "Print Agent" na pulpicie
echo   lub uruchom: %INSTALL_DIR%\START.bat
echo.
echo  ---------------------------------------------
echo.

set /p "RUN=Uruchomic Print Agent teraz? (t/n): "
if /i "%RUN%"=="t" (
    echo.
    echo Uruchamiam...
    start "" "%INSTALL_DIR%\START.bat"
)

echo.
echo Nacisnij dowolny klawisz aby zamknac...
pause >nul
