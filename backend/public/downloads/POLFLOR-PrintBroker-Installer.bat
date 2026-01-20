@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title POLFLOR Print Broker - Instalator v1.0
color 0A

echo ========================================
echo   POLFLOR Print Broker - Instalator v1.0
echo   Lokalny serwer druku dla PlantManager
echo ========================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\POLFLOR-PrintBroker"
set "SERVER=https://pm.polflor.wroclaw.pl"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

:: ============================================
:: 1. Sprawdz Node.js
:: ============================================
echo [1/6] Sprawdzanie Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo    Node.js nie jest zainstalowany!
    echo    Otwieram strone pobierania...
    echo.
    echo    WAZNE: Zainstaluj Node.js i uruchom instalator ponownie.
    echo.
    start https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi
    pause
    exit /b 1
)
for /f "tokens=*" %%i in (node -v) do (
    echo    OK - Node.js %%i zainstalowany
)

:: ============================================
:: 2. Zatrzymaj istniejacy broker
:: ============================================
echo.
echo [2/6] Zatrzymywanie poprzedniej instancji...
taskkill /f /im node.exe /fi "WINDOWTITLE eq POLFLOR Print Broker*" >nul 2>&1
timeout /t 1 /nobreak >nul
echo    OK - Gotowe

:: ============================================
:: 3. Utworz katalog instalacji
:: ============================================
echo.
echo [3/6] Przygotowanie katalogu instalacji...
if exist "%INSTALL_DIR%" (
    echo    Usuwanie starej instalacji...
    rmdir /s /q "%INSTALL_DIR%" 2>nul
    timeout /t 1 /nobreak >nul
)
mkdir "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%\logs"
cd /d "%INSTALL_DIR%"
echo    OK - Katalog: %INSTALL_DIR%

:: ============================================
:: 4. Pobierz pliki
:: ============================================
echo.
echo [4/6] Pobieranie plikow...

:: Pobierz archiwum ZIP
echo    Pobieranie print-broker.zip...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri %SERVER%/downloads/print-broker.zip -OutFile print-broker.zip"

if not exist print-broker.zip (
    echo    BLAD pobierania! Sprawdz polaczenie z internetem.
    pause
    exit /b 1
)

:: Rozpakuj archiwum
echo    Rozpakowywanie...
powershell -Command "Expand-Archive -Path print-broker.zip -DestinationPath . -Force"
del print-broker.zip
echo    OK - Pliki pobrane i rozpakowane

:: ============================================
:: 5. Zainstaluj zaleznosci
:: ============================================
echo.
echo [5/6] Instalowanie zaleznosci...
echo    (moze potrwac 2-5 minut - pobieranie Puppeteer ~200MB)
echo.
call npm install --production 2>&1

if %ERRORLEVEL% neq 0 (
    echo.
    echo    BLAD instalacji! Sprobuj uruchomic jako Administrator.
    pause
    exit /b 1
)

:: Weryfikacja puppeteer
echo.
echo    Weryfikacja Puppeteer...
node -e "try{require(puppeteer);console.log( OK - Puppeteer zainstalowany)}catch(e){console.log(BLAD:,e.message);process.exit(1)}"
if %ERRORLEVEL% neq 0 (
    echo    Instalowanie przegladarki Chrome...
    call npx puppeteer browsers install chrome 2>&1
)

echo    OK - Zaleznosci zainstalowane

:: ============================================
:: 6. Konfiguracja autostartu
:: ============================================
echo.
echo [6/6] Konfiguracja autostartu...

:: Utworz skrypt startowy
(
echo @echo off
echo title POLFLOR Print Broker
echo cd /d "%INSTALL_DIR%"
echo node dist/index.js
) > "%INSTALL_DIR%\start-broker.bat"

:: Utworz skrypt startowy (ukryty)
(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.Run chr^(34^) ^& "%INSTALL_DIR%\start-broker.bat" ^& chr^(34^), 0
echo Set WshShell = Nothing
) > "%INSTALL_DIR%\start-hidden.vbs"

:: Utworz skrot w Autostart
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%STARTUP%\POLFLOR Print Broker.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "%INSTALL_DIR%\start-hidden.vbs"
echo oLink.WorkingDirectory = "%INSTALL_DIR%"
echo oLink.Description = "POLFLOR Print Broker - lokalny serwer druku"
echo oLink.Save
) > "%TEMP%\shortcut.vbs"
cscript //nologo "%TEMP%\shortcut.vbs"
del "%TEMP%\shortcut.vbs"
echo    OK - Autostart skonfigurowany

:: Utworz skrot na pulpicie
set "DESKTOP=%USERPROFILE%\Desktop"
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%DESKTOP%\POLFLOR Print Broker.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "cmd.exe"
echo oLink.Arguments = "/k cd /d ""%INSTALL_DIR%"" && node dist/index.js"
echo oLink.WorkingDirectory = "%INSTALL_DIR%"
echo oLink.Description = "POLFLOR Print Broker"
echo oLink.Save
) > "%TEMP%\shortcut2.vbs"
cscript //nologo "%TEMP%\shortcut2.vbs"
del "%TEMP%\shortcut2.vbs"
echo    OK - Skrot na pulpicie utworzony

:: ============================================
:: GOTOWE
:: ============================================
echo.
color 0A
echo ========================================
echo   INSTALACJA ZAKONCZONA POMYSLNIE!
echo ========================================
echo.
echo    Lokalizacja: %INSTALL_DIR%
echo    Port:        http://localhost:19432
echo.
echo    Print Broker uruchomi sie automatycznie
echo    przy kazdym starcie systemu Windows.
echo.
echo    Skroty:
echo    - Pulpit: "POLFLOR Print Broker"
echo    - Autostart: aktywny
echo.

set /p RUN="Czy uruchomic Print Broker teraz? (T/N): "
if /i "%RUN%"=="T" (
    echo.
    echo Uruchamiam Print Broker...
    start "POLFLOR Print Broker" cmd /k "cd /d "%INSTALL_DIR%" && node dist/index.js"
)

echo.
echo Mozesz teraz zamknac to okno.
pause
