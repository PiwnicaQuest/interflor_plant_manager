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
import { generateSimpleTsplLabel, generateZplLabel, parseHtmlForTspl, setDpi } from "./tsplGenerator";

const execAsync = promisify(exec);
const TEMP_DIR = path.join(os.tmpdir(), "print-broker");

// Dynamically find SumatraPDF executable (bundled with pdf-to-printer)
function findSumatraPdf(): string | null {
  const searchPaths = [
    path.join(process.cwd(), "node_modules", "pdf-to-printer", "dist"),
    path.join(process.cwd(), "node_modules", "pdf-to-printer"),
    path.join(process.cwd(), "node_modules", ".bin"),
  ];
  for (const dir of searchPaths) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      const exe = files.find(f => f.toLowerCase().includes("sumatra") && f.endsWith(".exe"));
      if (exe) {
        const full = path.join(dir, exe);
        console.log("[LabelPrinter] Found SumatraPDF: " + full);
        return full;
      }
    } catch {}
  }
  // Deep search in pdf-to-printer
  try {
    const pdfPrinterDir = path.join(process.cwd(), "node_modules", "pdf-to-printer");
    if (fs.existsSync(pdfPrinterDir)) {
      const walkSync = (dir: string): string | null => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.toLowerCase().includes("sumatra") && entry.name.endsWith(".exe")) {
            return path.join(dir, entry.name);
          }
          if (entry.isDirectory() && entry.name !== "node_modules") {
            const found = walkSync(path.join(dir, entry.name));
            if (found) return found;
          }
        }
        return null;
      };
      const found = walkSync(pdfPrinterDir);
      if (found) {
        console.log("[LabelPrinter] Found SumatraPDF (deep): " + found);
        return found;
      }
    }
  } catch {}
  console.log("[LabelPrinter] SumatraPDF NOT found");
  return null;
}

