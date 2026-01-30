#\!/bin/bash
# =============================================
# POLFLOR Print Broker - macOS Installer
# =============================================

# Colors
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
NC="\033[0m" # No Color

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   POLFLOR Print Broker - macOS Setup    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}Checking requirements...${NC}"

# Check if Node.js is installed
if \! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed\!${NC}"
    echo ""
    echo "Please install Node.js from: https://nodejs.org/"
    echo "Or via Homebrew: brew install node"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"

# Check if npm is installed
if \! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed\!${NC}"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✓ npm installed: $NPM_VERSION${NC}"

# Check if node_modules exists and has dependencies
echo ""
echo -e "${YELLOW}Checking dependencies...${NC}"

if [ \! -d "node_modules" ] || [ \! -d "node_modules/express" ]; then
    echo -e "${YELLOW}Installing dependencies (this may take a moment)...${NC}"
    npm install --production
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to install dependencies${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Make scripts executable
chmod +x start-macos.command 2>/dev/null
chmod +x start-background-macos.sh 2>/dev/null
chmod +x stop-macos.sh 2>/dev/null
chmod +x install-macos.sh 2>/dev/null

echo -e "${GREEN}✓ Scripts made executable${NC}"

# Fix systray permissions (common issue on macOS)
echo ""
echo -e "${YELLOW}Fixing system tray permissions...${NC}"
SYSTRAY_CACHE="$HOME/.cache/node-systray"
if [ -d "$SYSTRAY_CACHE" ]; then
    find "$SYSTRAY_CACHE" -name "tray_darwin*" -exec chmod +x {} \; 2>/dev/null
    echo -e "${GREEN}✓ System tray permissions fixed${NC}"
else
    echo -e "${YELLOW}\! System tray cache not found yet (will be created on first run)${NC}"
fi

# Test if Print Broker can start
echo ""
echo -e "${YELLOW}Testing Print Broker...${NC}"

# Start in background for test
node dist/index.js &
PID=$\!
sleep 3

# Fix systray permissions again after first run (cache may have been created)
if [ -d "$SYSTRAY_CACHE" ]; then
    find "$SYSTRAY_CACHE" -name "tray_darwin*" -exec chmod +x {} \; 2>/dev/null
fi

# Check if it is running
if ps -p $PID > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Print Broker started successfully${NC}"
    
    # Test HTTP endpoint
    RESPONSE=$(curl -s http://127.0.0.1:19432/status 2>/dev/null)
    if [ -n "$RESPONSE" ]; then
        echo -e "${GREEN}✓ HTTP server responding on port 19432${NC}"
    else
        echo -e "${YELLOW}\! HTTP server may need a moment to start${NC}"
    fi
    
    # Stop test instance
    kill $PID 2>/dev/null
    wait $PID 2>/dev/null
else
    echo -e "${YELLOW}\! Print Broker test had issues, but may still work${NC}"
    echo "  Try running manually: ./start-macos.command"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Installation Complete\!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}How to use:${NC}"
echo ""
echo "  Start Print Broker (with terminal):"
echo -e "    ${YELLOW}./start-macos.command${NC}"
echo ""
echo "  Start Print Broker (background, no terminal):"
echo -e "    ${YELLOW}./start-background-macos.sh${NC}"
echo ""
echo "  Stop Print Broker:"
echo -e "    ${YELLOW}./stop-macos.sh${NC}"
echo ""
echo -e "${BLUE}The Print Broker will run on:${NC} http://127.0.0.1:19432"
echo ""
