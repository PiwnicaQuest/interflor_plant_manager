# POLFLOR Print Agent - Instalator
# Uruchom jako Administrator: Right-click -> Run with PowerShell

$ErrorActionPreference = "Stop"
$InstallDir = "$env:LOCALAPPDATA\POLFLOR-PrintAgent"
$ServerUrl = "https://pm.polflor.wroclaw.pl"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  POLFLOR Print Agent - Instalator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Sprawdz Node.js
Write-Host "[1/5] Sprawdzanie Node.js..." -ForegroundColor Yellow
$nodeVersion = $null
try {
    $nodeVersion = node --version 2>$null
} catch {}

if (-not $nodeVersion) {
    Write-Host "Node.js nie znaleziony. Instaluje..." -ForegroundColor Yellow
    
    # Pobierz i zainstaluj Node.js
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    Write-Host "Pobieranie Node.js..." -ForegroundColor Gray
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi" -OutFile $nodeInstaller
    
    Write-Host "Instalowanie Node.js (moze wymagac uprawnien administratora)..." -ForegroundColor Gray
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart"
    Remove-Item $nodeInstaller -Force
    
    # Odswierz PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "Node.js zainstalowany\!" -ForegroundColor Green
} else {
    Write-Host "Node.js znaleziony: $nodeVersion" -ForegroundColor Green
}

# 2. Utworz katalog instalacji
Write-Host ""
Write-Host "[2/5] Tworzenie katalogu instalacji..." -ForegroundColor Yellow
if (Test-Path $InstallDir) {
    Write-Host "Usuwam stara instalacje..." -ForegroundColor Gray
    Remove-Item -Recurse -Force $InstallDir
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Write-Host "Katalog: $InstallDir" -ForegroundColor Green

# 3. Pobierz i rozpakuj agenta
Write-Host ""
Write-Host "[3/5] Pobieranie Print Agent..." -ForegroundColor Yellow
$zipFile = "$env:TEMP\print-agent.zip"
Invoke-WebRequest -Uri "$ServerUrl/downloads/print-agent.zip" -OutFile $zipFile
Expand-Archive -Path $zipFile -DestinationPath $InstallDir -Force
Remove-Item $zipFile -Force
Write-Host "Pobrano i rozpakowano\!" -ForegroundColor Green

# 4. Konfiguracja
Write-Host ""
Write-Host "[4/5] Konfiguracja..." -ForegroundColor Yellow

$agentName = Read-Host "Podaj nazwe tego komputera/agenta (np. Biuro-PC1)"
if ([string]::IsNullOrWhiteSpace($agentName)) {
    $agentName = $env:COMPUTERNAME
}

$envContent = @"
SERVER_URL=$ServerUrl
AGENT_NAME=$agentName
POLL_INTERVAL=3000
"@

$envContent | Out-File -FilePath "$InstallDir\print-agent\.env" -Encoding UTF8
Write-Host "Konfiguracja zapisana\!" -ForegroundColor Green

# 5. Instalacja zaleznosci
Write-Host ""
Write-Host "[5/5] Instalacja zaleznosci (moze potrwac kilka minut)..." -ForegroundColor Yellow
Set-Location "$InstallDir\print-agent"
npm install --production 2>$null
Write-Host "Zaleznosci zainstalowane\!" -ForegroundColor Green

# 6. Utworz skrot na pulpicie
Write-Host ""
Write-Host "Tworzenie skrotu na pulpicie..." -ForegroundColor Yellow
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\POLFLOR Print Agent.lnk")
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/k cd /d `"$InstallDir\print-agent`" && node dist/index.js"
$Shortcut.WorkingDirectory = "$InstallDir\print-agent"
$Shortcut.Description = "POLFLOR Print Agent"
$Shortcut.Save()
Write-Host "Skrot utworzony na pulpicie\!" -ForegroundColor Green

# Gotowe
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  INSTALACJA ZAKONCZONA\!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Aby uruchomic agenta:" -ForegroundColor Cyan
Write-Host "  1. Kliknij dwukrotnie skrot POLFLOR Print Agent na pulpicie" -ForegroundColor White
Write-Host "  2. Lub uruchom: cd $InstallDir\print-agent && node dist/index.js" -ForegroundColor White
Write-Host ""
Write-Host "Agent polaczysie z serwerem i bedzie gotowy do druku\!" -ForegroundColor Cyan
Write-Host ""

# Zapytaj czy uruchomic
$run = Read-Host "Czy uruchomic agenta teraz? (T/N)"
if ($run -eq "T" -or $run -eq "t") {
    Write-Host "Uruchamiam agenta..." -ForegroundColor Yellow
    node dist/index.js
}
