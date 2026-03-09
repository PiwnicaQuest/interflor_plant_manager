"use strict";
/**
 * Receipt Printer Service
 * Primary: TSPL mode (compatible with Xprinter and similar thermal printers)
 * Secondary: ESC/POS raster image
 * Transport: Direct TCP port 9100 (preferred) or Windows raw print
 *
 * Based on working Android app (Interflor.apk / XPrintWBA) which uses:
 *   TSPL: SIZE, GAP 0mm, BITMAP, PRINT
 *   Transport: TCP socket to port 9100
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.printReceipt = printReceipt;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const net = __importStar(require("net"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const types_1 = require("../types");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const TEMP_DIR = path.join(os.tmpdir(), "print-broker");
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}
// =============================================
// Printer port/IP detection
// =============================================
async function getPrinterPort(printerName) {
    if (process.platform !== "win32")
        return null;
    try {
        const psCmd = `powershell -NoProfile -Command "(Get-Printer -Name '${printerName.replace(/'/g, "''")}').PortName"`;
        const { stdout } = await execAsync(psCmd, { encoding: "utf-8", timeout: 5000 });
        const port = stdout.trim();
        if (port)
            return port;
    }
    catch { }
    try {
        const { stdout } = await execAsync(`wmic printer where "name='${printerName.replace(/'/g, "''")}'" get portname /value`, { shell: "cmd.exe", timeout: 5000 });
        const match = stdout.match(/PortName=(.+)/i);
        if (match)
            return match[1].trim();
    }
    catch { }
    return null;
}
function extractIp(port) {
    if (!port)
        return null;
    // Direct IP
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(port))
        return port;
    // IP_ prefix (e.g., IP_192.168.1.100)
    if (port.startsWith("IP_")) {
        const ip = port.replace("IP_", "");
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip))
            return ip;
    }
    // TCPIP port name with IP
    const ipMatch = port.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (ipMatch)
        return ipMatch[1];
    return null;
}
// =============================================
// TCP transport (same as Android app)
// =============================================
async function sendViaTcp(data, ip, port = 9100) {
    return new Promise((resolve, reject) => {
        console.log(`[ReceiptPrinter] TCP connecting to ${ip}:${port} (${data.length} bytes)...`);
        const client = new net.Socket();
        client.setTimeout(10000);
        client.on("error", (err) => { client.destroy(); reject(err); });
        client.on("timeout", () => { client.destroy(); reject(new Error("TCP timeout")); });
        client.connect(port, ip, () => {
            console.log("[ReceiptPrinter] TCP connected, sending data...");
            client.write(data, () => {
                console.log("[ReceiptPrinter] TCP data sent, closing...");
                client.end();
            });
        });
        client.on("close", () => {
            console.log("[ReceiptPrinter] TCP connection closed");
            resolve();
        });
    });
}
// =============================================
// Raw data transport (USB, share, winspool)
// =============================================
async function sendRawViaUsb(data, printerName) {
    if (process.platform !== "win32")
        return false;
    const port = await getPrinterPort(printerName);
    console.log(`[ReceiptPrinter] Printer port: ${port}`);
    // USB/COM direct write
    if (port && (port.startsWith("USB") || port.startsWith("COM"))) {
        const tempFile = path.join(TEMP_DIR, `receipt-raw-${Date.now()}.bin`);
        fs.writeFileSync(tempFile, data);
        try {
            const portPath = "\\\\.\\" + port;
            const psScript = `
$bytes = [System.IO.File]::ReadAllBytes('${tempFile.replace(/\\/g, "\\\\").replace(/'/g, "''")}')
$fs = [System.IO.File]::OpenWrite('${portPath}')
$fs.Write($bytes, 0, $bytes.Length)
$fs.Close()
Write-Host "Written $($bytes.Length) bytes to ${port}"
`;
            const ps1UsbPath = path.join(TEMP_DIR, "usb-write-" + Date.now() + ".ps1");
            fs.writeFileSync(ps1UsbPath, psScript);
            const { stdout } = await execAsync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1UsbPath + '"', {
                timeout: 15000
            });
            try {
                fs.unlinkSync(ps1UsbPath);
            }
            catch { }
            console.log("[ReceiptPrinter] USB write: " + stdout.trim());
            return true;
        }
        catch (e) {
            console.log("[ReceiptPrinter] USB write failed: " + e.message);
        }
        finally {
            setTimeout(() => { try {
                fs.unlinkSync(tempFile);
            }
            catch { } }, 3000);
        }
    }
    return false;
}
async function sendRawViaWinspool(data, printerName) {
    if (process.platform !== "win32")
        return false;
    const tempFile = path.join(TEMP_DIR, `receipt-winspool-${Date.now()}.bin`);
    fs.writeFileSync(tempFile, data);
    try {
        const psRaw = `
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
    public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes) {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Receipt";
        di.pDataType = "RAW";
        if (!OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) return false;
        if (!StartDocPrinter(hPrinter, 1, di)) { ClosePrinter(hPrinter); return false; }
        if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
        Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
        int dwWritten;
        bool ok = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);
        return ok;
    }
}
'@
$bytes = [System.IO.File]::ReadAllBytes('${tempFile.replace(/\\/g, "\\\\").replace(/'/g, "''")}')
$result = [RawPrinterHelper]::SendBytesToPrinter('${printerName.replace(/'/g, "''")}', $bytes)
Write-Host "RawPrinterHelper: $result ($($bytes.Length) bytes)"
if (-not $result) { exit 1 }
`;
        const ps1WinPath = path.join(TEMP_DIR, "winspool-" + Date.now() + ".ps1");
        fs.writeFileSync(ps1WinPath, psRaw);
        const { stdout } = await execAsync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1WinPath + '"', {
            timeout: 30000
        });
        try {
            fs.unlinkSync(ps1WinPath);
        }
        catch { }
        console.log("[ReceiptPrinter] Winspool: " + stdout.trim());
        return true;
    }
    catch (e) {
        console.log("[ReceiptPrinter] Winspool failed: " + e.message);
        return false;
    }
    finally {
        setTimeout(() => { try {
            fs.unlinkSync(tempFile);
        }
        catch { } }, 3000);
    }
}
// =============================================
// Send raw data to printer - try all methods
// =============================================
async function sendToPrinter(data, printerName) {
    console.log(`[ReceiptPrinter] Sending ${data.length} bytes to "${printerName}"`);
    // 1. Try direct TCP (like the Android app does)
    const port = await getPrinterPort(printerName);
    const ip = extractIp(port);
    if (ip) {
        try {
            await sendViaTcp(data, ip, 9100);
            return;
        }
        catch (e) {
            console.log("[ReceiptPrinter] TCP to " + ip + " failed: " + e.message);
        }
    }
    // 2. Try USB raw write
    if (await sendRawViaUsb(data, printerName))
        return;
    // 3. Try Windows RAW print API (winspool.drv)
    if (await sendRawViaWinspool(data, printerName))
        return;
    // 4. Try printer share
    if (process.platform === "win32") {
        const hostname = os.hostname();
        const share = "\\\\" + hostname + "\\" + printerName;
        const tempFile = path.join(TEMP_DIR, `receipt-share-${Date.now()}.bin`);
        fs.writeFileSync(tempFile, data);
        try {
            await execAsync('copy /b "' + tempFile + '" "' + share + '"', { shell: "cmd.exe", timeout: 15000 });
            console.log("[ReceiptPrinter] Sent via printer share");
            return;
        }
        catch (e) {
            console.log("[ReceiptPrinter] Share failed: " + e.message);
        }
        finally {
            setTimeout(() => { try {
                fs.unlinkSync(tempFile);
            }
            catch { } }, 3000);
        }
    }
    // 5. macOS / Linux: lpr raw
    if (process.platform !== "win32") {
        const tempFile = path.join(TEMP_DIR, `receipt-lpr-${Date.now()}.bin`);
        fs.writeFileSync(tempFile, data);
        try {
            const printerArg = printerName ? `-P "${printerName}"` : "";
            await execAsync(`lpr ${printerArg} -o raw "${tempFile}"`);
            console.log("[ReceiptPrinter] Sent via lpr raw");
            return;
        }
        finally {
            setTimeout(() => { try {
                fs.unlinkSync(tempFile);
            }
            catch { } }, 3000);
        }
    }
    throw new Error("All print transport methods failed for " + printerName);
}
// =============================================
// TSPL receipt builder (same as Android app)
// =============================================
function buildTsplReceipt(bitmapData, widthDots, heightDots, paperWidthMm, copies) {
    const bytesPerLine = Math.ceil(widthDots / 8);
    // Calculate height in mm from dots (203 DPI)
    const heightMm = Math.ceil(heightDots / 203 * 25.4) + 2;
    const parts = [];
    // TSPL setup commands (same as Android app's buildTsplCommand)
    parts.push(Buffer.from(`SIZE ${paperWidthMm} mm,${heightMm} mm\r\n`, "ascii"));
    parts.push(Buffer.from("GAP 0 mm,0 mm\r\n", "ascii")); // Continuous paper, no gap detection
    parts.push(Buffer.from("DIRECTION 1\r\n", "ascii"));
    parts.push(Buffer.from("CLS\r\n", "ascii"));
    // BITMAP x,y,width(bytes),height(dots),mode,data
    // TSPL: bit=0 means BLACK, bit=1 means WHITE (inverted from our bitmap)
    parts.push(Buffer.from(`BITMAP 0,0,${bytesPerLine},${heightDots},0,`, "ascii"));
    // Invert bitmap data (our format: 1=black, TSPL: 0=black)
    const inverted = Buffer.alloc(bitmapData.length);
    for (let i = 0; i < bitmapData.length; i++) {
        inverted[i] = (~bitmapData[i]) & 0xFF;
    }
    parts.push(inverted);
    // Print
    parts.push(Buffer.from(`\r\nPRINT ${copies}\r\n`, "ascii"));
    return Buffer.concat(parts);
}
// =============================================
// ESC/POS raster builder (fallback)
// =============================================
function buildEscPosRaster(bitmapData, widthDots, heightDots, copies) {
    const bytesPerLine = Math.ceil(widthDots / 8);
    const commands = [];
    for (let c = 0; c < copies; c++) {
        // ESC @ - Initialize printer
        commands.push(0x1B, 0x40);
        // Set line spacing to 0
        commands.push(0x1B, 0x33, 0x00);
        // Send in bands of 256 rows
        const BAND = 256;
        let row = 0;
        while (row < heightDots) {
            const bandRows = Math.min(BAND, heightDots - row);
            // GS v 0 - Raster bit image, mode=0
            commands.push(0x1D, 0x76, 0x30, 0x00);
            commands.push(bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF);
            commands.push(bandRows & 0xFF, (bandRows >> 8) & 0xFF);
            const start = row * bytesPerLine;
            const end = (row + bandRows) * bytesPerLine;
            for (let i = start; i < end; i++) {
                commands.push(bitmapData[i] || 0);
            }
            row += bandRows;
        }
        // Feed + partial cut
        commands.push(0x1B, 0x64, 0x05);
        commands.push(0x1D, 0x56, 0x42, 0x00);
    }
    return Buffer.from(commands);
}
// =============================================
// Main entry point
// =============================================
async function printReceipt(request, printerName) {
    console.log(`[ReceiptPrinter] Printing to ${printerName}`);
    const jobId = `receipt-${Date.now()}`;
    const paperSize = request.paperSize || "80mm";
    const copies = request.copies || 1;
    if (request.contentType === "html") {
        await printHtmlReceipt(request.content, printerName, jobId, paperSize, copies);
    }
    else if (request.contentType === "raw") {
        // Raw data (ESC/POS or TSPL) - send directly
        let buffer;
        try {
            buffer = Buffer.from(request.content, "base64");
        }
        catch {
            buffer = Buffer.from(request.content, "utf-8");
        }
        if (copies > 1) {
            const bufs = [];
            for (let i = 0; i < copies; i++)
                bufs.push(buffer);
            buffer = Buffer.concat(bufs);
        }
        await sendToPrinter(buffer, printerName);
    }
    else {
        throw new Error(`Unsupported content type for receipts: ${request.contentType}`);
    }
}
// =============================================
// HTML Receipt -> PDF -> printer (via Windows driver)
// Falls back to ESC/POS bitmap if PDF printing fails
// =============================================
async function printHtmlReceipt(html, printerName, jobId, paperSize, copies) {
    const puppeteer = await Promise.resolve().then(() => __importStar(require("puppeteer")));
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    try {
        const page = await browser.newPage();
        const paper = types_1.PAPER_SIZES[paperSize] || { width: 80, height: 297 };
        const paperWidthMm = paper.width;
        // CSS viewport width (96 DPI)
        const cssWidth = Math.round(paperWidthMm * 96 / 25.4);
        console.log("[ReceiptPrinter] Paper: " + paperWidthMm + "mm, CSS: " + cssWidth + "px");
        // Render HTML
        await page.setViewport({ width: cssWidth, height: 2000, deviceScaleFactor: 2 });
        // First render: no @page (to measure content height without page breaks)
        const measureHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
            '* { box-sizing: border-box; margin: 0; padding: 0; }' +
            'html, body { width: ' + paperWidthMm + 'mm; margin: 0; padding: 0; background: white !important; }' +
            '</style></head><body>' + html + '</body></html>';
        await page.setContent(measureHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });
        await page.evaluate(() => {
            document.body.style.backgroundColor = "white";
            document.documentElement.style.backgroundColor = "white";
        });
        await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
        // Measure actual content height
        const contentHeight = await page.evaluate(() => {
            return Math.ceil(document.body.scrollHeight);
        });
        const contentHeightMm = Math.ceil(contentHeight * 25.4 / 96) + 5; // add 5mm margin
        // Second render: with @page matching exact content size (single page, no breaks)
        const wrappedHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
            '@page { size: ' + paperWidthMm + 'mm ' + contentHeightMm + 'mm; margin: 0; }' +
            '* { box-sizing: border-box; margin: 0; padding: 0; }' +
            'html, body { width: ' + paperWidthMm + 'mm; height: ' + contentHeightMm + 'mm; margin: 0; padding: 0; background: white !important; overflow: visible; }' +
            '</style></head><body>' + html + '</body></html>';
        await page.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });
        await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
        console.log("[ReceiptPrinter] Content height: " + contentHeight + "px = " + contentHeightMm + "mm");
        // Generate PDF with exact content height
        const pdfPath = path.join(TEMP_DIR, jobId + ".pdf");
        await page.pdf({
            path: pdfPath,
            width: paperWidthMm + "mm",
            height: contentHeightMm + "mm",
            printBackground: true,
            preferCSSPageSize: false,
            landscape: false,
            margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
        });
        console.log("[ReceiptPrinter] PDF generated: " + pdfPath + " (" + paperWidthMm + "x" + contentHeightMm + "mm)");
        // Try PDF printing via Windows driver
        if (process.platform === "win32") {
            let pdfPrinted = false;
            // Method 1: pdf-to-printer
            try {
                const pdfToPrinter = await Promise.resolve().then(() => __importStar(require("pdf-to-printer")));
                await pdfToPrinter.print(pdfPath, {
                    printer: printerName,
                    copies: copies,
                    scale: "fit"
                });
                console.log("[ReceiptPrinter] SUCCESS via pdf-to-printer");
                pdfPrinted = true;
            }
            catch (e) {
                console.log("[ReceiptPrinter] pdf-to-printer failed: " + e.message);
            }
            // Method 2: PowerShell Start-Process
            if (!pdfPrinted) {
                try {
                    const ps1Path = path.join(TEMP_DIR, "receipt-print-" + Date.now() + ".ps1");
                    const safePrinter = printerName.replace(/'/g, "''");
                    const safePdf = pdfPath.replace(/'/g, "''");
                    fs.writeFileSync(ps1Path, "Start-Process -FilePath '" + safePdf + "' -Verb PrintTo -ArgumentList '" + safePrinter + "' -Wait\n");
                    await execAsync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1Path + '"', { timeout: 30000 });
                    console.log("[ReceiptPrinter] SUCCESS via PS Start-Process");
                    pdfPrinted = true;
                    try {
                        fs.unlinkSync(ps1Path);
                    }
                    catch { }
                }
                catch (e) {
                    console.log("[ReceiptPrinter] PS Start-Process failed: " + e.message);
                }
            }
            if (pdfPrinted) {
                try {
                    fs.unlinkSync(pdfPath);
                }
                catch { }
                return;
            }
            console.log("[ReceiptPrinter] PDF methods failed, falling back to ESC/POS bitmap...");
        }
        // Fallback: ESC/POS bitmap (for non-Windows or if PDF fails)
        await printReceiptViaBitmap(page, printerName, paperWidthMm, copies);
        try {
            fs.unlinkSync(pdfPath);
        }
        catch { }
    }
    finally {
        await browser.close();
    }
}
// =============================================
// Fallback: ESC/POS bitmap printing
// =============================================
async function printReceiptViaBitmap(page, printerName, paperWidthMm, copies) {
    const PRINT_DOTS = paperWidthMm >= 70 ? 576 : 384;
    // Take full-page screenshot
    const screenshotBase64 = await page.screenshot({
        fullPage: true,
        type: "png",
        encoding: "base64"
    });
    console.log("[ReceiptPrinter] Screenshot for bitmap (base64 len: " + screenshotBase64.length + ")");
    // Convert to 1-bit bitmap
    const bitmap = await page.evaluate(async (imgB64, targetW) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = targetW;
                canvas.height = Math.round(img.height * targetW / img.width);
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const bytesPerLine = Math.ceil(canvas.width / 8);
                const result = [];
                for (let y = 0; y < canvas.height; y++) {
                    for (let xByte = 0; xByte < bytesPerLine; xByte++) {
                        let byte = 0;
                        for (let bit = 0; bit < 8; bit++) {
                            const x = xByte * 8 + bit;
                            if (x < canvas.width) {
                                const idx = (y * canvas.width + x) * 4;
                                const r = imageData.data[idx];
                                const g = imageData.data[idx + 1];
                                const b = imageData.data[idx + 2];
                                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                                if (gray < 128)
                                    byte |= (0x80 >> bit);
                            }
                        }
                        result.push(byte);
                    }
                }
                resolve({ data: result, width: canvas.width, height: canvas.height });
            };
            img.src = "data:image/png;base64," + imgB64;
        });
    }, screenshotBase64, PRINT_DOTS);
    console.log("[ReceiptPrinter] Bitmap: " + bitmap.width + "x" + bitmap.height + ", " + bitmap.data.length + " bytes");
    // Always use ESC/POS for receipt printers
    const printData = buildEscPosRaster(bitmap.data, bitmap.width, bitmap.height, copies);
    console.log("[ReceiptPrinter] ESC/POS command size: " + printData.length + " bytes");
    await sendToPrinter(printData, printerName);
    console.log("[ReceiptPrinter] SUCCESS via ESC/POS bitmap");
}
//# sourceMappingURL=receiptPrinter.js.map