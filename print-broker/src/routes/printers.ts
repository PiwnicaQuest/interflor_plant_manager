/**
 * Printers Routes
 * Endpoints for printer management
 */

import { Router, Request, Response } from "express";
import { printerDetector } from "../services/printerDetector";

const router = Router();

/**
 * GET /printers - List all printers
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const refresh = req.query.refresh === "true";
    const printers = await printerDetector.getPrinters(refresh);

    res.json({
      success: true,
      printers: printers.map(p => ({
        name: p.name,
        displayName: p.displayName,
        category: p.category,
        isDefault: p.isDefault,
        isOnline: p.isOnline
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /printers/:name - Get specific printer info
 */
router.get("/:name", async (req: Request, res: Response) => {
  try {
    const printers = await printerDetector.getPrinters();
    const printer = printers.find(p => p.name.toLowerCase() === req.params.name.toLowerCase());

    if (!printer) {
      return res.status(404).json({
        success: false,
        error: "Printer not found"
      });
    }

    res.json({
      success: true,
      printer
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /printers/category/:category - Get printers by category
 */
router.get("/category/:category", async (req: Request, res: Response) => {
  try {
    const printers = await printerDetector.getPrinters();
    const filtered = printers.filter(p => p.category === req.params.category);

    res.json({
      success: true,
      printers: filtered
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
