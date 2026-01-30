#\!/bin/bash

# =============================================================================
# PrintBroker - Start Script
# =============================================================================

# Colors
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
NC="\033[0m"

INSTALL_DIR="$HOME/PrintBroker"
BROKER_PORT=19432

cd "$INSTALL_DIR" 2>/dev/null || cd "$(dirname "$0")"

echo ""
echo -e "${BLUE}🖨️  Starting PrintBroker...${NC}"
echo ""

# Check if already running
if curl -s "http://localhost:$BROKER_PORT/health" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  PrintBroker is already running\!${NC}"
    echo ""
    echo -e "  URL: http://localhost:$BROKER_PORT"
    echo ""
    read -p "Press Enter to close..."
    exit 0
fi

# Start the broker
if [ -f "dist/index.js" ]; then
    echo -e "${GREEN}Starting broker server...${NC}"
    echo ""
    node dist/index.js
else
    echo -e "${YELLOW}Compiling TypeScript first...${NC}"
    npm run build
    echo ""
    echo -e "${GREEN}Starting broker server...${NC}"
    echo ""
    node dist/index.js
fi
