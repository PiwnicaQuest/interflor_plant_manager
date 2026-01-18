/**
 * Printer Detector Service
 * Detects and categorizes system printers
 */

import { exec } from "child_process";
import { promisify } from "util";
import { PrinterInfo, PrinterCategory } from "../types";

const execAsync = promisify(exec);

// Keywords for thermal label printers
const LABEL_KEYWORDS = [
  "tsc", "zebra", "brother ql", "dymo", "godex", "sato", "citizen",
  "datamax", "intermec", "honeywell", "label", "barcode", "mx340"
];

// Keywords for thermal receipt printers
const RECEIPT_KEYWORDS = [
  "pos", "receipt", "epson tm", "star tsp", "bixolon", "sewoo",
  "thermal", "xprinter", "58mm", "80mm", "paragon"
];

class PrinterDetector {
  private printers: PrinterInfo[] = [];
  private lastDetection: number = 0;
  private cacheTimeout: number = 30000; // 30 seconds cache

  /**
   * Get all printers (with caching)
   */
  async getPrinters(forceRefresh: boolean = false): Promise<PrinterInfo[]> {
    const now = Date.now();
    if (!forceRefresh && this.printers.length > 0 && (now - this.lastDetection) < this.cacheTimeout) {
      return this.printers;
    }

    await this.detectPrinters();
    return this.printers;
  }

  /**
   * Detect all system printers
   */
  async detectPrinters(): Promise<void> {
    console.log("[PrinterDetector] Scanning for printers...");

    try {
      if (process.platform === "win32") {
        await this.detectWindowsPrinters();
      } else if (process.platform === "darwin") {
        await this.detectMacPrinters();
      } else {
        await this.detectLinuxPrinters();
      }

      this.lastDetection = Date.now();
      console.log(`[PrinterDetector] Found ${this.printers.length} printer(s)`);

    } catch (error) {
      console.error("[PrinterDetector] Detection error:", error);
    }
  }

  /**
   * Windows printer detection
   */
  private async detectWindowsPrinters(): Promise<void> {
    try {
      const { stdout } = await execAsync(
        "wmic printer get name,default,drivername,status /format:csv",
        { encoding: "utf-8" }
      );

      const lines = stdout.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) return;

      const header = lines[0].toLowerCase().split(",");
      const nameIdx = header.findIndex(h => h.trim() === "name");
      const defaultIdx = header.findIndex(h => h.trim() === "default");
      const driverIdx = header.findIndex(h => h.trim() === "drivername");

      this.printers = lines.slice(1)
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(",");
          const name = parts[nameIdx]?.trim() || "";
          const isDefault = parts[defaultIdx]?.trim().toUpperCase() === "TRUE";
          const driver = parts[driverIdx]?.trim();
          const category = this.categorizePrinter(name, driver);

          return {
            name,
            displayName: name,
            category,
            isDefault,
            isOnline: true,
            driver
          };
        })
        .filter(p => p.name.length > 0);

    } catch (error) {
      console.error("[PrinterDetector] Windows detection error:", error);
      this.printers = [];
    }
  }

  /**
   * macOS printer detection
   */
  private async detectMacPrinters(): Promise<void> {
    try {
      const { stdout } = await execAsync("lpstat -p -d 2>/dev/null || echo ");
      const lines = stdout.trim().split("\n");

      let defaultPrinter = "";
      const defaultMatch = stdout.match(/system default destination: (.+)/);
      if (defaultMatch) {
        defaultPrinter = defaultMatch[1].trim();
      }

      this.printers = lines
        .filter(line => line.startsWith("printer"))
        .map(line => {
          const match = line.match(/printer (\S+)/);
          const name = match ? match[1] : "";
          const isDefault = name === defaultPrinter;
          const isOnline = !line.includes("disabled");
          const category = this.categorizePrinter(name);

          return {
            name,
            displayName: name.replace(/_/g, " "),
            category,
            isDefault,
            isOnline
          };
        })
        .filter(p => p.name);

    } catch (error) {
      console.error("[PrinterDetector] macOS detection error:", error);
      this.printers = [];
    }
  }

  /**
   * Linux printer detection (CUPS)
   */
  private async detectLinuxPrinters(): Promise<void> {
    try {
      const { stdout } = await execAsync("lpstat -p -d 2>/dev/null || echo ");
      const lines = stdout.trim().split("\n");

      let defaultPrinter = "";
      const defaultMatch = stdout.match(/system default destination: (.+)/);
      if (defaultMatch) {
        defaultPrinter = defaultMatch[1].trim();
      }

      this.printers = lines
        .filter(line => line.startsWith("printer"))
        .map(line => {
          const match = line.match(/printer (\S+)/);
          const name = match ? match[1] : "";
          const isDefault = name === defaultPrinter;
          const isOnline = line.includes("idle") || line.includes("enabled");
          const category = this.categorizePrinter(name);

          return {
            name,
            displayName: name.replace(/_/g, " "),
            category,
            isDefault,
            isOnline
          };
        })
        .filter(p => p.name);

    } catch (error) {
      console.error("[PrinterDetector] Linux detection error:", error);
      this.printers = [];
    }
  }

  /**
   * Categorize printer based on name/driver
   */
  private categorizePrinter(name: string, driver?: string): PrinterCategory {
    const searchStr = `${name} ${driver || ""}`.toLowerCase();

    if (LABEL_KEYWORDS.some(kw => searchStr.includes(kw))) {
      return "thermal_label";
    }

    if (RECEIPT_KEYWORDS.some(kw => searchStr.includes(kw))) {
      return "thermal_receipt";
    }

    return "standard";
  }

  /**
   * Get printer by name
   */
  getPrinter(name: string): PrinterInfo | undefined {
    return this.printers.find(p => p.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Get printers by category
   */
  getPrintersByCategory(category: PrinterCategory): PrinterInfo[] {
    return this.printers.filter(p => p.category === category);
  }

  /**
   * Get default printer for category
   */
  getDefaultForCategory(category: PrinterCategory): PrinterInfo | undefined {
    const categoryPrinters = this.getPrintersByCategory(category);
    if (categoryPrinters.length > 0) {
      return categoryPrinters.find(p => p.isDefault) || categoryPrinters[0];
    }
    // Fallback to any default printer
    return this.printers.find(p => p.isDefault);
  }
}

export const printerDetector = new PrinterDetector();