// Print via Citizen Windows Label SDK (CSJLabelLib.dll)
// Uses the official SDK instead of raw DPL commands
async function printViaCitizenSdk(
  barcode: string,
  productName: string,
  printerName: string,
  widthMm: number,
  heightMm: number,
  copies: number
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Citizen SDK is Windows-only");
  }

  console.log("[CitizenSDK] Printing: barcode=" + barcode + " name=" + productName);
  console.log("[CitizenSDK] Label: " + widthMm + "x" + heightMm + "mm, copies=" + copies);

  // SDK DLL path - bundled with PrintBroker in sdk/ subfolder
  const sdkDir = path.join(process.cwd(), "sdk");
  const dllPath = path.join(sdkDir, "CSJLabelLib.dll");

  if (!fs.existsSync(dllPath)) {
    throw new Error("Citizen SDK DLL not found at: " + dllPath);
  }

  // Get printer port for USB address
  const port = await getPrinterPort(printerName);
  const usbAddress = (port && port.startsWith("USB")) ? port : "USB001";

  console.log("[CitizenSDK] USB address: " + usbAddress);
  console.log("[CitizenSDK] SDK DLL: " + dllPath);

  // Clean product name (ASCII only for printer font)
  const safeName = productName
    .replace(/[ąĄ]/g, "a").replace(/[ćĆ]/g, "c").replace(/[ęĘ]/g, "e")
    .replace(/[łŁ]/g, "l").replace(/[ńŃ]/g, "n").replace(/[óÓ]/g, "o")
    .replace(/[śŚ]/g, "s").replace(/[źŹżŻ]/g, "z")
    .replace(/[^\x20-\x7E]/g, "")
    .substring(0, 60);

  // Word-wrap text into lines (~25 chars per line for 10pt Triumvirate on 50mm label)
  const maxCharsPerLine = Math.max(15, Math.round(widthMm * 0.5));
  const textLines: string[] = [];
  const words = safeName.split(" ");
  let currentLine = "";
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
      currentLine = currentLine ? currentLine + " " + word : word;
    } else {
      if (currentLine) textLines.push(currentLine);
      currentLine = word.substring(0, maxCharsPerLine);
    }
  }
  if (currentLine) textLines.push(currentLine);
  if (textLines.length === 0) textLines.push(safeName.substring(0, maxCharsPerLine));

  console.log("[CitizenSDK] Text lines: " + JSON.stringify(textLines));

  // Label dimensions in dots (203 dpi = ~8 dots/mm)
  const dpmm = 203 / 25.4;
  const labelH = Math.round(heightMm * dpmm);
  const lineHeight = 16;  // ~2mm between text lines

  // Barcode parameters - auto-fit narrow width to label
  const labelW = Math.round(widthMm * dpmm);
  const bcThick = 1;
  let bcNarrow = 2;
  // CODE128: (start=11 + data*11 + checksum=11 + stop=13) * narrow + quiet zones
  const bcModules = 11 + barcode.length * 11 + 11 + 13;
  while (bcModules * bcNarrow + 40 > labelW - 20 && bcNarrow > 1) {
    bcNarrow--;
  }
  const bcHeight = Math.min(50, Math.round(labelH * 0.3));

  // Barcode centered horizontally
  const bcWidthDots = bcModules * bcNarrow + 20;
  const bcX = 10;
  const bcY = 10;
  const gapDots = 24;  // 3mm gap between barcode top and first text line
  // Bottom text line Y = barcode top + 6mm gap
  const textBaseY = bcY + bcHeight + gapDots;
  const textX = 10;

  // Build PowerShell commands for text lines (word-wrapped)
  const psTextCommands = textLines.map((line, i) => {
    // Lines: line 0 = top, line N = bottom (closest to barcode)
    // In SDK coords (origin bottom-left): top line has highest Y
    const lineIdx = textLines.length - 1 - i;
    const lineY = textBaseY + lineIdx * lineHeight;
    const escaped = line.replace(/'/g, "''");
    return "  $r = $design.DrawTextPtrFont('" + escaped + "',\n" +
      "    [com.citizen.sdk.LabelPrint.LabelConst]::CLS_LOCALE_OTHER,\n" +
      "    [com.citizen.sdk.LabelPrint.LabelConst]::CLS_PRT_FNT_TRIUMVIRATE,\n" +
      "    [com.citizen.sdk.LabelPrint.LabelConst]::CLS_RT_NORMAL,\n" +
      "    1, 1,\n" +
      "    [com.citizen.sdk.LabelPrint.LabelConst]::CLS_PRT_FNT_SIZE_10,\n" +
      "    " + textX + ", " + lineY + ")\n" +
      "  Write-Host 'DrawText line " + i + ": ' $r";
  }).join("\n");

  const ps1Path = path.join(TEMP_DIR, "citizen-sdk-" + Date.now() + ".ps1");
  const safePrinter = printerName.replace(/'/g, "''");
  const safeDll = dllPath.replace(/\\/g, "\\\\").replace(/'/g, "''");
  const safeBarcode = barcode.replace(/'/g, "''");

  const psScript = "$ErrorActionPreference = 'Stop'\n\n" +
    "try {\n" +
    "  Add-Type -Path '" + safeDll + "'\n" +
    "  Write-Host 'Citizen SDK loaded'\n\n" +
    "  $design = New-Object com.citizen.sdk.LabelPrint.LabelDesign\n\n" +
    "  # Draw product name lines (word-wrapped)\n" +
    psTextCommands + "\n\n" +
    "  # Draw Code128 barcode\n" +
    "  $r2 = $design.DrawBarCode('" + safeBarcode + "',\n" +
    "    [com.citizen.sdk.LabelPrint.LabelConst]::CLS_BCS_CODE128,\n" +
    "    [com.citizen.sdk.LabelPrint.LabelConst]::CLS_RT_NORMAL,\n" +
    "    " + bcThick + ", " + bcNarrow + ", " + bcHeight + ", " + bcX + ", " + bcY + ",\n" +
    "    [com.citizen.sdk.LabelPrint.LabelConst]::CLS_BCS_TEXT_SHOW)\n" +
    "  Write-Host 'DrawBarCode:' $r2\n\n" +
    "  $printer = New-Object com.citizen.sdk.LabelPrint.LabelPrinter\n\n" +
    "  $connResult = $printer.Connect(\n" +
    "    [com.citizen.sdk.LabelPrint.LabelConst]::CLS_PORT_USB,\n" +
    "    '" + usbAddress + "')\n" +
    "  Write-Host 'Connect(" + usbAddress + "):' $connResult\n\n" +
    "  if ($connResult -ne 0 -and $connResult -ne 1001) {\n" +
    "    foreach ($usbNum in @('USB001','USB002','USB003','USB004')) {\n" +
    "      if ($usbNum -eq '" + usbAddress + "') { continue }\n" +
    "      Write-Host 'Trying' $usbNum\n" +
    "      $connResult = $printer.Connect(\n" +
    "        [com.citizen.sdk.LabelPrint.LabelConst]::CLS_PORT_USB,\n" +
    "        $usbNum)\n" +
    "      Write-Host 'Connect:' $connResult\n" +
    "      if ($connResult -eq 0 -or $connResult -eq 1001) { break }\n" +
    "    }\n" +
    "  }\n\n" +
    "  if ($connResult -eq 0 -or $connResult -eq 1001) {\n" +
    "    $printResult = $printer.Print($design, " + copies + ")\n" +
    "    Write-Host 'Print:' $printResult\n" +
    "    $printer.Disconnect()\n" +
    "    Write-Host 'Disconnected'\n" +
    "    if ($printResult -eq 0) {\n" +
    "      Write-Host 'CITIZEN_SDK_OK'\n" +
    "    } else {\n" +
    "      Write-Host 'CITIZEN_SDK_PRINT_ERR=' $printResult\n" +
    "      exit 1\n" +
    "    }\n" +
    "  } else {\n" +
    "    Write-Host 'CITIZEN_SDK_CONN_ERR=' $connResult\n" +
    "    exit 1\n" +
    "  }\n" +
    "} catch {\n" +
    "  Write-Host 'CITIZEN_SDK_EXCEPTION:' $_\n" +
    "  Write-Host $_.Exception.ToString()\n" +
    "  exit 1\n" +
    "}\n";

  fs.writeFileSync(ps1Path, psScript);
  console.log("[CitizenSDK] PS1 script saved: " + ps1Path);

  try {
    const { stdout, stderr } = await execAsync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1Path + '"',
      { timeout: 30000 }
    );
    console.log("[CitizenSDK] Output: " + stdout.trim());
    if (stderr) console.log("[CitizenSDK] Stderr: " + stderr.trim());

    if (stdout.includes("CITIZEN_SDK_OK")) {
      console.log("[CitizenSDK] SUCCESS - Label printed via Citizen SDK");
    } else {
      throw new Error("Citizen SDK failed: " + stdout.trim());
    }
  } finally {
    try { fs.unlinkSync(ps1Path); } catch {}
  }
}


if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Get printer port from Windows (PowerShell)
async function getPrinterPort(printerName: string): Promise<string | null> {
  if (process.platform !== "win32") return null;

  try {
    // Primary: PowerShell Get-PrinterPort
    const psCmd = `powershell -NoProfile -Command "(Get-Printer -Name '${printerName.replace(/'/g, "''")}').PortName"`;
    const { stdout } = await execAsync(psCmd, { encoding: "utf-8", timeout: 5000 });
    const port = stdout.trim();
    if (port) return port;
  } catch (e) {
    // Fallback: wmic
    try {
      const { stdout } = await execAsync(
        `wmic printer where "name='${printerName.replace(/'/g, "''")}'" get portname /value`,
        { shell: "cmd.exe", timeout: 5000 }
      );
      const match = stdout.match(/PortName=(.+)/i);
      if (match) return match[1].trim();
    } catch {}
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
      await sendRawToDevice(request.content, printerName);
      break;

    case "zpl":
    case "raw":
      console.log("[LabelPrinter] Mode: Raw/ZPL");
      await printRawData(request.content, printerName);
      break;

    case "html":
      const nameLower = printerName.toLowerCase();
      // TSC/Godex = TSPL
      const isTscPrinter = nameLower.includes("tsc") || nameLower.includes("godex");
      // Citizen CL-S series = DPL (Datamax Programming Language) - NOT ZPL!
      const isCitizenPrinter = nameLower.includes("citizen") || nameLower.includes("cl-s") || nameLower.includes("cl-e");
      // ZPL: Zebra only
      const isZplPrinter = nameLower.includes("zebra");
      const useTspl = isTscPrinter && !isZplPrinter && !isCitizenPrinter;
      const useDpl = isCitizenPrinter;
      const useZpl = isZplPrinter && !isCitizenPrinter;
      const useCpcl = false;
      const useZpl2Bitmap = false;

      // Set DPI based on printer model
      if (nameLower.includes("mx340") || nameLower.includes("mx240")) {
        setDpi(300);
      } else {
        setDpi(203);
      }

      console.log("[LabelPrinter] Mode: HTML");
      console.log("[LabelPrinter] TSPL: " + useTspl + ", DPL: " + useDpl + ", ZPL: " + useZpl + " (printer: " + printerName + ")");

      if (useTspl) {
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
          await sendRawToDevice(tspl, printerName);
          return;
        } else {
          console.log("[LabelPrinter] WARNING: TSPL parse failed, falling back to PDF!");
          console.log("[LabelPrinter] barcode found: " + !!parsed.barcode);
          console.log("[LabelPrinter] productName found: " + !!parsed.productName);
        }
      }

      if (useZpl) {
        console.log("[LabelPrinter] Attempting HTML to ZPL conversion (Citizen/Zebra)...");
        const parsed = parseHtmlForTspl(request.content);
        console.log("[LabelPrinter] Parsed data: " + JSON.stringify(parsed));

        if (parsed.barcode && parsed.productName) {
          console.log("[LabelPrinter] SUCCESS: Using ZPL mode!");
          const zpl = generateZplLabel(
            parsed.barcode,
            parsed.productName,
            paper.width,
            paper.height,
            copies
          );
          console.log("[LabelPrinter] Generated ZPL:");
          console.log("---ZPL START---");
          console.log(zpl);
          console.log("---ZPL END---");
          // Send ZPL the same way as TSPL - raw data to printer
          await sendRawToDevice(zpl, printerName);
          return;
        } else {
          console.log("[LabelPrinter] WARNING: ZPL parse failed, falling back to PDF!");
        }
      }

      if (useZpl2Bitmap) {
        console.log("[LabelPrinter] Attempting ZPL II bitmap mode (^GFA)...");
        try {
          await printZpl2BitmapLabel(request.content, printerName, paper.width, paper.height, copies);
          return;
        } catch (zpl2Err: any) {
          console.log("[LabelPrinter] ZPL2 bitmap failed: " + zpl2Err.message);
          console.log("[LabelPrinter] Falling back to PDF mode");
        }
      }

      if (useDpl) {
        console.log("[LabelPrinter] Citizen printer detected - using Citizen SDK...");
        const parsed = parseHtmlForTspl(request.content);
        console.log("[LabelPrinter] Parsed: " + JSON.stringify(parsed));

        if (parsed.barcode && parsed.productName) {
          try {
            await printViaCitizenSdk(
              parsed.barcode,
              parsed.productName,
              printerName,
              paper.width,
              paper.height,
              copies
            );
            console.log("[LabelPrinter] SUCCESS: Printed via Citizen SDK");
            return;
          } catch (sdkErr: any) {
            console.log("[LabelPrinter] Citizen SDK failed: " + (sdkErr as Error).message);
            console.log("[LabelPrinter] Falling back to PDF mode");
          }
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
        await sendPdfToPrinter(pdfPath, printerName, copies, paperSize);
      } finally {
        try { fs.unlinkSync(pdfPath); } catch {}
      }
      break;

    default:
      throw new Error("Unsupported content type: " + request.contentType);
  }
}

// Send raw data to printer via Windows Print Spooler WritePrinter API
// This is the PROPER way to send raw data to USB printers on Windows
async function sendRawViaWritePrinter(data: Buffer, printerName: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("WritePrinter is Windows-only");
  }

  console.log("[LabelPrinter] sendRawViaWritePrinter: " + data.length + " bytes to " + printerName);

  // Save data to temp file
  const tempFile = path.join(TEMP_DIR, "wp-" + Date.now() + ".prn");
  fs.writeFileSync(tempFile, data);

  // Write PowerShell script that uses Win32 WritePrinter API via P/Invoke
  const ps1Path = path.join(TEMP_DIR, "write-printer.ps1");
  const safePrinter = printerName.replace(/'/g, "''");
  const safeFile = tempFile.replace(/'/g, "''");

  const psScript = `$ErrorActionPreference = 'Stop'

Add-Type @'
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
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    public static bool SendBytesToPrinter(string printerName, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
            Console.WriteLine("ERROR: OpenPrinter failed, error=" + Marshal.GetLastWin32Error());
            return false;
        }

        var di = new DOCINFOW();
        di.pDocName = "PrintBroker Label";
        di.pDatatype = "RAW";

        if (!StartDocPrinter(hPrinter, 1, ref di)) {
            Console.WriteLine("ERROR: StartDocPrinter failed, error=" + Marshal.GetLastWin32Error());
            ClosePrinter(hPrinter);
            return false;
        }

        if (!StartPagePrinter(hPrinter)) {
            Console.WriteLine("ERROR: StartPagePrinter failed, error=" + Marshal.GetLastWin32Error());
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return false;
        }

        int written;
        bool ok = WritePrinter(hPrinter, data, data.Length, out written);

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        if (ok && written == data.Length) {
            Console.WriteLine("SUCCESS: Written " + written + " bytes");
            return true;
        } else {
            Console.WriteLine("ERROR: WritePrinter ok=" + ok + " written=" + written + "/" + data.Length + " error=" + Marshal.GetLastWin32Error());
            return false;
        }
    }
}
'@

$bytes = [System.IO.File]::ReadAllBytes('${safeFile}')
Write-Host "Sending $($bytes.Length) bytes to printer '${safePrinter}'..."
$ok = [RawPrinterHelper]::SendBytesToPrinter('${safePrinter}', $bytes)
if ($ok) {
    Write-Host "WRITEPRINTER_OK"
} else {
    Write-Host "WRITEPRINTER_FAIL"
    exit 1
}
`;

  fs.writeFileSync(ps1Path, psScript);

  try {
    const { stdout, stderr } = await execAsync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1Path + '"',
      { timeout: 15000 }
    );
    console.log("[LabelPrinter] WritePrinter output: " + stdout.trim());
    if (stderr) console.log("[LabelPrinter] WritePrinter stderr: " + stderr.trim());

    if (!stdout.includes("WRITEPRINTER_OK")) {
      throw new Error("WritePrinter failed: " + stdout.trim());
    }
    console.log("[LabelPrinter] SUCCESS via WritePrinter API");
  } finally {
    try { fs.unlinkSync(ps1Path); } catch {}
    try { fs.unlinkSync(tempFile); } catch {}
  }
}

async function sendRawToDevice(rawContent: string, printerName: string): Promise<void> {
  console.log("[LabelPrinter] sendRawToDevice called (" + rawContent.substring(0, 30).replace(/\n/g, " ") + "...)");
  console.log("[LabelPrinter] Printer: " + printerName);
  console.log("[LabelPrinter] Raw data length: " + rawContent.length + " bytes");

  // Convert to Buffer for raw transmission
  const dataBuffer = Buffer.from(rawContent, "ascii");

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
  console.log("[LabelPrinter] printRawData -> sendRawToDevice");
  await sendRawToDevice(content, printerName);
}

async function printZpl2BitmapLabel(
  html: string,
  printerName: string,
  widthMm: number,
  heightMm: number,
  copies: number
): Promise<void> {
  const DPI = 203;
  const dotsPerMm = DPI / 25.4;
  const widthDots = Math.round(widthMm * dotsPerMm);
  const heightDots = Math.round(heightMm * dotsPerMm);
  const bytesPerRow = Math.ceil(widthDots / 8);
  const totalBytes = bytesPerRow * heightDots;

  console.log("[LabelPrinter] ZPL2 bitmap: " + widthMm + "x" + heightMm + "mm = " + widthDots + "x" + heightDots + " dots");
  console.log("[LabelPrinter] Bytes per row: " + bytesPerRow + ", total: " + totalBytes + " bytes");

  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    // Step 1: Render HTML at 203 DPI
    const renderPage = await browser.newPage();
    const cssWidth = Math.round(widthMm * 96 / 25.4);
    const cssHeight = Math.round(heightMm * 96 / 25.4);
    const scaleFactor = DPI / 96;

    await renderPage.setViewport({
      width: cssWidth,
      height: cssHeight,
      deviceScaleFactor: scaleFactor
    });

    const wrappedHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'html, body { width: ' + widthMm + 'mm; height: ' + heightMm + 'mm; margin: 0; padding: 0; background: white !important; overflow: hidden; }' +
      '</style></head><body>' + html + '</body></html>';

    await renderPage.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });
    await renderPage.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));

    // Take screenshot as base64 PNG
    const screenshotBase64 = (await renderPage.screenshot({
      type: "png",
      encoding: "base64"
    })) as string;

    console.log("[LabelPrinter] Screenshot taken, base64 length: " + screenshotBase64.length);

    // Save PNG for debugging
    const debugPng = path.join(TEMP_DIR, "zpl2-debug-" + Date.now() + ".png");
    fs.writeFileSync(debugPng, Buffer.from(screenshotBase64, "base64"));
    console.log("[LabelPrinter] Debug PNG saved: " + debugPng);

    // Step 2: Convert to monochrome bitmap via canvas in browser
    const canvasPage = await browser.newPage();
    await canvasPage.setContent('<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>');

    const monoBytes: number[] = await canvasPage.evaluate(
      async (imgBase64: string, targetW: number, targetH: number) => {
        return new Promise<number[]>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.getElementById("c") as HTMLCanvasElement;
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d")!;
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.drawImage(img, 0, 0, targetW, targetH);
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            const d = imageData.data;
            const bpr = Math.ceil(targetW / 8);
            const bytes: number[] = [];

            for (let y = 0; y < targetH; y++) {
              for (let byteIdx = 0; byteIdx < bpr; byteIdx++) {
                let b = 0;
                for (let bit = 0; bit < 8; bit++) {
                  const x = byteIdx * 8 + bit;
                  if (x < targetW) {
                    const idx = (y * targetW + x) * 4;
                    const gray = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
                    if (gray < 128) {
                      b |= (1 << (7 - bit));
                    }
                  }
                }
                bytes.push(b);
              }
            }
            resolve(bytes);
          };
          img.src = "data:image/png;base64," + imgBase64;
        });
      },
      screenshotBase64,
      widthDots,
      heightDots
    );

    console.log("[LabelPrinter] Monochrome bitmap: " + monoBytes.length + " bytes (expected " + totalBytes + ")");

    // Count black pixels for debugging
    let blackPixels = 0;
    for (const b of monoBytes) {
      for (let bit = 0; bit < 8; bit++) {
        if (b & (1 << (7 - bit))) blackPixels++;
      }
    }
    console.log("[LabelPrinter] Black pixels: " + blackPixels + " / " + (widthDots * heightDots) + " (" + Math.round(blackPixels * 100 / (widthDots * heightDots)) + "%)");

    // Step 3: Generate ZPL II commands with ^GFA (Graphic Field - ASCII hex)
    const hexData = Buffer.from(monoBytes).toString("hex").toUpperCase();

    const zplCmd =
      "^XA" + "\r\n" +
      "^PW" + widthDots + "\r\n" +
      "^LL" + heightDots + "\r\n" +
      "^FO0,0^GFA," + totalBytes + "," + totalBytes + "," + bytesPerRow + "," + hexData + "\r\n" +
      "^PQ" + copies + "\r\n" +
      "^XZ" + "\r\n";

    console.log("[LabelPrinter] ZPL2 command total: " + zplCmd.length + " chars");
    console.log("[LabelPrinter] ZPL2: ^PW" + widthDots + " ^LL" + heightDots + " ^GFA," + totalBytes + "," + totalBytes + "," + bytesPerRow + ",[hex:" + hexData.length + "]");

    // Step 4: Send raw to printer
    await sendRawToDevice(zplCmd, printerName);
    console.log("[LabelPrinter] SUCCESS: ZPL2 bitmap sent to " + printerName);

    // Cleanup debug file
    setTimeout(() => { try { fs.unlinkSync(debugPng); } catch {} }, 10000);

  } finally {
    await browser.close();
  }
}

