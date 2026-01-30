/**
 * PlantManager Print Broker - Entry Point
 */

import { PrintBrokerServer } from "./server";
import { printerDetector } from "./services/printerDetector";

// System tray icon (base64 encoded 16x16 PNG - printer icon)
const TRAY_ICON_BASE64 = `iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEeSURBVDiNpZOxSgNBEIa/uVwhIoKFjY2FhY2NvoCFj2Bh4QvYWFj4CBY+gIWFhYWFRSoLCwsLCwsLG0EQBBHEwuLuLMbdy8XEBPzh2J2Z/5+d3V3xn6XqsA/sAdtAC2gCj8At8AB0gCrQAS6BvhSVmQ0Bg6ADnAHTQFbLFHACvAOPwBKwCOSFg8PAMnAEvAC3wBbQAGaBM+AaeBKR97KEJrAKHAPXwCWwDjSAGWABOAcuROQtDxQFNoAT4Ao4B9aBBjALLAIXwLmIfBYDGsAqcApcAefAOtAAZoFFoC0i3TxQFNgEToEr4AxYB5rAHLAEtEWkVwyoA+vAGXANnAPrQAuYB5aBtoj0hwM14BC4AW6AS2ANaAMLwArQFpH+b/0ADIJQdwxKZ+wAAAAASUVORK5CYII=`;

let systray: any = null;
let systrayFailed = false;

// Handle uncaught exceptions
process.on("uncaughtException", (error: any) => {
  if (error.path && (error.path.includes("systray") || error.path.includes("tray_"))) {
    if (!systrayFailed) {
      systrayFailed = true;
      console.log("[PrintBroker] System tray failed (permission issue)");
      console.log("[PrintBroker] Running without tray - use Ctrl+C to exit\n");
    }
    systray = null;
    return;
  }
  console.error("[PrintBroker] Uncaught exception:", error);
  process.exit(1);
});

async function setupSystemTray(server: PrintBrokerServer) {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    console.log("[PrintBroker] System tray not supported on this platform");
    return;
  }

  if (systrayFailed) {
    return;
  }

  try {
    console.log("[PrintBroker] Loading systray module...");
    const SysTray = (await import("systray2")).default;
    
    console.log("[PrintBroker] Creating system tray...");

    systray = new SysTray({
      menu: {
        icon: TRAY_ICON_BASE64,
        isTemplateIcon: process.platform === "darwin",
        title: "",
        tooltip: "PlantManager Print Broker",
        items: [
          {
            title: "Print Broker - Aktywny",
            tooltip: "Serwer dziala na porcie 19432",
            enabled: false
          },
          {
            title: "Port: 19432",
            tooltip: "Localhost port",
            enabled: false
          },
          SysTray.separator,
          {
            title: "Zamknij",
            tooltip: "Zamknij Print Broker",
            enabled: true
          }
        ]
      },
      debug: false,
      copyDir: true
    });

    systray.onClick((action: any) => {
      if (action.seq_id === 3) {
        console.log("[PrintBroker] Zamykanie...");
        if (systray) systray.kill(false);
        process.exit(0);
      }
    });

    // Wait for tray to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log("[PrintBroker] System tray ready (check system tray area)");

  } catch (error: any) {
    console.log("[PrintBroker] System tray error:", error.message);
    console.log("[PrintBroker] Running in console mode (Ctrl+C to exit)");
    systray = null;
  }
}

async function main() {
  console.log("\n===========================================");
  console.log("  PlantManager Print Broker");
  console.log("  Port: 19432");
  console.log("===========================================\n");

  // Detect printers
  console.log("[PrintBroker] Wykrywanie drukarek...");
  const printers = await printerDetector.getPrinters(true);
  
  if (printers.length === 0) {
    console.warn("[PrintBroker] UWAGA: Nie wykryto drukarek!");
  } else {
    console.log("[PrintBroker] Znaleziono " + printers.length + " drukarek:\n");
    printers.forEach(p => {
      const status = p.isOnline ? "OK" : "--";
      const defaultMark = p.isDefault ? " (domyslna)" : "";
      console.log("  [" + status + "] " + p.displayName + defaultMark);
    });
    console.log("");
  }

  // Start server
  const server = new PrintBrokerServer();
  
  try {
    await server.start();
    
    // Setup system tray
    await setupSystemTray(server);
    
    console.log("\n[PrintBroker] Gotowy do drukowania!");
    console.log("[PrintBroker] Ikona w zasobniku systemowym (przy zegarze)");
    console.log("[PrintBroker] Lub nacisnij Ctrl+C aby zamknac\n");
    
  } catch (error: any) {
    console.error("[PrintBroker] Blad startu:", error.message);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  console.log("\n[PrintBroker] Zamykanie...");
  if (systray) systray.kill(false);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[PrintBroker] Zamykanie...");
  if (systray) systray.kill(false);
  process.exit(0);
});

main().catch(error => {
  console.error("[PrintBroker] Fatal error:", error);
  process.exit(1);
});
