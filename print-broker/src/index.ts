/**
 * PlantManager Print Broker - Entry Point
 */

import { PrintBrokerServer } from "./server";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

const UPDATE_SERVER = "https://pm.interflor.pl";
const LOCAL_VERSION_FILE = path.join(process.cwd(), "version.txt");
const UPDATE_FILES = [
  "printerDetector.js",
  "labelPrinter.js",
  "receiptPrinter.js",
  "tsplGenerator.js"
];

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = (mod as any).get(url, { timeout: 8000 }, (res: any) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error("HTTP " + res.statusCode));
      }
      let data = "";
      res.on("data", (chunk: string) => data += chunk);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = (mod as any).get(url, { timeout: 15000 }, (res: any) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error("HTTP " + res.statusCode));
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function checkForUpdates(): Promise<boolean> {
  try {
    console.log("[AutoUpdate] Sprawdzanie aktualizacji...");

    // Get remote version
    const remoteVersionStr = await fetchText(UPDATE_SERVER + "/downloads/version.txt");
    const remoteVersion = parseInt(remoteVersionStr.trim(), 10);

    // Get local version
    let localVersion = 0;
    try {
      if (fs.existsSync(LOCAL_VERSION_FILE)) {
        localVersion = parseInt(fs.readFileSync(LOCAL_VERSION_FILE, "utf-8").trim(), 10);
      }
    } catch {}

    console.log("[AutoUpdate] Wersja lokalna: " + localVersion + ", zdalna: " + remoteVersion);

    if (isNaN(remoteVersion) || remoteVersion <= localVersion) {
      console.log("[AutoUpdate] Brak aktualizacji.");
      return false;
    }

    // Skip auto-update if local version >= 10 (manual updates only)
    if (localVersion >= 10) {
      console.log("[AutoUpdate] Wersja >= 10, pomijanie auto-update (reczne aktualizacje).");
      return false;
    }

    // Download updated files
    console.log("[AutoUpdate] Pobieranie aktualizacji v" + remoteVersion + "...");
    const servicesDir = path.join(process.cwd(), "dist", "services");

    let updated = 0;
    for (const file of UPDATE_FILES) {
      try {
        const url = UPDATE_SERVER + "/downloads/" + file;
        const data = await fetchBuffer(url);
        const localPath = path.join(servicesDir, file);
        
        // Compare with existing
        let needsUpdate = true;
        if (fs.existsSync(localPath)) {
          const existing = fs.readFileSync(localPath);
          if (existing.equals(data)) {
            needsUpdate = false;
          }
        }

        if (needsUpdate) {
          fs.writeFileSync(localPath, data);
          updated++;
          console.log("[AutoUpdate]   Zaktualizowano: " + file);
        } else {
          console.log("[AutoUpdate]   Bez zmian: " + file);
        }
      } catch (e: any) {
        console.warn("[AutoUpdate]   Blad pobierania " + file + ": " + e.message);
      }
    }

    // Save new version
    fs.writeFileSync(LOCAL_VERSION_FILE, String(remoteVersion));

    if (updated > 0) {
      console.log("[AutoUpdate] Zaktualizowano " + updated + " plikow. Restartowanie...");
      return true;
    }
    
    console.log("[AutoUpdate] Wersja zaktualizowana, pliki bez zmian.");
    return false;
  } catch (e: any) {
    console.log("[AutoUpdate] Nie mozna sprawdzic aktualizacji: " + e.message);
    return false;
  }
}
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
  // Auto-update check
  const needsRestart = await checkForUpdates();
  if (needsRestart) {
    console.log("[PrintBroker] Pliki zaktualizowane - restartowanie za 2s...");
    setTimeout(() => {
      const { spawn } = require("child_process");
      const child = spawn(process.argv[0], process.argv.slice(1), {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      process.exit(0);
    }, 2000);
    return;
  }

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