async function printHtmlLabel(
  html: string,
  printerName: string,
  jobId: string,
  paperSize: string,
  copies: number
): Promise<void> {
  console.log("[LabelPrinter] printHtmlLabel called - PDF approach");
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

    console.log("[LabelPrinter] Label: " + labelWidth + "x" + labelHeight + "mm (" + widthPx + "x" + heightPx + "px)");

    await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 2 });

    // Simple approach: create PDF at label dimensions, let Windows driver handle orientation
    // No CSS rotation - the driver knows how to print on the physical label
    const pageW = labelWidth;
    const pageH = labelHeight;

    const wrappedHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
      '@page { size: ' + pageW + 'mm ' + pageH + 'mm; margin: 0; }' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'html, body { width: ' + labelWidth + 'mm; height: ' + labelHeight + 'mm; margin: 0; padding: 0; background: white !important; overflow: hidden; }' +
      '</style></head><body>' + html + '</body></html>';

    const pagePxW = Math.round(pageW * 96 / 25.4);
    const pagePxH = Math.round(pageH * 96 / 25.4);
    await page.setViewport({ width: pagePxW, height: pagePxH, deviceScaleFactor: 2 });

    await page.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));

    const pdfPath = path.join(TEMP_DIR, jobId + ".pdf");
    const isLandscape = labelWidth > labelHeight;
    await page.pdf({
      path: pdfPath,
      width: pageW + "mm",
      height: pageH + "mm",
      printBackground: true,
      preferCSSPageSize: true,
      landscape: false,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
    });

    console.log("[LabelPrinter] PDF page: " + pageW + "x" + pageH + "mm, landscape content: " + isLandscape);

    console.log("[LabelPrinter] PDF generated: " + pdfPath + " (" + labelWidth + "x" + labelHeight + "mm)");

    // Also save PNG for image-based printing fallback
    const pngPath = pdfPath.replace(".pdf", ".png");
    await page.screenshot({
      path: pngPath,
      type: "png",
      clip: { x: 0, y: 0, width: pagePxW, height: pagePxH }
    });
    console.log("[LabelPrinter] PNG saved: " + pngPath);

    if (process.platform === "win32") {
      // STEP 1: Set printer paper size BEFORE printing
      await setPrinterPaperSize(printerName, labelWidth, labelHeight);

      // STEP 2: Print PDF
      await sendPdfToPrinter(pdfPath, printerName, copies, paperSize);
    } else {
      const printerArg = printerName ? '-P "' + printerName + '"' : "";
      await execAsync('lpr ' + printerArg + ' -# ' + copies + ' "' + pdfPath + '"');
      console.log("[LabelPrinter] Sent via lpr");
    }

    try { fs.unlinkSync(pdfPath); } catch {}
    try { fs.unlinkSync(pdfPath.replace(".pdf", ".png")); } catch {}

  } finally {
    await browser.close();
  }
}

