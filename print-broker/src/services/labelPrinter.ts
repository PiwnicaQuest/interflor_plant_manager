/**
 * Label Printer Service - PDF + TSPL modes
 * Supports TSC MX340P and other TSC printers
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as net from "net";
import { exec } from "child_process";
import { promisify } from "util";
import { PrintRequest, PAPER_SIZES } from "../types";
import { generateSimpleTsplLabel, parseHtmlForTspl } from "./tsplGenerator";

const execAsync = promisify(exec);
const TEMP_DIR = path.join(os.tmpdir(), "print-broker");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Get printer port from Windows
async function getPrinterPort(printerName: string): Promise<string | null> {
  if (process.platform !== "win32") return null;

  try {
    const { stdout } = await execAsync(
      `wmic printer where "name='${printerName.replace(/'/g, "''")}'" get portname /value`,
      { shell: "cmd.exe", timeout: 5000 }
    );
    const match = stdout.match(/PortName=(.+)/i);
    if (match) {
      return match[1].trim();
    }
  } catch (e) {
    console.log("[LabelPrinter] Failed to get printer port: " + e);
  }
  return null;
}

// Check if string is an IP address
function isIpAddress(str: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(str);
}

// Send raw data via TCP (for network printers)
async function sendViaTcp(data: Buffer, ip: string, port: number = 9100): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("[LabelPrinter] Connecting to " + ip + ":" + port);

    const client = new net.Socket();
    client.setTimeout(10000);

    client.on("error", (err) => {
      console.log("[LabelPrinter] TCP error: " + err.message);
      client.destroy();
      reject(err);
    });

    client.on("timeout", () => {
      console.log("[LabelPrinter] TCP timeout");
      client.destroy();
      reject(new Error("Connection timeout"));
    });

    client.connect(port, ip, () => {
      console.log("[LabelPrinter] TCP connected, sending " + data.length + " bytes");
      client.write(data, () => {
        console.log("[LabelPrinter] Data sent, closing connection");
        client.end();
      });
    });

    client.on("close", () => {
      console.log("[LabelPrinter] TCP connection closed");
      resolve();
    });
  });
}

export async function printLabel(request: PrintRequest, printerName: string): Promise<void> {
  const jobId = "label-" + Date.now();
  const paperSize = request.paperSize || "50x30mm";
  const copies = request.copies || 1;
  const paper = PAPER_SIZES[paperSize] || { width: 50, height: 30 };

  console.log("========================================");
  console.log("[LabelPrinter] NEW PRINT JOB");
  console.log("[LabelPrinter] Content type: " + request.contentType);
  console.log("[LabelPrinter] Printer: " + printerName);
  console.log("[LabelPrinter] Paper: " + paperSize + " (" + paper.width + "x" + paper.height + "mm)");
  console.log("[LabelPrinter] Copies: " + copies);
  console.log("========================================");

  switch (request.contentType) {
    case "tspl":
      console.log("[LabelPrinter] Mode: Direct TSPL");
      await printTsplRaw(request.content, printerName);
      break;

    case "zpl":
    case "raw":
      console.log("[LabelPrinter] Mode: Raw/ZPL");
      await printRawData(request.content, printerName);
      break;

    case "html":
      const isTscPrinter = printerName.toLowerCase().includes("tsc");
      console.log("[LabelPrinter] Mode: HTML");
      console.log("[LabelPrinter] Is TSC printer: " + isTscPrinter);

      if (isTscPrinter) {
        console.log("[LabelPrinter] Attempting HTML to TSPL conversion...");
        const parsed = parseHtmlForTspl(request.content);
        console.log("[LabelPrinter] Parsed data: " + JSON.stringify(parsed));

        if (parsed.barcode && parsed.productName) {
          console.log("[LabelPrinter] SUCCESS: Using TSPL mode!");
          const tspl = generateSimpleTsplLabel(
            parsed.barcode,
            parsed.productName,
            paper.width,
            paper.height,
            copies
          );
          console.log("[LabelPrinter] Generated TSPL:");
          console.log("---TSPL START---");
          console.log(tspl);
          console.log("---TSPL END---");
          await printTsplRaw(tspl, printerName);
          return;
        } else {
          console.log("[LabelPrinter] WARNING: Parse failed, falling back to PDF!");
          console.log("[LabelPrinter] barcode found: " + !!parsed.barcode);
          console.log("[LabelPrinter] productName found: " + !!parsed.productName);
        }
      }

      console.log("[LabelPrinter] Using PDF mode (fallback)");
      await printHtmlLabel(request.content, printerName, jobId, paperSize, copies);
      break;

    case "pdf":
      console.log("[LabelPrinter] Mode: PDF");
      const pdfPath = path.join(TEMP_DIR, jobId + ".pdf");
      fs.writeFileSync(pdfPath, Buffer.from(request.content, "base64"));
      try {
        await sendPdfToPrinter(pdfPath, printerName, copies);
      } finally {
        try { fs.unlinkSync(pdfPath); } catch {}
      }
      break;

    default:
      throw new Error("Unsupported content type: " + request.contentType);
  }
}

async function printTsplRaw(tsplContent: string, printerName: string): Promise<void> {
  console.log("[LabelPrinter] printTsplRaw called");
  console.log("[LabelPrinter] Printer: " + printerName);
  console.log("[LabelPrinter] TSPL length: " + tsplContent.length + " bytes");

  // Convert to Buffer for raw transmission
  const dataBuffer = Buffer.from(tsplContent, "ascii");

  // Save to temp file (for backup methods)
  const tempFile = path.join(TEMP_DIR, "label-" + Date.now() + ".prn");
  fs.writeFileSync(tempFile, dataBuffer);
  console.log("[LabelPrinter] Saved to: " + tempFile);

  try {
    if (process.platform === "win32") {
      console.log("[LabelPrinter] Windows platform - detecting printer port...");

      // Get printer port
      const port = await getPrinterPort(printerName);
      console.log("[LabelPrinter] Printer port: " + port);

      // Method 1: Direct TCP for network printers (IP address)
      if (port && isIpAddress(port)) {
        console.log("[LabelPrinter] Network printer detected at: " + port);
        try {
          await sendViaTcp(dataBuffer, port, 9100);
          console.log("[LabelPrinter] SUCCESS via TCP/9100");
          return;
        } catch (tcpErr: any) {
          console.log("[LabelPrinter] TCP failed: " + tcpErr.message);
        }
      }

      // Method 2: Direct TCP for IP_ prefixed ports
      if (port && port.startsWith("IP_")) {
        const ip = port.replace("IP_", "");
        console.log("[LabelPrinter] Network printer (IP_ prefix) at: " + ip);
        try {
          await sendViaTcp(dataBuffer, ip, 9100);
          console.log("[LabelPrinter] SUCCESS via TCP/9100");
          return;
        } catch (tcpErr: any) {
          console.log("[LabelPrinter] TCP failed: " + tcpErr.message);
        }
      }

      // Method 3: USB port direct write
      if (port && (port.startsWith("USB") || port.startsWith("COM"))) {
        console.log("[LabelPrinter] USB/COM port detected: " + port);
        try {
          const portPath = "\\\\.\\" + port;
          const psScript = `
$bytes = [System.IO.File]::ReadAllBytes('${tempFile.replace(/\\/g, "\\\\").replace(/'/g, "''")}')
$fs = [System.IO.File]::OpenWrite('${portPath}')
$fs.Write($bytes, 0, $bytes.Length)
$fs.Close()
Write-Host "Written $($bytes.Length) bytes to ${port}"
`;
          const { stdout } = await execAsync('powershell -Command "' + psScript.replace(/"/g, '\\"') + '"', {
            shell: "cmd.exe",
            timeout: 15000
          });
          console.log("[LabelPrinter] PowerShell: " + stdout.trim());
          console.log("[LabelPrinter] SUCCESS via USB/COM port");
          return;
        } catch (usbErr: any) {
          console.log("[LabelPrinter] USB/COM failed: " + usbErr.message);
        }
      }

      // Method 4: Printer share (UNC path)
      const hostname = os.hostname();
      const printerShare = "\\\\" + hostname + "\\" + printerName;
      console.log("[LabelPrinter] Trying printer share: " + printerShare);
      try {
        const copyCmd = 'copy /b "' + tempFile + '" "' + printerShare + '"';
        await execAsync(copyCmd, { shell: "cmd.exe", timeout: 15000 });
        console.log("[LabelPrinter] SUCCESS via printer share");
        return;
      } catch (shareErr: any) {
        console.log("[LabelPrinter] Share copy failed: " + shareErr.message);
      }

      // Method 5: Last resort - print command (may not work for raw)
      console.log("[LabelPrinter] WARNING: Using print command (may not work for raw TSPL)");
      try {
        const printCmd = 'print /d:"' + printerName + '" "' + tempFile + '"';
        await execAsync(printCmd, { shell: "cmd.exe", timeout: 15000 });
        console.log("[LabelPrinter] Sent via print command (check output quality)");
      } catch (printErr: any) {
        console.log("[LabelPrinter] Print command failed: " + printErr.message);
        throw new Error("All print methods failed for " + printerName);
      }

    } else {
      // Linux/Mac: use lpr
      const printerArg = printerName ? '-P "' + printerName + '"' : "";
      await execAsync('lpr ' + printerArg + ' -o raw "' + tempFile + '"');
      console.log("[LabelPrinter] Sent via lpr raw");
    }
  } finally {
    setTimeout(() => { try { fs.unlinkSync(tempFile); } catch {} }, 5000);
  }
}

async function printRawData(content: string, printerName: string): Promise<void> {
  await printTsplRaw(content, printerName);
}

async function printHtmlLabel(
  html: string,
  printerName: string,
  jobId: string,
  paperSize: string,
  copies: number
): Promise<void> {
  console.log("[LabelPrinter] printHtmlLabel called - generating PDF");
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

    console.log("[LabelPrinter] PDF mode - Label: " + labelWidth + "x" + labelHeight + "mm");

    await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 2 });

    const wrappedHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
      '@page { size: ' + labelWidth + 'mm ' + labelHeight + 'mm; margin: 0; }' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'html, body { width: ' + labelWidth + 'mm; height: ' + labelHeight + 'mm; margin: 0; padding: 0; background: white !important; overflow: hidden; }' +
      '</style></head><body>' + html + '</body></html>';

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
  console.log("[LabelPrinter] sendPdfToPrinter: " + pdfPath);
  if (process.platform === "win32") {
    try {
      const pdfToPrinter = await import("pdf-to-printer");
      await pdfToPrinter.print(pdfPath, {
        printer: printerName,
        copies: copies,
        orientation: "portrait",
        scale: "fit"
      });
      console.log("[LabelPrinter] Sent PDF via pdf-to-printer");
    } catch (e: any) {
      console.log("[LabelPrinter] pdf-to-printer failed: " + e.message);
      const psScript = 'Start-Process -FilePath "' + pdfPath + '" -Verb PrintTo -ArgumentList "' + printerName + '" -Wait';
      await execAsync('powershell -Command "' + psScript + '"', { shell: "cmd.exe", timeout: 30000 });
      console.log("[LabelPrinter] Sent PDF via PowerShell");
    }
  } else {
    const printerArg = printerName ? '-P "' + printerName + '"' : "";
    await execAsync('lpr ' + printerArg + ' -o fit-to-page -# ' + copies + ' "' + pdfPath + '"');
  }
}
