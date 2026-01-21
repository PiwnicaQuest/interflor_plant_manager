/**
 * Label Printer Service - PDF-based printing for TSC and other label printers
 * Uses PDF generation instead of TSPL bitmap to avoid sharp dependency
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { PrintRequest, PAPER_SIZES } from "../types";

const execAsync = promisify(exec);
const TEMP_DIR = path.join(os.tmpdir(), "print-broker");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export async function printLabel(request: PrintRequest, printerName: string): Promise<void> {
  console.log("[LabelPrinter] Printing to: " + printerName);

  const jobId = "label-" + Date.now();
  const paperSize = request.paperSize || "50x30mm";
  const copies = request.copies || 1;

  if (request.contentType === "html") {
    await printHtmlLabel(request.content, printerName, jobId, paperSize, copies);
  } else if (request.contentType === "pdf") {
    const pdfPath = path.join(TEMP_DIR, jobId + ".pdf");
    fs.writeFileSync(pdfPath, Buffer.from(request.content, "base64"));
    try {
      await sendPdfToPrinter(pdfPath, printerName, copies);
    } finally {
      try { fs.unlinkSync(pdfPath); } catch {}
    }
  } else {
    throw new Error("Unsupported content type: " + request.contentType);
  }
}

async function printHtmlLabel(
  html: string,
  printerName: string,
  jobId: string,
  paperSize: string,
  copies: number
): Promise<void> {
  const puppeteer = await import("puppeteer");

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const page = await browser.newPage();
    const paper = PAPER_SIZES[paperSize] || { width: 50, height: 30 };

    // Convert mm to pixels (96 DPI for screen)
    const widthPx = Math.round(paper.width * 96 / 25.4);
    const heightPx = Math.round(paper.height * 96 / 25.4);

    console.log("[LabelPrinter] Label: " + paper.width + "x" + paper.height + "mm = " + widthPx + "x" + heightPx + "px");

    await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 2 });

    // Wrap HTML with proper styling
    const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: ${paper.width}mm ${paper.height}mm;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: ${paper.width}mm;
      height: ${paper.height}mm;
      margin: 0;
      padding: 0;
      background: white !important;
      overflow: hidden;
    }
  </style>
</head>
<body>${html}</body>
</html>`;

    await page.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });

    // Force white background
    await page.evaluate(() => {
      document.body.style.backgroundColor = "white";
      document.documentElement.style.backgroundColor = "white";
    });

    // Wait for rendering
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));

    // Generate PDF with exact label size
    const pdfPath = path.join(TEMP_DIR, jobId + ".pdf");
    await page.pdf({
      path: pdfPath,
      width: paper.width + "mm",
      height: paper.height + "mm",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
    });

    console.log("[LabelPrinter] PDF generated: " + pdfPath);

    // Send to printer
    await sendPdfToPrinter(pdfPath, printerName, copies);

    // Cleanup
    try { fs.unlinkSync(pdfPath); } catch {}

  } finally {
    await browser.close();
  }
}

async function sendPdfToPrinter(pdfPath: string, printerName: string, copies: number): Promise<void> {
  if (process.platform === "win32") {
    try {
      // Try pdf-to-printer first (best quality)
      const pdfToPrinter = await import("pdf-to-printer");
      await pdfToPrinter.print(pdfPath, { 
        printer: printerName, 
        copies,
        scale: "fit" // Fit to page
      });
      console.log("[LabelPrinter] Sent via pdf-to-printer");
    } catch (e: any) {
      console.log("[LabelPrinter] pdf-to-printer failed: " + e.message + ", trying fallback...");
      
      // Fallback to Windows print command
      const printerArg = printerName ? `/d:"${printerName}"` : "";
      for (let i = 0; i < copies; i++) {
        await execAsync(`print ${printerArg} "${pdfPath}"`, { shell: "cmd.exe" });
      }
      console.log("[LabelPrinter] Sent via Windows print command");
    }
  } else {
    // macOS / Linux (CUPS)
    const printerArg = printerName ? `-P "${printerName}"` : "";
    await execAsync(`lpr ${printerArg} -# ${copies} "${pdfPath}"`);
    console.log("[LabelPrinter] Sent via lpr");
  }
}