// Set printer paper size using Windows Set-PrintConfiguration
async function setPrinterPaperSize(printerName: string, widthMm: number, heightMm: number): Promise<void> {
  // Set-PrintConfiguration uses units of 1/100 mm
  let w = Math.round(widthMm * 100);
  let h = Math.round(heightMm * 100);
  const safePrinter = printerName.replace(/'/g, "''");

  console.log("[LabelPrinter] Setting printer paper: " + widthMm + "x" + heightMm + "mm (" + w + "x" + h + " units)");

  // Write PS1 script to temp file (avoids ALL escaping issues)
  const ps1Path = path.join(TEMP_DIR, "set-paper.ps1");
  const psScript = `$ErrorActionPreference = 'Continue'

# Method 1: Set-PrintConfiguration (Windows Pro/Enterprise)
try {
  Set-PrintConfiguration -PrinterName '${safePrinter}' -PaperSizeWidth ${w} -PaperSizeHeight ${h}
  Write-Host 'OK: Paper set to ${w}x${h} units via Set-PrintConfiguration'
  exit 0
} catch {
  Write-Host "Set-PrintConfiguration failed (may need admin): $_"
}

# Method 2: List available paper sizes for debugging
try {
  Add-Type -AssemblyName System.Drawing
  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = '${safePrinter}'
  Write-Host 'Available paper sizes for ${safePrinter}:'
  $targetW = [Math]::Round(${widthMm} / 25.4 * 100)
  $targetH = [Math]::Round(${heightMm} / 25.4 * 100)
  $bestMatch = $null
  $bestDiff = 999999
  foreach ($ps in $pd.PrinterSettings.PaperSizes) {
    $diff = [Math]::Abs($ps.Width - $targetW) + [Math]::Abs($ps.Height - $targetH)
    Write-Host "  $($ps.PaperName): $($ps.Width)x$($ps.Height) hundredths-inch (diff=$diff)"
    if ($diff -lt $bestDiff) {
      $bestDiff = $diff
      $bestMatch = $ps
    }
  }
  if ($bestMatch -and $bestDiff -lt 50) {
    Write-Host "Best match: $($bestMatch.PaperName) (diff=$bestDiff)"
  }
  $pd.Dispose()
} catch {
  Write-Host "Paper size enumeration failed: $_"
}
`;

  fs.writeFileSync(ps1Path, psScript);

  try {
    const { stdout, stderr } = await execAsync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1Path + '"',
      { timeout: 15000 }
    );
    console.log("[LabelPrinter] Paper config: " + stdout.trim());
    if (stderr) console.log("[LabelPrinter] Paper config stderr: " + stderr.trim());
  } catch (e: any) {
    console.log("[LabelPrinter] Paper config error (non-fatal): " + e.message);
    if (e.stdout) console.log("[LabelPrinter] stdout: " + e.stdout);
  } finally {
    try { fs.unlinkSync(ps1Path); } catch {}
  }
}

