#\!/bin/bash

# =============================================================================
# PrintBroker - Uninstaller
# =============================================================================

# Colors
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
NC="\033[0m"

INSTALL_DIR="$HOME/PrintBroker"
LAUNCHAGENT_NAME="com.polflor.printbroker"
LAUNCHAGENT_PLIST="$HOME/Library/LaunchAgents/$LAUNCHAGENT_NAME.plist"

echo ""
echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                                                                ║${NC}"
echo -e "${RED}║   🗑️  PrintBroker - Uninstaller                                ║${NC}"
echo -e "${RED}║                                                                ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

read -p "Are you sure you want to uninstall PrintBroker? (y/N) " -n 1 -r
echo ""

if [[ \! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uninstallation cancelled.${NC}"
    read -p "Press Enter to close..."
    exit 0
fi

echo ""
echo -e "${BLUE}[1/4]${NC} Stopping PrintBroker..."

# Stop LaunchAgent
if [ -f "$LAUNCHAGENT_PLIST" ]; then
    launchctl unload "$LAUNCHAGENT_PLIST" 2>/dev/null
    echo -e "  ${GREEN}✓${NC} LaunchAgent stopped"
fi

# Kill processes
pkill -f "PrintBroker/dist/index.js" 2>/dev/null || true
pkill -f "print-broker/dist/index.js" 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Processes terminated"

echo -e "${BLUE}[2/4]${NC} Removing LaunchAgent..."

if [ -f "$LAUNCHAGENT_PLIST" ]; then
    rm "$LAUNCHAGENT_PLIST"
    echo -e "  ${GREEN}✓${NC} LaunchAgent removed"
else
    echo -e "  ${YELLOW}⚠${NC} LaunchAgent not found"
fi

echo -e "${BLUE}[3/4]${NC} Removing installation directory..."

if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo -e "  ${GREEN}✓${NC} Installation directory removed"
else
    echo -e "  ${YELLOW}⚠${NC} Installation directory not found"
fi

echo -e "${BLUE}[4/4]${NC} Removing desktop shortcut..."

DESKTOP_SHORTCUT="$HOME/Desktop/PrintBroker Start.command"
if [ -f "$DESKTOP_SHORTCUT" ]; then
    rm "$DESKTOP_SHORTCUT"
    echo -e "  ${GREEN}✓${NC} Desktop shortcut removed"
else
    echo -e "  ${YELLOW}⚠${NC} Desktop shortcut not found"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║   ✅ PrintBroker has been uninstalled successfully\!            ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

read -p "Press Enter to close..."
