#!/bin/bash
# =============================================
# POLFLOR Print Broker - macOS Stop Script
# =============================================

echo "Stopping Print Broker..."

# Find and kill the process
PID=$(pgrep -f "node dist/index.js")

if [ -n "$PID" ]; then
    kill $PID 2>/dev/null
    sleep 1
    
    # Check if still running
    if pgrep -f "node dist/index.js" > /dev/null; then
        echo "Force stopping..."
        pkill -9 -f "node dist/index.js"
    fi
    
    echo "✓ Print Broker stopped"
else
    echo "Print Broker is not running"
fi