async function sendPdfToPrinter(pdfPath: string, printerName: string, copies: number, paperSize?: string, pdfWidthMm?: number, pdfHeightMm?: number): Promise<void> {
  console.log("[LabelPrinter] sendPdfToPrinter: " + pdfPath + " paperSize: " + (paperSize || "default"));

  const paper = paperSize ? PAPER_SIZES[paperSize] : null;
  const isLabelSize = paper ? (paper.width <= 110 && paper.height <= 160) : false;

  console.log("[LabelPrinter] isLabel: " + isLabelSize + " paper: " + (paper ? paper.width + "x" + paper.height + "mm" : "none"));

  if (process.platform === "win32") {

    // Method 1: SumatraPDF with explicit paper size (most reliable for labels)
    if (isLabelSize && paper) {
      const sumatraPath = findSumatraPdf();
      if (sumatraPath) {
        const widthPt = Math.round(paper.width * 72 / 25.4);
        const heightPt = Math.round(paper.height * 72 / 25.4);
        try {
          const cmd = '"' + sumatraPath + '" -print-to "' + printerName + '" -print-settings "noscale,' + copies + 'x,paper=' + widthPt + 'x' + heightPt + '" -silent "' + pdfPath + '"';
          console.log("[LabelPrinter] SumatraPDF cmd: " + cmd);
          await execAsync(cmd, { shell: "cmd.exe", timeout: 30000 });
          console.log("[LabelPrinter] SUCCESS via SumatraPDF (paper=" + widthPt + "x" + heightPt + "pt)");
          return;
        } catch (e: any) {
          console.log("[LabelPrinter] SumatraPDF failed: " + e.message);
        }
      } else {
        console.log("[LabelPrinter] SumatraPDF not found");
      }
    }

    // Method 2: pdf-to-printer (paper size set by caller via Set-PrintConfiguration)
    try {
      const pdfToPrinter = await import("pdf-to-printer");
      await pdfToPrinter.print(pdfPath, {
        printer: printerName,
        copies: copies,
        orientation: "portrait",
        scale: isLabelSize ? "noscale" : "fit"
      });
      console.log("[LabelPrinter] SUCCESS via pdf-to-printer (scale: " + (isLabelSize ? "noscale" : "fit") + ")");
      return;
    } catch (e: any) {
      console.log("[LabelPrinter] pdf-to-printer failed: " + e.message);
    }

    // Method 3: Print as image via PowerShell .ps1 file (correct paper size)
    if (isLabelSize && paper) {
      try {
        await printPdfViaImage(pdfPath, printerName, copies, paper.width, paper.height);
        return;
      } catch (e: any) {
        console.log("[LabelPrinter] Image print failed: " + e.message);
      }
    }

    // Method 4: PowerShell Start-Process fallback
    try {
      const ps1 = path.join(TEMP_DIR, "print-fb.ps1");
      fs.writeFileSync(ps1, "Start-Process -FilePath '" + pdfPath.replace(/'/g, "''") + "' -Verb PrintTo -ArgumentList '" + printerName.replace(/'/g, "''") + "' -Wait\n");
      await execAsync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1 + '"', { timeout: 30000 });
      console.log("[LabelPrinter] Sent via PS Start-Process");
      try { fs.unlinkSync(ps1); } catch {}
    } catch (e3: any) {
      console.log("[LabelPrinter] All methods failed: " + e3.message);
      throw new Error("All PDF print methods failed for " + printerName);
    }
  } else {
    const printerArg = printerName ? '-P "' + printerName + '"' : "";
    const scaleArg = isLabelSize ? "" : "-o fit-to-page ";
    await execAsync('lpr ' + printerArg + ' ' + scaleArg + '-# ' + copies + ' "' + pdfPath + '"');
    console.log("[LabelPrinter] Sent via lpr");
  }
}

