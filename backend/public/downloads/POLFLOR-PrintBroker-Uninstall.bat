@echo off
chcp 65001 >nul
title POLFLOR Print Broker - Deinstalator
color 0C

echo ========================================
echo   POLFLOR Print Broker - Deinstalator
echo ========================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\POLFLOR-PrintBroker"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "DESKTOP=%USERPROFILE%\Desktop"

echo Czy na pewno chcesz odinstalowac Print Broker?
echo.
set /p CONFIRM="Wpisz TAK aby kontynuowac: "
if /i not "%CONFIRM%"=="TAK" (
    echo Anulowano.
    pause
    exit /b 0
)

echo.
echo [1/4] Zatrzymywanie Print Broker...
taskkill /f /im node.exe /fi "WINDOWTITLE eq POLFLOR Print Broker*" >nul 2>&1
timeout /t 2 /nobreak >nul
echo    OK

echo.
echo [2/4] Usuwanie z autostartu...
if exist "%STARTUP%\POLFLOR Print Broker.lnk" (
    del "%STARTUP%\POLFLOR Print Broker.lnk"
)
echo    OK

echo.
echo [3/4] Usuwanie skrotu z pulpitu...
if exist "%DESKTOP%\POLFLOR Print Broker.lnk" (
    del "%DESKTOP%\POLFLOR Print Broker.lnk"
)
echo    OK

echo.
echo [4/4] Usuwanie plikow programu...
if exist "%INSTALL_DIR%" (
    rmdir /s /q "%INSTALL_DIR%"
)
echo    OK

echo.
color 0A
echo ========================================
echo   DEINSTALACJA ZAKONCZONA
echo ========================================
echo.
echo Print Broker zostal usuniety z systemu.
echo.
pause
