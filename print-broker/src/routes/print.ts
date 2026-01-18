import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { printerDetector } from "../services/printerDetector";
import { printDocument } from "../services/documentPrinter";
import { printLabel } from "../services/labelPrinter";
import { printReceipt } from "../services/receiptPrinter";
import { PrintRequest, PrintResponse, DOC_TYPE_TO_CATEGORY } from "../types";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const jobId = uuidv4().substring(0, 8);

  try {
    const request: PrintRequest = req.body;

    if (!request.content) {
      res.status(400).json({ success: false, error: "Missing content" } as PrintResponse);
      return;
    }

    if (!request.documentType) {
      res.status(400).json({ success: false, error: "Missing documentType" } as PrintResponse);
      return;
    }

    const printerName = await resolvePrinter(request);
    if (!printerName) {
      res.status(400).json({ success: false, error: "No suitable printer found" } as PrintResponse);
      return;
    }

    console.log("[Print] Job " + jobId + ": " + request.documentType + " -> " + printerName);

    const category = DOC_TYPE_TO_CATEGORY[request.documentType] || "standard";

    switch (category) {
      case "thermal_label":
        await printLabel(request, printerName);
        break;
      case "thermal_receipt":
        await printReceipt(request, printerName);
        break;
      default:
        await printDocument(request, printerName);
    }

    const duration = Date.now() - startTime;
    console.log("[Print] Job " + jobId + ": Completed in " + duration + "ms");

    res.json({ success: true, message: "Print job sent successfully", jobId } as PrintResponse);

  } catch (error: any) {
    console.error("[Print] Job " + jobId + ": Failed -", error.message);
    res.status(500).json({ success: false, error: error.message, jobId } as PrintResponse);
  }
});

router.post("/label", async (req: Request, res: Response) => {
  const jobId = uuidv4().substring(0, 8);

  try {
    const request: PrintRequest = {
      ...req.body,
      documentType: "label",
      contentType: req.body.contentType || "html"
    };

    const printerName = await resolvePrinter(request);
    if (!printerName) {
      res.status(400).json({ success: false, error: "No label printer found" });
      return;
    }

    await printLabel(request, printerName);
    res.json({ success: true, message: "Label sent", jobId });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, jobId });
  }
});

router.post("/receipt", async (req: Request, res: Response) => {
  const jobId = uuidv4().substring(0, 8);

  try {
    const request: PrintRequest = {
      ...req.body,
      documentType: "receipt",
      contentType: req.body.contentType || "html"
    };

    const printerName = await resolvePrinter(request);
    if (!printerName) {
      res.status(400).json({ success: false, error: "No receipt printer found" });
      return;
    }

    await printReceipt(request, printerName);
    res.json({ success: true, message: "Receipt sent", jobId });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, jobId });
  }
});

router.post("/document", async (req: Request, res: Response) => {
  const jobId = uuidv4().substring(0, 8);

  try {
    const request: PrintRequest = {
      ...req.body,
      documentType: req.body.documentType || "invoice",
      contentType: req.body.contentType || "html"
    };

    const printerName = await resolvePrinter(request);
    if (!printerName) {
      res.status(400).json({ success: false, error: "No document printer found" });
      return;
    }

    await printDocument(request, printerName);
    res.json({ success: true, message: "Document sent", jobId });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, jobId });
  }
});

async function resolvePrinter(request: PrintRequest): Promise<string | null> {
  if (request.printer) {
    const printer = printerDetector.getPrinter(request.printer);
    if (printer) return printer.name;
  }

  const category = DOC_TYPE_TO_CATEGORY[request.documentType] || "standard";
  const printers = await printerDetector.getPrinters();
  const defaultPrinter = printerDetector.getDefaultForCategory(category);

  if (defaultPrinter) return defaultPrinter.name;

  if (printers.length > 0) {
    const defaultAny = printers.find(p => p.isDefault);
    return defaultAny?.name || printers[0].name;
  }

  return null;
}

export default router;