// Print PDF by first converting to PNG screenshot, then printing image with paper size
// Uses .ps1 file to avoid PowerShell escaping issues
async function printPdfViaImage(
  pdfPath: string,
  printerName: string,
  copies: number,
  widthMm: number,
  heightMm: number
): Promise<void> {
  const widthHI = Math.round(widthMm / 25.4 * 100);
  const heightHI = Math.round(heightMm / 25.4 * 100);

  console.log("[LabelPrinter] printPdfViaImage: " + widthMm + "x" + heightMm + "mm = " + widthHI + "x" + heightHI + " hundredths-inch");

  // Write PS script to file (no escaping issues!)
  const ps1 = path.join(TEMP_DIR, "print-img.ps1");
  const psContent = `$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Drawing.Printing

$printerName = '${printerName.replace(/'/g, "''")}'
$copies = ${copies}
$widthHI = ${widthHI}
$heightHI = ${heightHI}

# List available paper sizes for debugging
$pd0 = New-Object System.Drawing.Printing.PrintDocument
$pd0.PrinterSettings.PrinterName = $printerName
Write-Host "Printer: $printerName"
Write-Host "Available paper sizes:"
foreach ($ps in $pd0.PrinterSettings.PaperSizes) {
  Write-Host "  $($ps.PaperName): $($ps.Width)x$($ps.Height)"
}
$pd0.Dispose()

# Try to load image
$imgFile = '${pdfPath.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(".pdf", ".png")}'
if (-not (Test-Path $imgFile)) {
  $imgFile = '${pdfPath.replace(/\\/g, "\\\\").replace(/'/g, "''")}'
}

try {
  $img = [System.Drawing.Image]::FromFile($imgFile)
  Write-Host "Image: $($img.Width)x$($img.Height)px"
} catch {
  Write-Host "Cannot load image: $_"
  exit 1
}

for ($c = 0; $c -lt $copies; $c++) {
  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = $printerName

  # Set custom paper size
  $paper = New-Object System.Drawing.Printing.PaperSize('Label', $widthHI, $heightHI)
  $pd.DefaultPageSettings.PaperSize = $paper
  $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $pd.DefaultPageSettings.Landscape = $false

  $handler = {
    param($s, $e)
    $dest = New-Object System.Drawing.RectangleF(0, 0, $e.PageBounds.Width, $e.PageBounds.Height)
    $src = New-Object System.Drawing.RectangleF(0, 0, $img.Width, $img.Height)
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.DrawImage($img, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)
    $e.HasMorePages = $false
  }
  $pd.add_PrintPage($handler)
  $pd.Print()
  $pd.Dispose()
  Write-Host "Printed copy $($c + 1)/$copies"
}
$img.Dispose()
Write-Host "DONE"
`;

  fs.writeFileSync(ps1, psContent);
  console.log("[LabelPrinter] PS1 script saved: " + ps1);

  try {
    const { stdout, stderr } = await execAsync(
      'powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1 + '"',
      { timeout: 30000 }
    );
    console.log("[LabelPrinter] PS output: " + stdout.trim());
    if (stderr) console.log("[LabelPrinter] PS stderr: " + stderr.trim());
    if (!stdout.includes("DONE")) {
      throw new Error("PowerShell did not complete successfully");
    }
    console.log("[LabelPrinter] SUCCESS via image print");
  } finally {
    try { fs.unlinkSync(ps1); } catch {}
  }
}
