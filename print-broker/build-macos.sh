#\!/bin/bash

# =============================================================================
# PrintBroker - macOS Build Script
# Creates a distributable ZIP package for macOS (with all dependencies)
# =============================================================================

set -e

# Colors
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
BLUE="\033[0;34m"
NC="\033[0m"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_DIR="/tmp/PrintBroker-macOS-build"
OUTPUT_NAME="PrintBroker-macOS"
OUTPUT_ZIP="$OUTPUT_NAME.zip"
DOWNLOADS_DIR="/home/ubuntu/PlantManager/web-panel/dist/downloads"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Building PrintBroker macOS Package (Full)                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Clean and create build directory
echo -e "${BLUE}[1/7]${NC} Preparing build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/$OUTPUT_NAME"
echo -e "  ${GREEN}✓${NC} Build directory ready"

# Step 2: Copy source files
echo -e "${BLUE}[2/7]${NC} Copying source files..."

# Copy TypeScript source
cp -r "$SCRIPT_DIR/src" "$BUILD_DIR/$OUTPUT_NAME/"

# Copy config
cp -r "$SCRIPT_DIR/config" "$BUILD_DIR/$OUTPUT_NAME/" 2>/dev/null || mkdir -p "$BUILD_DIR/$OUTPUT_NAME/config"

# Copy package files
cp "$SCRIPT_DIR/package.json" "$BUILD_DIR/$OUTPUT_NAME/"
cp "$SCRIPT_DIR/package-lock.json" "$BUILD_DIR/$OUTPUT_NAME/" 2>/dev/null || true
cp "$SCRIPT_DIR/tsconfig.json" "$BUILD_DIR/$OUTPUT_NAME/"

echo -e "  ${GREEN}✓${NC} Source files copied"

# Step 3: Install dependencies
echo -e "${BLUE}[3/7]${NC} Installing npm dependencies..."
cd "$BUILD_DIR/$OUTPUT_NAME"
npm install --production=false
echo -e "  ${GREEN}✓${NC} Dependencies installed"

# Step 4: Compile TypeScript
echo -e "${BLUE}[4/7]${NC} Compiling TypeScript..."
npm run build
echo -e "  ${GREEN}✓${NC} TypeScript compiled"

# Step 5: Copy macOS scripts
echo -e "${BLUE}[5/7]${NC} Copying macOS scripts..."
cp "$SCRIPT_DIR/macos/install.command" "$BUILD_DIR/$OUTPUT_NAME/"
cp "$SCRIPT_DIR/macos/start.command" "$BUILD_DIR/$OUTPUT_NAME/"
cp "$SCRIPT_DIR/macos/stop.command" "$BUILD_DIR/$OUTPUT_NAME/"
cp "$SCRIPT_DIR/macos/uninstall.command" "$BUILD_DIR/$OUTPUT_NAME/"
cp "$SCRIPT_DIR/macos/README.md" "$BUILD_DIR/$OUTPUT_NAME/"

# Make scripts executable
chmod +x "$BUILD_DIR/$OUTPUT_NAME"/*.command

echo -e "  ${GREEN}✓${NC} macOS scripts copied"

# Step 6: Create ZIP
echo -e "${BLUE}[6/7]${NC} Creating ZIP package..."

cd "$BUILD_DIR"
zip -r "$OUTPUT_ZIP" "$OUTPUT_NAME" -x "*.DS_Store" -x "*__MACOSX*" -x "*.git*"

echo -e "  ${GREEN}✓${NC} ZIP created"

# Step 7: Copy to downloads directory
echo -e "${BLUE}[7/7]${NC} Deploying..."

mkdir -p "$DOWNLOADS_DIR"
cp "$BUILD_DIR/$OUTPUT_ZIP" "$DOWNLOADS_DIR/"
cp "$BUILD_DIR/$OUTPUT_ZIP" "$SCRIPT_DIR/"

# Get file size
SIZE=$(du -h "$DOWNLOADS_DIR/$OUTPUT_ZIP" | cut -f1)

echo -e "  ${GREEN}✓${NC} Copied to: $DOWNLOADS_DIR/$OUTPUT_ZIP"

# Cleanup
rm -rf "$BUILD_DIR"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Build Complete\!                                              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Package:${NC} $OUTPUT_ZIP"
echo -e "  ${BLUE}Size:${NC} $SIZE"
echo -e "  ${BLUE}Location:${NC} $DOWNLOADS_DIR/$OUTPUT_ZIP"
echo -e "  ${BLUE}URL:${NC} http://pm.polflor.wroclaw.pl/downloads/$OUTPUT_ZIP"
echo ""
