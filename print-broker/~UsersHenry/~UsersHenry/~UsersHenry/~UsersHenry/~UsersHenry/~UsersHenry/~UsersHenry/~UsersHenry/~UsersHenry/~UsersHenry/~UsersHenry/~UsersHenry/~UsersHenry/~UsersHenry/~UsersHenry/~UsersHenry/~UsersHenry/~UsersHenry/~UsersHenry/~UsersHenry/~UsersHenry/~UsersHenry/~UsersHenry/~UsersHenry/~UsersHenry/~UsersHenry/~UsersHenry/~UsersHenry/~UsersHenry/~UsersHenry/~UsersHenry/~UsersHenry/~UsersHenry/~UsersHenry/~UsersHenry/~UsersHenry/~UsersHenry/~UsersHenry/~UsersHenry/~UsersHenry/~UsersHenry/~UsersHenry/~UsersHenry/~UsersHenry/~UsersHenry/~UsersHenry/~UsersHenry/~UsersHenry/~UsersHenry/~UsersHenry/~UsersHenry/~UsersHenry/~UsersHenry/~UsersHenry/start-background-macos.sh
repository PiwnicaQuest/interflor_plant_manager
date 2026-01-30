#!/bin/bash
# =============================================
# POLFLOR Print Broker - macOS Background Starter
# =============================================

cd "$(dirname "$0")"

# Check if already running
if pgrep -f "node dist/index.js" > /dev/null; then
    echo "Print Broker is already running!"
    echo "To restart, first run: ./stop-macos.sh"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Dependencies not installed. Run ./install-macos.sh first"
    exit 1
fi

# Start Print Broker
echo "Starting Print Broker..."
nohup node dist/index.js > /tmp/print-broker.log 2>&1 &
PID=$!

# Wait for startup
sleep 2

if ps -p $PID > /dev/null 2>&1; then
    echo "✓ Print Broker started successfully!"
    echo "  PID: $PID"
    echo "  Port: 19432"
    echo "  Log: /tmp/print-broker.log"
    echo ""
    echo "The menu bar icon should appear shortly."
    echo "To stop: ./stop-macos.sh"
else
    echo "✗ Failed to start Print Broker"
    echo "Check /tmp/print-broker.log for errors"
    exit 1
fi
