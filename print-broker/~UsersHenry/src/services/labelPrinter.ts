/**
 * Label Printer Service - PDF mode with orientation
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
  console.log("[LabelPrinter] PDF mode - Printing to: " + printerName);

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

    const labelWidth = paper.width;
    const labelHeight = paper.height;

    const widthPx = Math.round(labelWidth * 96 / 25.4);
    const heightPx = Math.round(labelHeight * 96 / 25.4);

    console.log("[LabelPrinter] Label: " + labelWidth + "x" + labelHeight + "mm = " + widthPx + "x" + heightPx + "px");

    await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 2 });

    const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: ${labelWidth}mm ${labelHeight}mm;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${labelWidth}mm;
      height: ${labelHeight}mm;
      margin: 0;
      padding: 0;
      background: white;
      overflow: hidden;
    }
  </style>
</head>
<body>${html}</body>
</html>`;

    await page.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));

    const pdfPath = path.join(TEMP_DIR, jobId + ".pdf");
    await page.pdf({
      path: pdfPath,
      width: labelWidth + "mm",
      height: labelHeight + "mm",
      printBackground: true,
      preferCSSPageSize: true,
      landscape: false,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
    });

    console.log("[LabelPrinter] PDF generated: " + pdfPath);
    await sendPdfToPrinter(pdfPath, printerName, copies);
    try { fs.unlinkSync(pdfPath); } catch {}

  } finally {
    await browser.close();
  }
}

async function sendPdfToPrinter(pdfPath: string, printerName: string, copies: number): Promise<void> {
  if (process.platform === "win32") {
    try {
      const pdfToPrinter = await import("pdf-to-printer");
      // Try with orientation options
      await pdfToPrinter.print(pdfPath, { 
        printer: printerName, 
        copies: copies,
        orientation: "portrait",
        scale: "fit"
      });
      console.log("[LabelPrinter] Sent PDF via pdf-to-printer (landscape) to: " + printerName);
    } catch (e: any) {
      console.log("[LabelPrinter] pdf-to-printer failed: " + e.message + ", trying SumatraPDF...");
      
      // Fallback: Use SumatraPDF with explicit orientation (if installed)
      try {
        const sumatraCmd = `SumatraPDF.exe -print-to "${printerName}" -print-settings "portrait,fit" "${pdfPath}"`;
        await execAsync(sumatraCmd, { shell: "cmd.exe", timeout: 30000 });
        console.log("[LabelPrinter] Sent PDF via SumatraPDF to: " + printerName);
      } catch (e2: any) {
        console.log("[LabelPrinter] SumatraPDF failed: " + e2.message + ", trying PowerShell...");
        
        // Final fallback: PowerShell with print dialog settings
        const psScript = `
$pdf = '${pdfPath.replace(/'/g, "''")}'
$printer = '${printerName.replace(/'/g, "''")}'
Add-Type -AssemblyName System.Drawing
$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $printer
$printDoc.DefaultPageSettings.Landscape = $false
Start-Process -FilePath $pdf -Verb PrintTo -ArgumentList $printer -Wait
`;
        await execAsync(`powershell -Command "${psScript.replace(/"/g, "\\\"")}" `, { shell: "cmd.exe", timeout: 30000 });
        console.log("[LabelPrinter] Sent PDF via PowerShell to: " + printerName);
      }
    }
  } else {
    const printerArg = printerName ? `-P "${printerName}"` : "";
    await execAsync(`lpr ${printerArg} -o fit-to-page -# ${copies} "${pdfPath}"`);
  }
}
