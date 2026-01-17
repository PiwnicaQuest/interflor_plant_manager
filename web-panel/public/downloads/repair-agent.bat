@echo off
setlocal EnableDelayedExpansion
title POLFLOR Print Agent - Naprawa
color 0E

echo ============================================
echo   POLFLOR Print Agent - NAPRAWA
echo ============================================
echo.

set INSTALL_DIR=%LOCALAPPDATA%\POLFLOR-PrintAgent

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [BLAD] Node.js nie jest zainstalowany!
    echo Pobierz z: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js znaleziony

:: Check if dir exists
if not exist "%INSTALL_DIR%" (
    echo [BLAD] Katalog instalacji nie istnieje!
    echo Uruchom najpierw instalator.
    pause
    exit /b 1
)

cd /d "%INSTALL_DIR%"
echo Katalog: %INSTALL_DIR%
echo.

:: Remove old index.js if exists in root (old version)
if exist index.js (
    echo [INFO] Usuwanie starego index.js z glownego katalogu...
    del /f index.js 2>nul
)

:: Ensure dist folder exists
if not exist dist mkdir dist

:: Check if dist/index.js exists
if not exist dist\index.js (
    echo [INFO] Pobieranie aplikacji z serwera...
    powershell -Command "Invoke-WebRequest -Uri 'https://pm.polflor.wroclaw.pl/api/print/agent-files/dist/index.js' -OutFile 'dist/index.js'"
)

:: Create package.json if missing
if not exist package.json (
    echo [INFO] Tworzenie package.json...
    (
echo {
echo   "name": "plantmanager-print-agent",
echo   "version": "1.0.0",
echo   "main": "dist/index.js",
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
)

:: Remove node_modules and reinstall
echo.
echo [1/4] Usuwanie starych modulow...
if exist node_modules rmdir /s /q node_modules 2>nul
if exist package-lock.json del /f package-lock.json 2>nul
echo       Gotowe

echo.
echo [2/4] Czyszczenie cache...
call npm cache clean --force >nul 2>&1
if exist "%USERPROFILE%\.cache\puppeteer" rmdir /s /q "%USERPROFILE%\.cache\puppeteer" 2>nul
echo       Gotowe

echo.
echo [3/4] Instalowanie modulow npm...
echo       To moze potrwac kilka minut...
call npm install --production 2>&1
if %errorlevel% neq 0 (
    echo [BLAD] npm install nie powiodl sie!
    echo Sprobuj uruchomic jako Administrator.
    pause
    exit /b 1
)
echo       Gotowe

echo.
echo [4/4] Pobieranie Chrome dla Puppeteer...
echo       To moze potrwac kilka minut (~200MB)...
call npx puppeteer browsers install chrome 2>&1
echo       Gotowe

:: Create/update start script
echo.
echo Aktualizacja skryptu startowego...
(
echo @echo off
echo title POLFLOR Print Agent
echo cd /d "%INSTALL_DIR%"
echo node dist/index.js
echo pause
) > start-agent.bat
echo [OK] start-agent.bat zaktualizowany

:: Verify
echo.
echo Weryfikacja instalacji...
node -e "try{require('puppeteer');console.log('[OK] Puppeteer dziala')}catch(e){console.log('[BLAD] Puppeteer:',e.message)}"

echo.
color 0A
echo ============================================
echo   NAPRAWA ZAKONCZONA
echo ============================================
echo.

set /p RUN="Uruchomic Print Agent teraz? (t/n): "
if /i "%RUN%"=="t" start "" start-agent.bat

pause
