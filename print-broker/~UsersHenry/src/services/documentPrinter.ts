/**
 * Document Printer Service
 * Handles standard A4/A5 document printing (invoices, orders, reports)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { PrintRequest, PAPER_SIZES } from "../types";

const execAsync = promisify(exec);
const TEMP_DIR = path.join(os.tmpdir(), "print-broker");

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export async function printDocument(request: PrintRequest, printerName: string): Promise<void> {
  console.log(`[DocumentPrinter] Printing to ${printerName}`);

  const jobId = `doc-${Date.now()}`;
  const paperSize = request.paperSize || "A4";
  const copies = request.copies || 1;

  if (request.contentType === "html") {
    await printHtmlDocument(request.content, printerName, jobId, paperSize, copies);
  } else if (request.contentType === "pdf") {
    await printPdfDocument(request.content, printerName, jobId, copies);
  } else {
    throw new Error(`Unsupported content type: ${request.contentType}`);
  }
}

/**
 * Wrap HTML with CSS reset to ensure correct width and no offset
 */
function wrapHtmlWithReset(html: string, widthMm: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: ${widthMm}mm auto;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      max-width: ${widthMm}mm !important;
      background: white !important;
    }
    body {
      padding: 10mm !important;
      font-family: Arial, sans-serif;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
      border-collapse: collapse;
    }
    img {
      max-width: 100% !important;
    }
  </style>
</head>
<body>${html}</body>
</html>`;
}

async function printHtmlDocument(
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

    // Get paper dimensions
    const paper = PAPER_SIZES[paperSize] || PAPER_SIZES["A4"];

    // 96 DPI for screen rendering (standard)
    const widthPx = Math.round(paper.width * 96 / 25.4);
    const heightPx = Math.round(paper.height * 96 / 25.4);

    console.log(`[DocumentPrinter] Paper: ${paperSize} = ${paper.width}x${paper.height}mm = ${widthPx}x${heightPx}px`);

    await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 2 });

    // Wrap HTML with CSS reset
    const wrappedHtml = wrapHtmlWithReset(html, paper.width);
    await page.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });

    // Force white background
    await page.evaluate(() => {
      document.body.style.backgroundColor = "white";
      document.documentElement.style.backgroundColor = "white";
    });

    // Wait for rendering
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));

    // Generate PDF
    const pdfPath = path.join(TEMP_DIR, `${jobId}.pdf`);
    await page.pdf({
      path: pdfPath,
      format: paperSize as any,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
    });

    console.log(`[DocumentPrinter] PDF generated: ${pdfPath}`);

    // Print the PDF
    await sendToPrinter(pdfPath, printerName, copies);

    // Cleanup
    fs.unlinkSync(pdfPath);

  } finally {
    await browser.close();
  }
}

async function printPdfDocument(
  base64Content: string,
  printerName: string,
  jobId: string,
  copies: number
): Promise<void> {
  // Decode base64 PDF
  const pdfPath = path.join(TEMP_DIR, `${jobId}.pdf`);
  const pdfBuffer = Buffer.from(base64Content, "base64");
  fs.writeFileSync(pdfPath, pdfBuffer);

  try {
    await sendToPrinter(pdfPath, printerName, copies);
  } finally {
    fs.unlinkSync(pdfPath);
  }
}

async function sendToPrinter(filePath: string, printerName: string, copies: number): Promise<void> {
  if (process.platform === "win32") {
    try {
      const pdfToPrinter = await import("pdf-to-printer");
      await pdfToPrinter.print(filePath, { printer: printerName, copies });
    } catch (e) {
      // Fallback
      const printerArg = printerName ? `/d:"${printerName}"` : "";
      for (let i = 0; i < copies; i++) {
        await execAsync(`print ${printerArg} "${filePath}"`);
      }
    }
  } else {
    // macOS / Linux (CUPS)
    const printerArg = printerName ? `-P "${printerName}"` : "";
    await execAsync(`lpr ${printerArg} -# ${copies} "${filePath}"`);
  }

  console.log(`[DocumentPrinter] Sent to printer: ${printerName}`);
}
