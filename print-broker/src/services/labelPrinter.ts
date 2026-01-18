/**
 * Label Printer Service - TSPL2 for TSC MX340
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

// TSC MX340 is typically 203 DPI
const PRINTER_DPI = 203;

export async function printLabel(request: PrintRequest, printerName: string): Promise<void> {
  console.log("[LabelPrinter] TSC MX340: " + printerName);

  const jobId = "label-" + Date.now();
  const paperSize = request.paperSize || "50x30mm";
  const copies = request.copies || 1;

  if (request.contentType === "tspl" || request.contentType === "zpl") {
    await sendRawToPrinter(Buffer.from(request.content, "utf-8"), printerName);
  } else if (request.contentType === "html") {
    await printHtmlAsTspl(request.content, printerName, jobId, paperSize, copies);
  } else {
    throw new Error("Unsupported: " + request.contentType);
  }
}

async function printHtmlAsTspl(
  html: string,
  printerName: string,
  jobId: string,
  paperSize: string,
  copies: number
): Promise<void> {
  const puppeteer = await import("puppeteer");

  const browser = await puppeteer.default.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    const paper = PAPER_SIZES[paperSize] || { width: 50, height: 30 };

    // Calculate pixels at printer DPI
    const widthPx = Math.round(paper.width * PRINTER_DPI / 25.4);
    const heightPx = Math.round(paper.height * PRINTER_DPI / 25.4);

    console.log("[LabelPrinter] Label: " + paper.width + "x" + paper.height + "mm = " + widthPx + "x" + heightPx + "px @ " + PRINTER_DPI + "DPI");

    await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 1 });

    // Wrap HTML with white background
    const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: ${widthPx}px;
  height: ${heightPx}px;
  margin: 0;
  padding: 0;
  background: #FFFFFF !important;
  overflow: hidden;
}
</style>
</head>
<body style="background: #FFFFFF !important;">${html}</body>
</html>`;

    await page.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });

    // Additional white background enforcement
    await page.evaluate(() => {
      document.body.style.background = "#FFFFFF";
      document.documentElement.style.background = "#FFFFFF";
    });

    await page.evaluate(() => new Promise(r => setTimeout(r, 500)));

    const imagePath = path.join(TEMP_DIR, jobId + ".png");

    // Screenshot with white background
    await page.screenshot({
      path: imagePath,
      type: "png",
      omitBackground: false,
      clip: { x: 0, y: 0, width: widthPx, height: heightPx }
    });

    console.log("[LabelPrinter] Screenshot saved: " + imagePath);

    const tsplBuffer = await convertImageToTsplBinary(imagePath, paper.width, paper.height, widthPx, heightPx, copies);
    await sendRawToPrinter(tsplBuffer, printerName);

    fs.unlinkSync(imagePath);
  } finally {
    await browser.close();
  }
}

async function convertImageToTsplBinary(
  imagePath: string,
  widthMm: number,
  heightMm: number,
  widthPx: number,
  heightPx: number,
  copies: number
): Promise<Buffer> {
  const sharp = await import("sharp");

  // Read image and get info
  const image = sharp.default(imagePath);
  const metadata = await image.metadata();
  console.log("[LabelPrinter] Image metadata: " + metadata.width + "x" + metadata.height + ", channels: " + metadata.channels + ", format: " + metadata.format);

  // Process: flatten alpha to white, resize, convert to grayscale
  const processed = await sharp.default(imagePath)
    .flatten({ background: { r: 255, g: 255, b: 255 } })  // Replace transparency with white
    .resize(widthPx, heightPx, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = processed;
  console.log("[LabelPrinter] Processed: " + info.width + "x" + info.height + ", channels: " + info.channels + ", size: " + data.length + " bytes");

  // Debug: sample some pixels
  const samplePixels = [];
  for (let i = 0; i < Math.min(10, data.length); i++) {
    samplePixels.push(data[i]);
  }
  console.log("[LabelPrinter] First 10 pixels: " + samplePixels.join(", "));

  // Convert to 1-bit bitmap
  const bytesPerRow = Math.ceil(widthPx / 8);
  const bitmapBytes: number[] = [];

  for (let y = 0; y < heightPx; y++) {
    for (let bx = 0; bx < bytesPerRow; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit;
        if (x < widthPx) {
          const idx = y * widthPx + x;
          // FIX: Don't use || 255, check properly for undefined
          const pixel = idx < data.length ? data[idx] : 255;
          // TSC: bit=1 means black dot (pixel < 128 is dark)
          if (pixel < 128) {
            byte |= (1 << (7 - bit));
          }
        }
      }
      bitmapBytes.push(byte);
    }
  }

  console.log("[LabelPrinter] Bitmap: " + bytesPerRow + " bytes/row x " + heightPx + " rows = " + bitmapBytes.length + " bytes");

  // Debug: sample bitmap bytes
  const sampleBitmap = bitmapBytes.slice(0, 10).map(b => b.toString(2).padStart(8, '0'));
  console.log("[LabelPrinter] First 10 bitmap bytes: " + sampleBitmap.join(" "));

  // Build TSPL2 command with BINARY data
  const header = [
    "SIZE " + widthMm + " mm, " + heightMm + " mm",
    "GAP 2 mm, 0 mm",
    "DIRECTION 1",
    "DENSITY 8",
    "SPEED 4",
    "CLS",
    "BITMAP 0,0," + bytesPerRow + "," + heightPx + ",0,"
  ].join("\r\n");

  const footer = "\r\nPRINT " + copies + ",1\r\n";

  // Combine: header + raw bitmap bytes + footer
  const headerBuf = Buffer.from(header, "ascii");
  const bitmapBuf = Buffer.from(bitmapBytes);
  const footerBuf = Buffer.from(footer, "ascii");

  const result = Buffer.concat([headerBuf, bitmapBuf, footerBuf]);

  console.log("[LabelPrinter] TSPL total size: " + result.length + " bytes");

  return result;
}

async function getPrinterPort(printerName: string): Promise<string | null> {
  try {
    const safeName = printerName.replace(/'/g, "''");
    const psCommand = `powershell -Command "Get-WmiObject -Query \\"SELECT PortName FROM Win32_Printer WHERE Name='${safeName}'\\" | Select-Object -ExpandProperty PortName"`;
    const { stdout } = await execAsync(psCommand, { timeout: 10000 });
    const port = stdout.trim();
    if (port && port.length > 0) {
      return port;
    }
  } catch (e) {
    console.log("[LabelPrinter] Could not get port via WMI");
  }
  return null;
}

async function sendRawToPrinter(data: Buffer, printerName: string): Promise<void> {
  const tempFile = path.join(TEMP_DIR, "tspl-" + Date.now() + ".bin");
  fs.writeFileSync(tempFile, data);

  console.log("[LabelPrinter] Temp file: " + tempFile + " (" + data.length + " bytes)");

  try {
    if (process.platform === "win32") {
      const port = await getPrinterPort(printerName);

      if (port) {
        console.log("[LabelPrinter] Printer port: " + port);

        if (port.toUpperCase().startsWith("USB")) {
          const printCmd = `print /d:${port} "${tempFile}"`;
          console.log("[LabelPrinter] Trying: " + printCmd);

          try {
            await execAsync(printCmd, { shell: "cmd.exe", timeout: 15000 });
            console.log("[LabelPrinter] Success via PRINT /D:");
            return;
          } catch (e: any) {
            console.log("[LabelPrinter] PRINT /D failed: " + e.message);
          }
        }

        if (port.includes(":")) {
          const copyCmd = `copy /b "${tempFile}" ${port}`;
          console.log("[LabelPrinter] Trying: " + copyCmd);

          try {
            await execAsync(copyCmd, { shell: "cmd.exe", timeout: 15000 });
            console.log("[LabelPrinter] Success via copy to port");
            return;
          } catch (e: any) {
            console.log("[LabelPrinter] copy to port failed: " + e.message);
          }
        }
      }

      console.log("[LabelPrinter] Trying PowerShell raw print...");
      await sendViaPowerShellRaw(data, printerName);

    } else {
      await execAsync(`lpr -P "${printerName}" -o raw "${tempFile}"`);
      console.log("[LabelPrinter] Success via lpr");
    }
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

async function sendViaPowerShellRaw(data: Buffer, printerName: string): Promise<void> {
  const base64Data = data.toString("base64");
  const safeName = printerName.replace(/'/g, "''");

  const psScript = `
$ErrorActionPreference = 'Stop'
$bytes = [Convert]::FromBase64String('${base64Data}')
$printerName = '${safeName}'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFOW pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            Console.WriteLine("OpenPrinter failed: " + Marshal.GetLastWin32Error());
            return false;
        }

        DOCINFOW di = new DOCINFOW();
        di.pDocName = "TSPL Label";
        di.pDatatype = "RAW";

        if (!StartDocPrinter(hPrinter, 1, ref di)) {
            Console.WriteLine("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
            ClosePrinter(hPrinter);
            return false;
        }

        if (!StartPagePrinter(hPrinter)) {
            Console.WriteLine("StartPagePrinter failed: " + Marshal.GetLastWin32Error());
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return false;
        }

        int written;
        bool ok = WritePrinter(hPrinter, bytes, bytes.Length, out written);

        if (!ok) {
            Console.WriteLine("WritePrinter failed: " + Marshal.GetLastWin32Error());
        }

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return ok && written == bytes.Length;
    }
}
"@

$result = [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes)
if ($result) {
    Write-Output 'SUCCESS'
} else {
    throw 'Raw print failed'
}
`;

  const psFile = path.join(TEMP_DIR, "rawprint-" + Date.now() + ".ps1");
  fs.writeFileSync(psFile, psScript, "utf8");

  try {
    const { stdout, stderr } = await execAsync(
      `powershell -ExecutionPolicy Bypass -File "${psFile}"`,
      { timeout: 30000 }
    );

    if (stderr) {
      console.log("[LabelPrinter] PowerShell stderr: " + stderr);
    }

    if (stdout.includes("SUCCESS")) {
      console.log("[LabelPrinter] Success via PowerShell Raw Print API");
      return;
    }

    throw new Error("PowerShell raw print did not return SUCCESS");
  } catch (e: any) {
    console.log("[LabelPrinter] PowerShell raw print failed: " + e.message);
    throw new Error("Could not send raw data to printer '" + printerName + "'. Error: " + e.message);
  } finally {
    try { fs.unlinkSync(psFile); } catch {}
  }
}
