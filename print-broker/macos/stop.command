#\!/bin/bash

# =============================================================================
# PrintBroker - Stop Script
# =============================================================================

# Colors
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
NC="\033[0m"

LAUNCHAGENT_NAME="com.polflor.printbroker"
LAUNCHAGENT_PLIST="$HOME/Library/LaunchAgents/$LAUNCHAGENT_NAME.plist"
BROKER_PORT=19432

echo ""
echo -e "${BLUE}🛑 Stopping PrintBroker...${NC}"
echo ""

# Unload LaunchAgent if exists
if [ -f "$LAUNCHAGENT_PLIST" ]; then
    launchctl unload "$LAUNCHAGENT_PLIST" 2>/dev/null
    echo -e "  ${GREEN}✓${NC} LaunchAgent stopped"
fi

# Kill any running node processes for print-broker
pkill -f "PrintBroker/dist/index.js" 2>/dev/null || true
pkill -f "print-broker/dist/index.js" 2>/dev/null || true

# Verify
sleep 1
if curl -s "http://localhost:$BROKER_PORT/health" > /dev/null 2>&1; then
    echo -e "  ${YELLOW}⚠️  PrintBroker may still be running${NC}"
    echo -e "  Attempting force kill..."
    lsof -ti:$BROKER_PORT | xargs kill -9 2>/dev/null || true
else
    echo -e "  ${GREEN}✓${NC} PrintBroker stopped successfully"
fi

echo ""
read -p "Press Enter to close..."
