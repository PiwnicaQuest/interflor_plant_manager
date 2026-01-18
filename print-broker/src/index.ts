/**
 * PlantManager Print Broker - Entry Point
 * 
 * Local HTTP broker that enables direct printing from browser
 * Listens on localhost:19432 (configurable)
 */

import { PrintBrokerServer } from "./server";
import { printerDetector } from "./services/printerDetector";

async function main() {
  console.log("\n[PrintBroker] Starting PlantManager Print Broker...\n");

  // Detect printers first
  console.log("[PrintBroker] Detecting printers...");
  const printers = await printerDetector.getPrinters(true);
  
  if (printers.length === 0) {
    console.warn("[PrintBroker] WARNING: No printers detected!");
  } else {
    console.log(`[PrintBroker] Found ${printers.length} printer(s):\n`);
    printers.forEach(p => {
      const status = p.isOnline ? "✓" : "✗";
      const defaultMark = p.isDefault ? " (default)" : "";
      console.log(`  ${status} [${p.category.padEnd(14)}] ${p.displayName}${defaultMark}`);
    });
    console.log("");
  }

  // Start server
  const server = new PrintBrokerServer();
  
  try {
    await server.start();
  } catch (error: any) {
    console.error("[PrintBroker] Failed to start:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[PrintBroker] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[PrintBroker] Shutting down...");
  process.exit(0);
});

// Start
main().catch(error => {
  console.error("[PrintBroker] Fatal error:", error);
  process.exit(1);
});
