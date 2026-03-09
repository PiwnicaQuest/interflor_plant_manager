@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title POLFLOR Print Agent - Instalator v2.1
color 0A

echo ========================================
echo   POLFLOR Print Agent - Instalator v2.1
echo ========================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\POLFLOR-PrintAgent"
set "SERVER=https://pm.interflor.pl"

:: Sprawdz Node.js
echo [1/5] Sprawdzanie Node.js...
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
for /f "tokens=*" %%i in ('node -v') do echo Node.js %%i OK!

:: Utworz katalog
echo.
echo [2/5] Tworzenie katalogu instalacji...
if exist "%INSTALL_DIR%" (
    echo Usuwanie starej instalacji...
    rmdir /s /q "%INSTALL_DIR%" 2>nul
)
mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"
echo Katalog: %INSTALL_DIR%

:: Wyczysc cache puppeteer
if exist "%USERPROFILE%\.cache\puppeteer" (
    echo Czyszczenie cache Puppeteer...
    rmdir /s /q "%USERPROFILE%\.cache\puppeteer" 2>nul
)

:: Pobierz pliki
echo.
echo [3/5] Pobieranie plikow...

:: Pobierz glowny plik JS
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER%/downloads/print-agent-bundle.js' -OutFile 'index.js'"
if not exist index.js (
    echo Blad pobierania! Sprawdz polaczenie z internetem.
    pause
    exit /b 1
)
echo Aplikacja pobrana!

:: Utworz package.json Z PUPPETEER
echo {"name":"polflor-print-agent","version":"2.1.0","main":"index.js","dependencies":{"axios":"^1.6.0","dotenv":"^16.3.1","node-html-to-image":"^4.0.0","pdf-to-printer":"^5.3.0","puppeteer":"^21.5.0","uuid":"^9.0.0"}} > package.json
echo package.json utworzony

:: Konfiguracja
echo.
echo [4/5] Konfiguracja...
set /p AGENT_NAME="Podaj nazwe tego komputera (np. Biuro-PC1): "
if "%AGENT_NAME%"=="" set AGENT_NAME=%COMPUTERNAME%

echo SERVER_URL=%SERVER%> .env
echo AGENT_NAME=%AGENT_NAME%>> .env
echo POLL_INTERVAL=3000>> .env
echo Konfiguracja zapisana!

:: Instaluj zaleznosci
echo.
echo [5/5] Instalowanie zaleznosci...
echo To moze potrwac 3-5 minut (puppeteer ~200MB)...
echo.
call npm install --production 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo Blad instalacji! Sprobuj uruchomic jako Administrator.
    pause
    exit /b 1
)

:: Weryfikacja puppeteer
echo.
echo Weryfikacja Puppeteer...
node -e "try{require('puppeteer');console.log('Puppeteer OK!')}catch(e){console.log('BLAD:',e.message);process.exit(1)}"
if %ERRORLEVEL% neq 0 (
    echo.
    echo Puppeteer nie zostal zainstalowany poprawnie!
    echo Sprobuj uruchomic instalator jako Administrator.
    pause
    exit /b 1
)

:: Pobierz Chrome dla Puppeteer
echo.
echo Pobieranie Chrome dla Puppeteer...
call npx puppeteer browsers install chrome 2>&1
echo Chrome pobrany!

:: Utworz skrot na pulpicie
echo.
echo Tworzenie skrotu na pulpicie...
set "DESKTOP=%USERPROFILE%\Desktop"
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\shortcut.vbs"
echo sLinkFile = "%DESKTOP%\POLFLOR Print Agent.lnk" >> "%TEMP%\shortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\shortcut.vbs"
echo oLink.TargetPath = "cmd.exe" >> "%TEMP%\shortcut.vbs"
echo oLink.Arguments = "/k cd /d ""%INSTALL_DIR%"" ^^&^^& node index.js" >> "%TEMP%\shortcut.vbs"
echo oLink.WorkingDirectory = "%INSTALL_DIR%" >> "%TEMP%\shortcut.vbs"
echo oLink.Save >> "%TEMP%\shortcut.vbs"
cscript //nologo "%TEMP%\shortcut.vbs"
del "%TEMP%\shortcut.vbs"

echo.
color 0A
echo ========================================
echo   INSTALACJA ZAKONCZONA POMYSLNIE!
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
