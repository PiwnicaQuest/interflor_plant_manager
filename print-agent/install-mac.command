#!/bin/bash

# PlantManager Print Agent - Instalator dla macOS

clear
echo "============================================"
echo "  PlantManager Print Agent - Instalator"
echo "============================================"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[BŁĄD] Node.js nie jest zainstalowany!"
    echo ""
    echo "Zainstaluj Node.js za pomocą Homebrew:"
    echo "  1. Zainstaluj Homebrew (jeśli nie masz):"
    echo "     /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo ""
    echo "  2. Zainstaluj Node.js:"
    echo "     brew install node"
    echo ""
    echo "Po instalacji uruchom ten skrypt ponownie."
    echo ""
    read -p "Naciśnij Enter aby zamknąć..."
    exit 1
fi

echo "[OK] Node.js znaleziony"
echo "    Wersja: $(node -v)"
echo ""

# Get server URL from user
read -p "Podaj adres serwera PlantManager (domyślnie: http://192.168.88.124:4000): " SERVER_URL
SERVER_URL=${SERVER_URL:-http://192.168.88.124:4000}

# Get agent name
DEFAULT_NAME=$(hostname)
read -p "Podaj nazwę tego komputera (domyślnie: $DEFAULT_NAME): " AGENT_NAME
AGENT_NAME=${AGENT_NAME:-$DEFAULT_NAME}

echo ""
echo "Konfiguracja:"
echo "  Serwer: $SERVER_URL"
echo "  Nazwa agenta: $AGENT_NAME"
echo ""

# Create .env file
echo "Tworzenie pliku konfiguracyjnego..."
cat > .env << EOF
SERVER_URL=$SERVER_URL
AGENT_NAME=$AGENT_NAME
POLL_INTERVAL=5000
HEARTBEAT_INTERVAL=30000
EOF
echo "[OK] Plik .env utworzony"
echo ""

# Install dependencies
echo "Instalowanie zależności (może to potrwać kilka minut)..."
npm install
if [ $? -ne 0 ]; then
    echo "[BŁĄD] Błąd podczas instalacji zależności"
    read -p "Naciśnij Enter aby zamknąć..."
    exit 1
fi
echo "[OK] Zależności zainstalowane"
echo ""

# Build
echo "Budowanie aplikacji..."
npm run build
if [ $? -ne 0 ]; then
    echo "[BŁĄD] Błąd podczas budowania"
    read -p "Naciśnij Enter aby zamknąć..."
    exit 1
fi
echo "[OK] Aplikacja zbudowana"
echo ""

# Create start script
echo "Tworzenie skryptu uruchomieniowego..."
cat > start-agent.command << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "============================================"
echo "  PlantManager Print Agent"
echo "============================================"
echo ""
node dist/index.js
EOF
chmod +x start-agent.command
echo "[OK] Utworzono start-agent.command"
echo ""

# Ask about login items
echo ""
read -p "Czy dodać do autostartu systemu macOS? (t/n): " ADD_STARTUP
if [[ "$ADD_STARTUP" =~ ^[Tt]$ ]]; then
    echo ""
    echo "Aby dodać do autostartu:"
    echo "  1. Otwórz: Ustawienia systemowe → Ogólne → Logowanie"
    echo "  2. Kliknij '+' i dodaj: $SCRIPT_DIR/start-agent.command"
    echo ""
fi

echo ""
echo "============================================"
echo "  INSTALACJA ZAKOŃCZONA POMYŚLNIE!"
echo "============================================"
echo ""
echo "Aby uruchomić Print Agent:"
echo "  1. Kliknij dwukrotnie na: start-agent.command"
echo "  2. Lub w terminalu: npm start"
echo ""
echo "Agent automatycznie wykryje drukarki i połączy"
echo "się z serwerem PlantManager."
echo ""

read -p "Czy uruchomić Print Agent teraz? (t/n): " RUN_NOW
if [[ "$RUN_NOW" =~ ^[Tt]$ ]]; then
    echo ""
    echo "Uruchamianie Print Agent..."
    open start-agent.command
fi

read -p "Naciśnij Enter aby zamknąć..."
