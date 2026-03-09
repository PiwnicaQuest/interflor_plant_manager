import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { BrokerConfig } from "../types";

const router = Router();

const CONFIG_DIR = path.join(os.homedir(), ".plantmanager");
const CONFIG_FILE = path.join(CONFIG_DIR, "print-broker.json");

const DEFAULT_CONFIG: BrokerConfig = {
  port: 19432,
  allowedOrigins: [
    "https://pm.interflor.pl",
    "https://pm.polflor.wroclaw.pl",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  defaultPrinters: {},
  autoStart: false
};

export function loadConfig(): BrokerConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const saved = JSON.parse(data);
      // Merge allowedOrigins: combine defaults + saved, deduplicate
      const mergedOrigins = [...new Set([
        ...DEFAULT_CONFIG.allowedOrigins,
        ...(saved.allowedOrigins || [])
      ])];
      return { ...DEFAULT_CONFIG, ...saved, allowedOrigins: mergedOrigins };
    }
  } catch (error) {
    console.error("[Config] Error loading config:", error);
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config: BrokerConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("[Config] Error saving config:", error);
    throw error;
  }
}

router.get("/", (req: Request, res: Response) => {
  const config = loadConfig();
  res.json({ success: true, config });
});

router.post("/", (req: Request, res: Response) => {
  try {
    const currentConfig = loadConfig();
    const newConfig: BrokerConfig = { ...currentConfig, ...req.body };
    saveConfig(newConfig);
    res.json({ success: true, message: "Configuration saved", config: newConfig });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/printer", (req: Request, res: Response) => {
  try {
    const { type, printer } = req.body;
    if (!type) {
      res.status(400).json({ success: false, error: "Missing type" });
      return;
    }
    const config = loadConfig();
    if (printer) {
      (config.defaultPrinters as any)[type] = printer;
    } else {
      // Empty printer = remove assignment (use auto-detect)
      delete (config.defaultPrinters as any)[type];
    }
    saveConfig(config);
    console.log("[Config] Printer for " + type + ": " + (printer || "(auto-detect)"));
    res.json({ success: true, message: printer ? "Default printer set" : "Printer assignment cleared" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/reset", (req: Request, res: Response) => {
  try {
    saveConfig(DEFAULT_CONFIG);
    res.json({ success: true, message: "Configuration reset", config: DEFAULT_CONFIG });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
