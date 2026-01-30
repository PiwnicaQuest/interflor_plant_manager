# PrintBroker for macOS

## Quick Start

1. **Install**: Double-click `install.command`
2. **Test**: Open browser to http://localhost:19432/health

## Files

- `install.command` - Full installer (installs Node.js if needed)
- `start.command` - Start the broker manually
- `stop.command` - Stop the broker
- `uninstall.command` - Remove PrintBroker

## Features

- Automatic Node.js installation (via Homebrew or direct download)
- Auto-start on login (LaunchAgent)
- TSC printer support on TCP port 9100

## Requirements

- macOS 10.15 or later
- Internet connection for installation

## Troubleshooting

### Check if running
Open Terminal and run: curl http://localhost:19432/health

### View logs
Open Terminal and run: cat ~/PrintBroker/logs/broker.log

### Restart service
Open Terminal and run:
  launchctl unload ~/Library/LaunchAgents/com.polflor.printbroker.plist
  launchctl load ~/Library/LaunchAgents/com.polflor.printbroker.plist

## Support

Contact: support@polflor.pl
