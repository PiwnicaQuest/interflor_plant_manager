/**
 * Receipt Printer Service
 * Handles thermal receipt printing (POS receipts, 58mm/80mm)
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
 * Wrap HTML with CSS reset to ensure correct width and no offset
 */
function wrapHtmlWithReset(html: string, widthPx: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${widthPx}px !important;
      max-width: ${widthPx}px !important;
      background: white !important;
      overflow-x: hidden !important;
    }
    body {
      font-family: 'Courier New', monospace;
    }
    table {
      width: 100% !important;
      max-width: 100% !important;
    }
    img {
      max-width: 100% !important;
    }
  </style>
</head>
<body>${html}</body>
</html>`;
}

/**
 * Print HTML receipt by converting to image with correct width
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

    // Receipt printers typically 203 DPI
    const dpi = 203;
    const mmToPx = dpi / 25.4;
    const widthPx = Math.round(paper.width * mmToPx);

    console.log(`[ReceiptPrinter] Paper: ${paper.width}mm = ${widthPx}px @ ${dpi}DPI`);

    // Set fixed width, tall viewport for variable content
    await page.setViewport({ width: widthPx, height: 2000, deviceScaleFactor: 1 });

    // Wrap HTML with CSS reset to ensure correct width
    const wrappedHtml = wrapHtmlWithReset(html, widthPx);
    await page.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });

    // Force white background
    await page.evaluate(() => {
      document.body.style.backgroundColor = "white";
      document.documentElement.style.backgroundColor = "white";
    });

    // Wait for rendering
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));

    // Get actual content height
    const contentHeight = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      return Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      );
    });

    console.log(`[ReceiptPrinter] Content height: ${contentHeight}px`);

    // Screenshot of exact content - full width, no horizontal clip offset
    const imagePath = path.join(TEMP_DIR, `${jobId}.png`);
    await page.screenshot({
      path: imagePath,
      type: "png",
      clip: { x: 0, y: 0, width: widthPx, height: Math.min(contentHeight + 20, 5000) },
      omitBackground: false
    });

    console.log(`[ReceiptPrinter] Screenshot saved: ${imagePath}`);

    // Send to printer
    await sendReceiptToPrinter(imagePath, printerName, copies);

    // Cleanup
    fs.unlinkSync(imagePath);

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

async function sendReceiptToPrinter(imagePath: string, printerName: string, copies: number): Promise<void> {
  if (process.platform === "win32") {
    for (let i = 0; i < copies; i++) {
      try {
        const pdfToPrinter = await import("pdf-to-printer");
        await pdfToPrinter.print(imagePath, { printer: printerName });
      } catch (e) {
        await execAsync(
          `rundll32 shimgvw.dll,ImageView_PrintTo "${imagePath}" "${printerName}"`,
          { timeout: 30000 }
        );
      }
    }
  } else {
    for (let i = 0; i < copies; i++) {
      await execAsync(`lpr -P "${printerName}" "${imagePath}"`);
    }
  }

  console.log(`[ReceiptPrinter] Image sent to ${printerName}`);
}
