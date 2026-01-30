/**
 * Receipt Printer Service
 * Handles thermal receipt printing (POS receipts, 58mm/80mm)
 * Uses PDF generation for high quality output
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

export async function printReceipt(request: PrintRequest, printerName: string): Promise<void> {
  console.log(`[ReceiptPrinter] Printing to ${printerName}`);

  const jobId = `receipt-${Date.now()}`;
  const paperSize = request.paperSize || "80mm";
  const copies = request.copies || 1;

  if (request.contentType === "html") {
    await printHtmlReceipt(request.content, printerName, jobId, paperSize, copies);
  } else if (request.contentType === "raw") {
    await printRawReceipt(request.content, printerName, copies);
  } else {
    throw new Error(`Unsupported content type for receipts: ${request.contentType}`);
  }
}

/**
 * Print HTML receipt by converting to PDF for high quality
 */
async function printHtmlReceipt(
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

    // Receipt width (58mm or 80mm paper)
    const paper = PAPER_SIZES[paperSize] || { width: 80, height: 297 };
    const widthMm = paper.width;

    // Convert mm to pixels for viewport (96 DPI standard)
    const widthPx = Math.round(widthMm * 96 / 25.4);

    console.log(`[ReceiptPrinter] Paper: ${widthMm}mm = ${widthPx}px`);

    // Set viewport - tall for variable content
    await page.setViewport({ width: widthPx, height: 2000, deviceScaleFactor: 2 });

    // Set content
    await page.setContent(html, { waitUntil: ["load", "networkidle0"], timeout: 30000 });

    // Force white background
    await page.evaluate(() => {
      document.body.style.backgroundColor = "white";
      document.documentElement.style.backgroundColor = "white";
    });

    // Wait for rendering
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));

    // Get actual content height
    const contentHeight = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      return Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      );
    });

    // Convert content height to mm
    const heightMm = Math.ceil(contentHeight * 25.4 / 96) + 5; // Add 5mm padding

    console.log(`[ReceiptPrinter] Content height: ${contentHeight}px = ${heightMm}mm`);

    // Generate PDF with exact paper size
    const pdfPath = path.join(TEMP_DIR, `${jobId}.pdf`);
    await page.pdf({
      path: pdfPath,
      width: `${widthMm}mm`,
      height: `${heightMm}mm`,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
    });

    console.log(`[ReceiptPrinter] PDF generated: ${pdfPath}`);

    // Send to printer
    await sendReceiptToPrinter(pdfPath, printerName, copies);

    // Cleanup
    fs.unlinkSync(pdfPath);

  } finally {
    await browser.close();
  }
}

/**
 * Print raw ESC/POS commands
 */
async function printRawReceipt(rawData: string, printerName: string, copies: number): Promise<void> {
  const tempFile = path.join(TEMP_DIR, `raw-${Date.now()}.bin`);

  // Handle base64 or plain text
  let buffer: Buffer;
  try {
    buffer = Buffer.from(rawData, "base64");
  } catch {
    buffer = Buffer.from(rawData, "utf-8");
  }

  fs.writeFileSync(tempFile, buffer);

  try {
    if (process.platform === "win32") {
      for (let i = 0; i < copies; i++) {
        await execAsync(`copy /b "${tempFile}" "\\\\%COMPUTERNAME%\\${printerName}"`);
      }
    } else {
      for (let i = 0; i < copies; i++) {
        await execAsync(`lpr -P "${printerName}" -o raw "${tempFile}"`);
      }
    }
  } finally {
    fs.unlinkSync(tempFile);
  }

  console.log(`[ReceiptPrinter] Raw data sent to ${printerName}`);
}

async function sendReceiptToPrinter(pdfPath: string, printerName: string, copies: number): Promise<void> {
  if (process.platform === "win32") {
    try {
      const pdfToPrinter = await import("pdf-to-printer");
      await pdfToPrinter.print(pdfPath, { printer: printerName, copies });
    } catch (e) {
      // Fallback - use Windows print
      const printerArg = printerName ? `/d:"${printerName}"` : "";
      for (let i = 0; i < copies; i++) {
        await execAsync(`print ${printerArg} "${pdfPath}"`);
      }
    }
  } else {
    // macOS / Linux (CUPS)
    const printerArg = printerName ? `-P "${printerName}"` : "";
    await execAsync(`lpr ${printerArg} -# ${copies} "${pdfPath}"`);
  }

  console.log(`[ReceiptPrinter] PDF sent to ${printerName}`);
}
