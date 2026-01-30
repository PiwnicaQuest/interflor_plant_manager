#!/bin/bash
# Build release package for POLFLOR Print Broker

echo "==================================="
echo "  Building Print Broker Release"
echo "==================================="
echo

cd "$(dirname "$0")"

# 1. Build TypeScript
echo "[1/4] Compiling TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi
echo "OK"

# 2. Create release directory
echo "[2/4] Preparing release files..."
rm -rf release
mkdir -p release

# Copy necessary files
cp -r dist release/
cp package.json release/
cp -r config release/

# Create minimal package.json for production
cat > release/package.json << PKGJSON
{
  "name": "plantmanager-print-broker",
  "version": "1.0.0",
  "description": "Local Print Broker for PlantManager",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "pdf-to-printer": "^5.3.0",
    "puppeteer": "^21.5.0",
    "uuid": "^9.0.0",
    "sharp": "^0.33.0"
  }
}
PKGJSON
echo "OK"

# 3. Create ZIP
echo "[3/4] Creating ZIP archive..."
cd release
zip -r ../print-broker.zip . -x "*.map"
cd ..
echo "OK"

# 4. Copy to web-panel downloads
echo "[4/4] Copying to web-panel/public/downloads..."
cp print-broker.zip ../web-panel/public/downloads/
cp installer/POLFLOR-PrintBroker-Installer.bat ../web-panel/public/downloads/
cp installer/POLFLOR-PrintBroker-Uninstall.bat ../web-panel/public/downloads/
echo "OK"

# Cleanup
rm -rf release

echo
echo "==================================="
echo "  Release build complete!"
echo "==================================="
echo
echo "Files created:"
echo "  - print-broker.zip"
echo "  - web-panel/public/downloads/print-broker.zip"
echo "  - web-panel/public/downloads/POLFLOR-PrintBroker-Installer.bat"
echo "  - web-panel/public/downloads/POLFLOR-PrintBroker-Uninstall.bat"
echo
