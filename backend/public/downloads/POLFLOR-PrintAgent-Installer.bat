@echo off
chcp 65001 >nul
title POLFLOR Print Agent - Instalator
color 0A

echo ========================================
echo   POLFLOR Print Agent - Instalator
echo ========================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\POLFLOR-PrintAgent"
set "SERVER=https://pm.polflor.wroclaw.pl"

:: Sprawdz Node.js
echo [1/4] Sprawdzanie Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Node.js nie znaleziony. Otwieram strone pobierania...
    echo.
    echo WAZNE: Pobierz i zainstaluj Node.js, potem uruchom ten instalator ponownie.
    echo.
    start https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi
    pause
    exit /b 1
)
echo Node.js OK!

:: Utworz katalog
echo.
echo [2/4] Tworzenie katalogu instalacji...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"
echo Katalog: %INSTALL_DIR%

:: Pobierz pliki
echo.
echo [3/4] Pobieranie plikow...

:: Pobierz glowny plik JS
powershell -Command "Invoke-WebRequest -Uri '%SERVER%/downloads/print-agent-bundle.js' -OutFile 'index.js'"
if %ERRORLEVEL% neq 0 (
    echo Blad pobierania! Sprawdz polaczenie z internetem.
    pause
    exit /b 1
)

:: Utworz package.json
echo {"name":"polflor-print-agent","version":"1.0.0","main":"index.js","dependencies":{"axios":"^1.6.0","dotenv":"^16.3.1","pdf-to-printer":"^5.3.0","uuid":"^9.0.0"}} > package.json

echo Pliki pobrane!

:: Konfiguracja
echo.
echo [4/4] Konfiguracja...
set /p AGENT_NAME="Podaj nazwe tego komputera (np. Biuro-PC1): "
if "%AGENT_NAME%"=="" set AGENT_NAME=%COMPUTERNAME%

echo SERVER_URL=%SERVER%> .env
echo AGENT_NAME=%AGENT_NAME%>> .env
echo POLL_INTERVAL=3000>> .env

:: Instaluj zaleznosci
echo.
echo Instalowanie zaleznosci (moze potrwac 1-2 minuty)...
call npm install --production 2>nul
if %ERRORLEVEL% neq 0 (
    echo Blad instalacji zaleznosci!
    pause
    exit /b 1
)
echo Zaleznosci zainstalowane!

:: Utworz skrot na pulpicie
echo.
echo Tworzenie skrotu na pulpicie...
set "DESKTOP=%USERPROFILE%\Desktop"
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\shortcut.vbs"
echo sLinkFile = "%DESKTOP%\POLFLOR Print Agent.lnk" >> "%TEMP%\shortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\shortcut.vbs"
echo oLink.TargetPath = "cmd.exe" >> "%TEMP%\shortcut.vbs"
echo oLink.Arguments = "/k cd /d ""%INSTALL_DIR%"" ^&^& node index.js" >> "%TEMP%\shortcut.vbs"
echo oLink.WorkingDirectory = "%INSTALL_DIR%" >> "%TEMP%\shortcut.vbs"
echo oLink.Save >> "%TEMP%\shortcut.vbs"
cscript //nologo "%TEMP%\shortcut.vbs"
del "%TEMP%\shortcut.vbs"

echo.
echo ========================================
echo   INSTALACJA ZAKONCZONA!
echo ========================================
echo.
echo Aby uruchomic agenta:
echo   - Kliknij dwukrotnie "POLFLOR Print Agent" na pulpicie
echo.
set /p RUN="Czy uruchomic agenta teraz? (T/N): "
if /i "%RUN%"=="T" (
    echo Uruchamiam...
    node index.js
)
