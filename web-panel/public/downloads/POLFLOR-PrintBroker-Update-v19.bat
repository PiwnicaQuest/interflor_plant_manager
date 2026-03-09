@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title POLFLOR Print Broker - Aktualizacja v19 (CPCL)
color 0E

echo ========================================
echo   POLFLOR Print Broker - Aktualizacja
echo   Wersja 19 - CPCL dla Citizen
echo ========================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\POLFLOR-PrintBroker"
set "SERVER=https://pm.interflor.pl"
set "CB=1772444634"

if not exist "%INSTALL_DIR%\dist" (
    echo BLAD: PrintBroker nie znaleziony w %INSTALL_DIR%
    echo Najpierw zainstaluj PrintBroker.
    pause
    exit /b 1
)

echo [1/5] Zatrzymywanie Print Broker...
taskkill /f /im node.exe /fi "WINDOWTITLE eq POLFLOR Print Broker*" >nul 2>&1
timeout /t 2 /nobreak >nul
echo    OK

echo.
echo [2/5] Pobieranie plikow (z cache-bust)...

powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER%/downloads/v19/index.js' -OutFile '%INSTALL_DIR%\dist\index.js' -Headers @{'Cache-Control'='no-cache'}"
if %ERRORLEVEL% equ 0 (echo    OK - index.js) else (echo    BLAD - index.js)

powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER%/downloads/v19/printerDetector.js' -OutFile '%INSTALL_DIR%\dist\services\printerDetector.js' -Headers @{'Cache-Control'='no-cache'}"
if %ERRORLEVEL% equ 0 (echo    OK - printerDetector.js) else (echo    BLAD - printerDetector.js)

powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER%/downloads/v19/labelPrinter.js' -OutFile '%INSTALL_DIR%\dist\services\labelPrinter.js' -Headers @{'Cache-Control'='no-cache'}"
if %ERRORLEVEL% equ 0 (echo    OK - labelPrinter.js) else (echo    BLAD - labelPrinter.js)

powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER%/downloads/v19/receiptPrinter.js' -OutFile '%INSTALL_DIR%\dist\services\receiptPrinter.js' -Headers @{'Cache-Control'='no-cache'}"
if %ERRORLEVEL% equ 0 (echo    OK - receiptPrinter.js) else (echo    BLAD - receiptPrinter.js)

powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER%/downloads/v19/tsplGenerator.js' -OutFile '%INSTALL_DIR%\dist\services\tsplGenerator.js' -Headers @{'Cache-Control'='no-cache'}"
if %ERRORLEVEL% equ 0 (echo    OK - tsplGenerator.js) else (echo    BLAD - tsplGenerator.js)

powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER%/downloads/v19/version.txt' -OutFile '%INSTALL_DIR%\version.txt' -Headers @{'Cache-Control'='no-cache'}"
if %ERRORLEVEL% equ 0 (echo    OK - version.txt) else (echo    BLAD - version.txt)

echo.
echo [3/5] Weryfikacja wersji...
powershell -NoProfile -Command "$v = Get-Content '%INSTALL_DIR%\version.txt' -Raw; Write-Host '   Wersja: ' $v.Trim()"

echo.
echo [4/5] Weryfikacja CPCL...
powershell -NoProfile -Command "if ((Get-Content '%INSTALL_DIR%\dist\services\labelPrinter.js' -Raw) -match 'CPCL') { Write-Host '   OK - CPCL support present' } else { Write-Host '   UWAGA - Brak CPCL!' }"

echo.
echo [5/5] Uruchamianie Print Broker...
start "POLFLOR Print Broker" cmd /k "cd /d "%INSTALL_DIR%" && node dist/index.js"

echo.
color 0A
echo ========================================
echo   AKTUALIZACJA ZAKONCZONA! (v19 - CPCL)
echo ========================================
echo.
echo   Citizen CL-S621 teraz uzywa CPCL
echo   (bitmap mode zamiast ZPL)
echo.
pause
