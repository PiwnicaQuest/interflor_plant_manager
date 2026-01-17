@echo off
title POLFLOR Print Agent - Diagnostyka
color 0E

echo ============================================
echo   POLFLOR Print Agent - DIAGNOSTYKA
echo ============================================
echo.

set INSTALL_DIR=%LOCALAPPDATA%\POLFLOR-PrintAgent

echo [1] Sprawdzanie Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo     BLAD: Node.js nie jest zainstalowany!
    goto :end
)
for /f "tokens=*" %%i in ('node -v') do echo     OK: Node.js %%i

echo.
echo [2] Sprawdzanie katalogu instalacji...
echo     Sciezka: %INSTALL_DIR%
if exist "%INSTALL_DIR%" (
    echo     OK: Katalog istnieje
) else (
    echo     BLAD: Katalog nie istnieje!
    goto :end
)

echo.
echo [3] Sprawdzanie plikow...
if exist "%INSTALL_DIR%\dist\index.js" (
    echo     OK: dist/index.js istnieje
) else (
    echo     BLAD: dist/index.js NIE istnieje!
)

if exist "%INSTALL_DIR%\index.js" (
    echo     UWAGA: index.js w glownym katalogu - to stara wersja!
)

if exist "%INSTALL_DIR%\package.json" (
    echo     OK: package.json istnieje
) else (
    echo     BLAD: package.json NIE istnieje!
)

if exist "%INSTALL_DIR%\node_modules" (
    echo     OK: node_modules istnieje
) else (
    echo     BLAD: node_modules NIE istnieje! npm install nie zostal uruchomiony
)

echo.
echo [4] Sprawdzanie puppeteer...
if exist "%INSTALL_DIR%\node_modules\puppeteer" (
    echo     OK: puppeteer zainstalowany
) else (
    echo     BLAD: puppeteer NIE jest zainstalowany!
)

echo.
echo [5] Sprawdzanie Chrome dla Puppeteer...
if exist "%USERPROFILE%\.cache\puppeteer" (
    echo     OK: Cache puppeteer istnieje
    dir /b "%USERPROFILE%\.cache\puppeteer" 2>nul
) else (
    echo     BLAD: Chrome dla Puppeteer nie zostal pobrany!
)

echo.
echo [6] Zawartosc katalogu instalacji:
dir /b "%INSTALL_DIR%"

echo.
echo [7] Zawartosc node_modules (jesli istnieje):
if exist "%INSTALL_DIR%\node_modules" (
    dir /b "%INSTALL_DIR%\node_modules" | find /c /v "" 
    echo     modulow zainstalowanych
)

echo.
echo ============================================
echo   KONIEC DIAGNOSTYKI
echo ============================================

:end
echo.
pause
