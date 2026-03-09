"use strict";
/**
 * Label Printer Service - PDF + TSPL modes
 * Supports TSC MX340P and other TSC printers
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
exports.printLabel = printLabel;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const net = __importStar(require("net"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const types_1 = require("../types");
const tsplGenerator_1 = require("./tsplGenerator");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const TEMP_DIR = path.join(os.tmpdir(), "print-broker");
// Dynamically find SumatraPDF executable (bundled with pdf-to-printer)
function findSumatraPdf() {
    const searchPaths = [
        path.join(process.cwd(), "node_modules", "pdf-to-printer", "dist"),
        path.join(process.cwd(), "node_modules", "pdf-to-printer"),
        path.join(process.cwd(), "node_modules", ".bin"),
    ];
    for (const dir of searchPaths) {
        try {
            if (!fs.existsSync(dir))
                continue;
            const files = fs.readdirSync(dir);
            const exe = files.find(f => f.toLowerCase().includes("sumatra") && f.endsWith(".exe"));
            if (exe) {
                const full = path.join(dir, exe);
                console.log("[LabelPrinter] Found SumatraPDF: " + full);
                return full;
            }
        }
        catch { }
    }
    // Deep search in pdf-to-printer
    try {
        const pdfPrinterDir = path.join(process.cwd(), "node_modules", "pdf-to-printer");
        if (fs.existsSync(pdfPrinterDir)) {
            const walkSync = (dir) => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (entry.isFile() && entry.name.toLowerCase().includes("sumatra") && entry.name.endsWith(".exe")) {
                        return path.join(dir, entry.name);
                    }
                    if (entry.isDirectory() && entry.name !== "node_modules") {
                        const found = walkSync(path.join(dir, entry.name));
                        if (found)
                            return found;
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
    }
    catch { }
    console.log("[LabelPrinter] SumatraPDF NOT found");
    return null;
}
// Generate DPL (Datamax Programming Language) label
// Citizen CL-S621 supports DPL emulation
function generateDplLabel(barcode, productName, widthMm, heightMm, copies) {
    const DPI = 203; // 8 dots/mm
    const widthDots = Math.round(widthMm * DPI / 25.4);
    const heightDots = Math.round(heightMm * DPI / 25.4);
    const gapDots = Math.round(2 * DPI / 25.4); // 2mm gap
    // Clean product name (ASCII only)
    const safeName = productName
        .replace(/[ąĄ]/g, "a").replace(/[ćĆ]/g, "c").replace(/[ęĘ]/g, "e")
        .replace(/[łŁ]/g, "l").replace(/[ńŃ]/g, "n").replace(/[óÓ]/g, "o")
        .replace(/[śŚ]/g, "s").replace(/[źŹżŻ]/g, "z")
        .replace(/[^\x20-\x7E]/g, "")
        .substring(0, 30);
    const lines = [];
    // STX + L = Start label format
    // Note: STX is 0x02
    lines.push("\x02L");
    lines.push("D11"); // Density 11
    lines.push("H10"); // Heat setting
    lines.push("q" + widthDots); // Label width in dots
    lines.push("Q" + heightDots + "," + gapDots + "+0"); // Height, gap
    lines.push("S2"); // Speed 2
    lines.push("e"); // Edge sensor
    // Text: row col rotation font hmult vmult data
    // Position text near top, centered-ish
    const textRow = "0020"; // 20 dots from top
    const textCol = "0010"; // 10 dots from left
    lines.push(textRow + textCol + "1" + "2" + "1" + "1" + safeName);
    // Barcode: row col rotation B barcode-type narrow wide height data
    // Code 128 = type "c"
    const barcodeRow = "0080"; // 80 dots from top
    const barcodeCol = "0010";
    const barcodeHeight = "100"; // 100 dots tall
    lines.push(barcodeRow + barcodeCol + "1" + "c" + "21" + barcodeHeight + barcode);
    // End/print
    lines.push("E");
    // Build buffer with actual STX byte
    let output = lines.join("\r\n") + "\r\n";
    // Replace \x02 with actual STX byte
    const buf = Buffer.from(output, "ascii");
    // For multiple copies, repeat the whole command
    const bufs = [];
    for (let i = 0; i < copies; i++) {
        bufs.push(buf);
    }
    return Buffer.concat(bufs);
}
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}
// Get printer port from Windows (PowerShell)
async function getPrinterPort(printerName) {
    if (process.platform !== "win32")
        return null;
    try {
        // Primary: PowerShell Get-PrinterPort
        const psCmd = `powershell -NoProfile -Command "(Get-Printer -Name '${printerName.replace(/'/g, "''")}').PortName"`;
        const { stdout } = await execAsync(psCmd, { encoding: "utf-8", timeout: 5000 });
        const port = stdout.trim();
        if (port)
            return port;
    }
    catch (e) {
        // Fallback: wmic
        try {
            const { stdout } = await execAsync(`wmic printer where "name='${printerName.replace(/'/g, "''")}'" get portname /value`, { shell: "cmd.exe", timeout: 5000 });
            const match = stdout.match(/PortName=(.+)/i);
            if (match)
                return match[1].trim();
        }
        catch { }
        console.log("[LabelPrinter] Failed to get printer port: " + e);
    }
    return null;
}
// Check if string is an IP address
function isIpAddress(str) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(str);
}
// Send raw data via TCP (for network printers)
async function sendViaTcp(data, ip, port = 9100) {
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
async function printLabel(request, printerName) {
    const jobId = "label-" + Date.now();
    const paperSize = request.paperSize || "50x30mm";
    const copies = request.copies || 1;
    const paper = types_1.PAPER_SIZES[paperSize] || { width: 50, height: 30 };
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
            // TSC/Godex = TSPL, everything else = PDF
            // TSPL: TSC, Godex
            const isTscPrinter = nameLower.includes("tsc") || nameLower.includes("godex");
            // CPCL: Citizen (CL-S621, CL-E)
            const isCpclPrinter = nameLower.includes("citizen") || nameLower.includes("cl-s") || nameLower.includes("cl-e");
            // ZPL: Zebra only
            const isZplPrinter = nameLower.includes("zebra");
            const useTspl = isTscPrinter && !isCpclPrinter && !isZplPrinter;
            const useDpl = false;
            const useZpl = isZplPrinter;
            const useCpcl = isCpclPrinter;
            // Set DPI based on printer model
            if (nameLower.includes("mx340") || nameLower.includes("mx240")) {
                (0, tsplGenerator_1.setDpi)(300);
            }
            else {
                (0, tsplGenerator_1.setDpi)(203);
            }
            console.log("[LabelPrinter] Mode: HTML");
            console.log("[LabelPrinter] TSPL: " + useTspl + ", ZPL: " + useZpl + ", CPCL: " + useCpcl + " (printer: " + printerName + ")");
            if (useTspl) {
                console.log("[LabelPrinter] Attempting HTML to TSPL conversion...");
                const parsed = (0, tsplGenerator_1.parseHtmlForTspl)(request.content);
                console.log("[LabelPrinter] Parsed data: " + JSON.stringify(parsed));
                if (parsed.barcode && parsed.productName) {
                    console.log("[LabelPrinter] SUCCESS: Using TSPL mode!");
                    const tspl = (0, tsplGenerator_1.generateSimpleTsplLabel)(parsed.barcode, parsed.productName, paper.width, paper.height, copies);
                    console.log("[LabelPrinter] Generated TSPL:");
                    console.log("---TSPL START---");
                    console.log(tspl);
                    console.log("---TSPL END---");
                    await sendRawToDevice(tspl, printerName);
                    return;
                }
                else {
                    console.log("[LabelPrinter] WARNING: TSPL parse failed, falling back to PDF!");
                    console.log("[LabelPrinter] barcode found: " + !!parsed.barcode);
                    console.log("[LabelPrinter] productName found: " + !!parsed.productName);
                }
            }
            if (useZpl) {
                console.log("[LabelPrinter] Attempting HTML to ZPL conversion (Citizen/Zebra)...");
                const parsed = (0, tsplGenerator_1.parseHtmlForTspl)(request.content);
                console.log("[LabelPrinter] Parsed data: " + JSON.stringify(parsed));
                if (parsed.barcode && parsed.productName) {
                    console.log("[LabelPrinter] SUCCESS: Using ZPL mode!");
                    const zpl = (0, tsplGenerator_1.generateZplLabel)(parsed.barcode, parsed.productName, paper.width, paper.height, copies);
                    console.log("[LabelPrinter] Generated ZPL:");
                    console.log("---ZPL START---");
                    console.log(zpl);
                    console.log("---ZPL END---");
                    // Send ZPL the same way as TSPL - raw data to printer
                    await sendRawToDevice(zpl, printerName);
                    return;
                }
                else {
                    console.log("[LabelPrinter] WARNING: ZPL parse failed, falling back to PDF!");
                }
            }
            if (useCpcl) {
                console.log("[LabelPrinter] Attempting CPCL bitmap mode for Citizen...");
                try {
                    await printCpclBitmapLabel(request.content, printerName, paper.width, paper.height, copies);
                    return;
                }
                catch (cpclErr) {
                    console.log("[LabelPrinter] CPCL failed: " + cpclErr.message);
                    console.log("[LabelPrinter] Falling back to PDF mode");
                }
            }
            if (useDpl) {
                console.log("[LabelPrinter] Attempting DPL (Datamax) for Citizen...");
                const parsed = (0, tsplGenerator_1.parseHtmlForTspl)(request.content);
                console.log("[LabelPrinter] Parsed: " + JSON.stringify(parsed));
                if (parsed.barcode && parsed.productName) {
                    const dplData = generateDplLabel(parsed.barcode, parsed.productName, paper.width, paper.height, copies);
                    console.log("[LabelPrinter] DPL command size: " + dplData.length + " bytes");
                    console.log("[LabelPrinter] DPL preview: " + dplData.toString("ascii").substring(0, 200));
                    try {
                        await sendRawToDevice(dplData.toString("ascii"), printerName);
                        console.log("[LabelPrinter] SUCCESS: Sent DPL to Citizen");
                        return;
                    }
                    catch (dplErr) {
                        console.log("[LabelPrinter] DPL send failed: " + dplErr.message);
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
            }
            finally {
                try {
                    fs.unlinkSync(pdfPath);
                }
                catch { }
            }
            break;
        default:
            throw new Error("Unsupported content type: " + request.contentType);
    }
}
async function sendRawToDevice(rawContent, printerName) {
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
                }
                catch (tcpErr) {
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
                }
                catch (tcpErr) {
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
                }
                catch (usbErr) {
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
            }
            catch (shareErr) {
                console.log("[LabelPrinter] Share copy failed: " + shareErr.message);
            }
            // Method 5: Last resort - print command (may not work for raw)
            console.log("[LabelPrinter] WARNING: Using print command (may not work for raw TSPL)");
            try {
                const printCmd = 'print /d:"' + printerName + '" "' + tempFile + '"';
                await execAsync(printCmd, { shell: "cmd.exe", timeout: 15000 });
                console.log("[LabelPrinter] Sent via print command (check output quality)");
            }
            catch (printErr) {
                console.log("[LabelPrinter] Print command failed: " + printErr.message);
                throw new Error("All print methods failed for " + printerName);
            }
        }
        else {
            // Linux/Mac: use lpr
            const printerArg = printerName ? '-P "' + printerName + '"' : "";
            await execAsync('lpr ' + printerArg + ' -o raw "' + tempFile + '"');
            console.log("[LabelPrinter] Sent via lpr raw");
        }
    }
    finally {
        setTimeout(() => { try {
            fs.unlinkSync(tempFile);
        }
        catch { } }, 5000);
    }
}
async function printRawData(content, printerName) {
    console.log("[LabelPrinter] printRawData -> sendRawToDevice");
    await sendRawToDevice(content, printerName);
}
async function printCpclBitmapLabel(html, printerName, widthMm, heightMm, copies) {
    const DPI = 203;
    const dotsPerMm = DPI / 25.4;
    const widthDots = Math.round(widthMm * dotsPerMm);
    const heightDots = Math.round(heightMm * dotsPerMm);
    const bytesPerRow = Math.ceil(widthDots / 8);
    console.log("[LabelPrinter] CPCL bitmap: " + widthMm + "x" + heightMm + "mm = " + widthDots + "x" + heightDots + " dots");
    console.log("[LabelPrinter] Bytes per row: " + bytesPerRow + ", total: " + (bytesPerRow * heightDots) + " bytes");
    const puppeteer = await Promise.resolve().then(() => __importStar(require("puppeteer")));
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    try {
        // Step 1: Render HTML at correct DPI
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
        }));
        console.log("[LabelPrinter] Screenshot taken, base64 length: " + screenshotBase64.length);
        // Save PNG for debugging
        const debugPng = path.join(TEMP_DIR, "cpcl-debug-" + Date.now() + ".png");
        fs.writeFileSync(debugPng, Buffer.from(screenshotBase64, "base64"));
        console.log("[LabelPrinter] Debug PNG saved: " + debugPng);
        // Step 2: Convert to monochrome bitmap via canvas in browser
        const canvasPage = await browser.newPage();
        await canvasPage.setContent('<!DOCTYPE html><html><body><canvas id="c"></canvas></body></html>');
        const monoBytes = await canvasPage.evaluate(async (imgBase64, targetW, targetH) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.getElementById("c");
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext("2d");
                    // White background
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, targetW, targetH);
                    // Draw image scaled to target size
                    ctx.drawImage(img, 0, 0, targetW, targetH);
                    const imageData = ctx.getImageData(0, 0, targetW, targetH);
                    const d = imageData.data;
                    const bpr = Math.ceil(targetW / 8);
                    const bytes = [];
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
        }, screenshotBase64, widthDots, heightDots);
        console.log("[LabelPrinter] Monochrome bitmap: " + monoBytes.length + " bytes (expected " + (bytesPerRow * heightDots) + ")");
        // Count black pixels for debugging
        let blackPixels = 0;
        for (const b of monoBytes) {
            for (let bit = 0; bit < 8; bit++) {
                if (b & (1 << (7 - bit)))
                    blackPixels++;
            }
        }
        console.log("[LabelPrinter] Black pixels: " + blackPixels + " / " + (widthDots * heightDots) + " (" + Math.round(blackPixels * 100 / (widthDots * heightDots)) + "%)");
        // Step 3: Generate CPCL commands
        const hexData = Buffer.from(monoBytes).toString("hex").toUpperCase();
        const cpclCmd = "! 0 200 200 " + heightDots + " " + copies + "\r\n" +
            "EG " + bytesPerRow + " " + heightDots + " 0 0 " + hexData + "\r\n" +
            "FORM\r\n" +
            "PRINT\r\n";
        console.log("[LabelPrinter] CPCL command total: " + cpclCmd.length + " chars");
        console.log("[LabelPrinter] CPCL header: ! 0 200 200 " + heightDots + " " + copies);
        console.log("[LabelPrinter] CPCL EG: " + bytesPerRow + " " + heightDots + " 0 0 [" + hexData.length + " hex chars]");
        // Step 4: Send raw to printer
        await sendRawToDevice(cpclCmd, printerName);
        console.log("[LabelPrinter] SUCCESS: CPCL bitmap sent to " + printerName);
        // Cleanup debug file
        setTimeout(() => { try {
            fs.unlinkSync(debugPng);
        }
        catch { } }, 10000);
    }
    finally {
        await browser.close();
    }
}
async function printHtmlLabel(html, printerName, jobId, paperSize, copies) {
    console.log("[LabelPrinter] printHtmlLabel called - PDF approach");
    const puppeteer = await Promise.resolve().then(() => __importStar(require("puppeteer")));
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    try {
        const page = await browser.newPage();
        const paper = types_1.PAPER_SIZES[paperSize] || { width: 50, height: 30 };
        const labelWidth = paper.width;
        const labelHeight = paper.height;
        const widthPx = Math.round(labelWidth * 96 / 25.4);
        const heightPx = Math.round(labelHeight * 96 / 25.4);
        console.log("[LabelPrinter] Label: " + labelWidth + "x" + labelHeight + "mm (" + widthPx + "x" + heightPx + "px)");
        await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 2 });
        // For label printers that auto-rotate: use portrait page (swap dimensions)
        // and CSS-rotate the content -90deg so it comes out correct
        const needsRotation = labelWidth > labelHeight;
        const pageW = needsRotation ? labelHeight : labelWidth;
        const pageH = needsRotation ? labelWidth : labelHeight;
        let wrappedHtml;
        if (needsRotation) {
            // Portrait page (30x50mm) with content rotated -90deg
            wrappedHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
                '@page { size: ' + pageW + 'mm ' + pageH + 'mm; margin: 0; }' +
                '* { box-sizing: border-box; margin: 0; padding: 0; }' +
                'html, body { width: ' + pageW + 'mm; height: ' + pageH + 'mm; margin: 0; padding: 0; background: white !important; overflow: hidden; }' +
                '.rotate-wrap { width: ' + labelWidth + 'mm; height: ' + labelHeight + 'mm; transform: rotate(90deg) translateY(-' + labelHeight + 'mm); transform-origin: top left; position: absolute; top: 0; left: 0; }' +
                '</style></head><body><div class="rotate-wrap">' + html + '</div></body></html>';
        }
        else {
            wrappedHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
                '@page { size: ' + pageW + 'mm ' + pageH + 'mm; margin: 0; }' +
                '* { box-sizing: border-box; margin: 0; padding: 0; }' +
                'html, body { width: ' + labelWidth + 'mm; height: ' + labelHeight + 'mm; margin: 0; padding: 0; background: white !important; overflow: hidden; }' +
                '</style></head><body>' + html + '</body></html>';
        }
        const pagePxW = Math.round(pageW * 96 / 25.4);
        const pagePxH = Math.round(pageH * 96 / 25.4);
        await page.setViewport({ width: pagePxW, height: pagePxH, deviceScaleFactor: 2 });
        await page.setContent(wrappedHtml, { waitUntil: ["load", "networkidle0"], timeout: 30000 });
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 500)));
        const pdfPath = path.join(TEMP_DIR, jobId + ".pdf");
        await page.pdf({
            path: pdfPath,
            width: pageW + "mm",
            height: pageH + "mm",
            printBackground: true,
            preferCSSPageSize: true,
            landscape: false,
            margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" }
        });
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
        }
        else {
            const printerArg = printerName ? '-P "' + printerName + '"' : "";
            await execAsync('lpr ' + printerArg + ' -# ' + copies + ' "' + pdfPath + '"');
            console.log("[LabelPrinter] Sent via lpr");
        }
        try {
            fs.unlinkSync(pdfPath);
        }
        catch { }
        try {
            fs.unlinkSync(pdfPath.replace(".pdf", ".png"));
        }
        catch { }
    }
    finally {
        await browser.close();
    }
}
// Set printer paper size using Windows Set-PrintConfiguration
async function setPrinterPaperSize(printerName, widthMm, heightMm) {
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
        const { stdout, stderr } = await execAsync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1Path + '"', { timeout: 15000 });
        console.log("[LabelPrinter] Paper config: " + stdout.trim());
        if (stderr)
            console.log("[LabelPrinter] Paper config stderr: " + stderr.trim());
    }
    catch (e) {
        console.log("[LabelPrinter] Paper config error (non-fatal): " + e.message);
        if (e.stdout)
            console.log("[LabelPrinter] stdout: " + e.stdout);
    }
    finally {
        try {
            fs.unlinkSync(ps1Path);
        }
        catch { }
    }
}
async function sendPdfToPrinter(pdfPath, printerName, copies, paperSize, pdfWidthMm, pdfHeightMm) {
    console.log("[LabelPrinter] sendPdfToPrinter: " + pdfPath + " paperSize: " + (paperSize || "default"));
    const paper = paperSize ? types_1.PAPER_SIZES[paperSize] : null;
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
                }
                catch (e) {
                    console.log("[LabelPrinter] SumatraPDF failed: " + e.message);
                }
            }
            else {
                console.log("[LabelPrinter] SumatraPDF not found");
            }
        }
        // Method 2: pdf-to-printer (paper size set by caller via Set-PrintConfiguration)
        try {
            const pdfToPrinter = await Promise.resolve().then(() => __importStar(require("pdf-to-printer")));
            await pdfToPrinter.print(pdfPath, {
                printer: printerName,
                copies: copies,
                orientation: "portrait",
                scale: isLabelSize ? "noscale" : "fit"
            });
            console.log("[LabelPrinter] SUCCESS via pdf-to-printer (scale: " + (isLabelSize ? "noscale" : "fit") + ")");
            return;
        }
        catch (e) {
            console.log("[LabelPrinter] pdf-to-printer failed: " + e.message);
        }
        // Method 3: Print as image via PowerShell .ps1 file (correct paper size)
        if (isLabelSize && paper) {
            try {
                await printPdfViaImage(pdfPath, printerName, copies, paper.width, paper.height);
                return;
            }
            catch (e) {
                console.log("[LabelPrinter] Image print failed: " + e.message);
            }
        }
        // Method 4: PowerShell Start-Process fallback
        try {
            const ps1 = path.join(TEMP_DIR, "print-fb.ps1");
            fs.writeFileSync(ps1, "Start-Process -FilePath '" + pdfPath.replace(/'/g, "''") + "' -Verb PrintTo -ArgumentList '" + printerName.replace(/'/g, "''") + "' -Wait\n");
            await execAsync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1 + '"', { timeout: 30000 });
            console.log("[LabelPrinter] Sent via PS Start-Process");
            try {
                fs.unlinkSync(ps1);
            }
            catch { }
        }
        catch (e3) {
            console.log("[LabelPrinter] All methods failed: " + e3.message);
            throw new Error("All PDF print methods failed for " + printerName);
        }
    }
    else {
        const printerArg = printerName ? '-P "' + printerName + '"' : "";
        const scaleArg = isLabelSize ? "" : "-o fit-to-page ";
        await execAsync('lpr ' + printerArg + ' ' + scaleArg + '-# ' + copies + ' "' + pdfPath + '"');
        console.log("[LabelPrinter] Sent via lpr");
    }
}
// Print PDF by first converting to PNG screenshot, then printing image with paper size
// Uses .ps1 file to avoid PowerShell escaping issues
async function printPdfViaImage(pdfPath, printerName, copies, widthMm, heightMm) {
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
        const { stdout, stderr } = await execAsync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps1 + '"', { timeout: 30000 });
        console.log("[LabelPrinter] PS output: " + stdout.trim());
        if (stderr)
            console.log("[LabelPrinter] PS stderr: " + stderr.trim());
        if (!stdout.includes("DONE")) {
            throw new Error("PowerShell did not complete successfully");
        }
        console.log("[LabelPrinter] SUCCESS via image print");
    }
    finally {
        try {
            fs.unlinkSync(ps1);
        }
        catch { }
    }
}
//# sourceMappingURL=labelPrinter.js.map