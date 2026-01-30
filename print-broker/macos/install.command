#!/bin/bash

# =============================================================================
# PrintBroker - macOS Installer
# Polflor Plant Management System
# =============================================================================

set -e

# Colors for output
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
NC="\033[0m" # No Color

# Configuration
INSTALL_DIR="$HOME/PrintBroker"
BROKER_PORT=19432
LAUNCHAGENT_NAME="com.polflor.printbroker"
LAUNCHAGENT_DIR="$HOME/Library/LaunchAgents"
LAUNCHAGENT_PLIST="$LAUNCHAGENT_DIR/$LAUNCHAGENT_NAME.plist"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║   ${GREEN}PrintBroker - macOS Installer${BLUE}                              ║${NC}"
echo -e "${BLUE}║   ${NC}Polflor Plant Management System${BLUE}                              ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check Node.js
echo -e "${BLUE}[1/5]${NC} Checking Node.js installation..."

if command_exists node; then
    NODE_VERSION=$(node -v)
    echo -e "  ${GREEN}✓${NC} Node.js found: $NODE_VERSION"
else
    echo -e "  ${RED}✗${NC} Node.js not found"
    echo ""
    echo -e "  ${YELLOW}Please install Node.js first:${NC}"
    echo -e "  1. Download from: https://nodejs.org/"
    echo -e "  2. Or install via Homebrew: brew install node"
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

# Step 2: Create installation directory
echo -e "${BLUE}[2/5]${NC} Creating installation directory..."

if [ -d "$INSTALL_DIR" ]; then
    echo -e "  ${YELLOW}⚠${NC} Directory exists, backing up..."
    mv "$INSTALL_DIR" "$INSTALL_DIR.backup.$(date +%Y%m%d%H%M%S)"
fi

mkdir -p "$INSTALL_DIR"
echo -e "  ${GREEN}✓${NC} Created: $INSTALL_DIR"

# Step 3: Copy all files (including node_modules and dist)
echo -e "${BLUE}[3/5]${NC} Copying files..."

# Copy everything from package directory
cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"

# Make scripts executable
chmod +x "$INSTALL_DIR"/*.command 2>/dev/null || true

# Create logs directory
mkdir -p "$INSTALL_DIR/logs"

echo -e "  ${GREEN}✓${NC} Files copied"

# Step 4: Setup LaunchAgent for auto-start
echo -e "${BLUE}[4/5]${NC} Setting up auto-start..."

mkdir -p "$LAUNCHAGENT_DIR"

# Find correct node path
NODE_PATH=$(which node)

cat > "$LAUNCHAGENT_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LAUNCHAGENT_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$INSTALL_DIR/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/logs/broker.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/logs/broker-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
EOF

echo -e "  ${GREEN}✓${NC} LaunchAgent created"

# Load LaunchAgent
launchctl unload "$LAUNCHAGENT_PLIST" 2>/dev/null || true
launchctl load "$LAUNCHAGENT_PLIST"

echo -e "  ${GREEN}✓${NC} LaunchAgent loaded"

# Step 5: Verify
echo -e "${BLUE}[5/5]${NC} Starting PrintBroker..."

# Wait for service to start
sleep 3

# Check if broker is running
if curl -s "http://localhost:$BROKER_PORT/health" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} PrintBroker is running!"
else
    echo -e "  ${YELLOW}⚠${NC} Starting manually..."
    cd "$INSTALL_DIR"
    node dist/index.js &
    sleep 2
    if curl -s "http://localhost:$BROKER_PORT/health" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} PrintBroker is running!"
    else
        echo -e "  ${RED}✗${NC} Could not start PrintBroker"
        echo -e "  Please check logs at: $INSTALL_DIR/logs/"
    fi
fi

# Create desktop shortcut
DESKTOP_ALIAS="$HOME/Desktop/PrintBroker Start.command"
cat > "$DESKTOP_ALIAS" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
./start.command
EOF
chmod +x "$DESKTOP_ALIAS"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║   Installation Complete!                                       ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Installation directory:${NC} $INSTALL_DIR"
echo -e "  ${BLUE}Broker URL:${NC} http://localhost:$BROKER_PORT"
echo ""
echo -e "  ${YELLOW}Commands:${NC}"
echo -e "    Start:     $INSTALL_DIR/start.command"
echo -e "    Stop:      $INSTALL_DIR/stop.command"
echo -e "    Uninstall: $INSTALL_DIR/uninstall.command"
echo ""
echo -e "  ${YELLOW}Test the broker:${NC}"
echo -e "    curl http://localhost:$BROKER_PORT/health"
echo ""
echo -e "  ${GREEN}PrintBroker will start automatically when you log in.${NC}"
echo ""

# Keep terminal open
read -p "Press Enter to close this window..."
