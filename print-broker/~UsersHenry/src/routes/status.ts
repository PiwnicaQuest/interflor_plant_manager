/**
 * Status Routes
 * Endpoints for checking broker status
 */

import { Router, Request, Response } from "express";
import * as os from "os";
import { printerDetector } from "../services/printerDetector";
import { BrokerStatus } from "../types";

const router = Router();
const startTime = Date.now();
const VERSION = "1.0.0";

/**
 * GET / - Basic status
 */
router.get("/", async (req: Request, res: Response) => {
  res.json({
    name: "PlantManager Print Broker",
    version: VERSION,
    status: "online"
  });
});

/**
 * GET /status - Detailed status
 */
router.get("/status", async (req: Request, res: Response) => {
  const printers = await printerDetector.getPrinters();
  
  const status: BrokerStatus = {
    online: true,
    version: VERSION,
    hostname: os.hostname(),
    platform: process.platform,
    printerCount: printers.length,
    uptime: Math.floor((Date.now() - startTime) / 1000)
  };

  res.json(status);
});

/**
 * GET /health - Health check for monitoring
 */
router.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;
