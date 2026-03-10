/**
 * TSPL Generator for TSC printers (MX340P, TE200, etc.)
 * TSC MX340P: 300 DPI industrial printer
 * CENTERED layout
 */

export interface TsplLabelData {
  productName: string;
  barcode: string;
  unitsPerPallet?: number;
  potSize?: string;
  width: number;
  height: number;
}

// Default 203 DPI (most common: Citizen, Xprinter, Zebra)
// TSC MX340P uses 300 DPI
let CURRENT_DPI = 203;

function setDpi(dpi: number): void {
  CURRENT_DPI = dpi;
}

function mmToDots(mm: number): number {
  return Math.round(mm * CURRENT_DPI / 25.4);
}

function escapeTspl(text: string): string {
  // Remove special characters, keep only ASCII printable
  return text
    .replace(/[ąĄ]/g, 'a').replace(/[ćĆ]/g, 'c').replace(/[ęĘ]/g, 'e')
    .replace(/[łŁ]/g, 'l').replace(/[ńŃ]/g, 'n').replace(/[óÓ]/g, 'o')
    .replace(/[śŚ]/g, 's').replace(/[źŹżŻ]/g, 'z')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

// Font widths in dots (approximate for TSC built-in fonts)
const FONT_WIDTHS: Record<string, number> = {
  "1": 8,   // 8x12
  "2": 12,  // 12x20
  "3": 16,  // 16x24
  "4": 24,  // 24x32
  "5": 32,  // 32x48
};

// Calculate text width in dots
function getTextWidth(text: string, font: string): number {
  const charWidth = FONT_WIDTHS[font] || 16;
  return text.length * charWidth;
}

// Calculate barcode width (CODE128)
// CODE128: start (11) + data (11 per char) + checksum (11) + stop (13) + quiet zones (20)
function getBarcodeWidth(data: string, narrowWidth: number = 2): number {
  const dataModules = data.length * 11;
  const totalModules = 11 + dataModules + 11 + 13; // start + data + checksum + stop
  return (totalModules * narrowWidth) + 40; // + quiet zones
}

export function generateTsplLabel(data: TsplLabelData, copies: number = 1): string {
  const { productName, barcode, unitsPerPallet, potSize, width, height } = data;

  const labelWidth = mmToDots(width);
  const labelHeight = mmToDots(height);
  const commands: string[] = [];

  // Header
  commands.push("SIZE " + width + " mm, " + height + " mm");
  commands.push("GAP 0 mm, 0 mm");
  commands.push("SPEED 10");
  commands.push("DENSITY 8");
  commands.push("DIRECTION 1");
  commands.push("CLS");

  // Product name - centered
  const safeName = escapeTspl(truncate(productName, 35));
  const nameFontSize = safeName.length > 25 ? "3" : "4";
  const textWidth = getTextWidth(safeName, nameFontSize);
  const textX = Math.max(10, Math.round((labelWidth - textWidth) / 2));
  commands.push("TEXT " + textX + "," + mmToDots(3) + ",\"" + nameFontSize + "\",0,1,1,\"" + safeName + "\"");

  // Info line - centered
  if (potSize || unitsPerPallet) {
    const infoText = [potSize, unitsPerPallet ? unitsPerPallet + " szt./pal" : ""].filter(Boolean).join(" | ");
    const safeInfo = escapeTspl(infoText);
    const infoWidth = getTextWidth(safeInfo, "2");
    const infoX = Math.max(10, Math.round((labelWidth - infoWidth) / 2));
    commands.push("TEXT " + infoX + "," + mmToDots(11) + ",\"2\",0,1,1,\"" + safeInfo + "\"");
  }

  // Barcode - centered, auto-fit narrow width
  let narrowW = 2;
  let barcodeWidthDots = getBarcodeWidth(barcode, narrowW);
  while (barcodeWidthDots > labelWidth - 4 && narrowW > 1) {
    narrowW--;
    barcodeWidthDots = getBarcodeWidth(barcode, narrowW);
  }
  const barcodeX = Math.max(2, Math.round((labelWidth - barcodeWidthDots) / 2));
  const barcodeY = mmToDots(height - 11);
  const barcodeHeight = mmToDots(10);
  commands.push("BARCODE " + barcodeX + "," + barcodeY + ",\"128\"," + barcodeHeight + ",1,0," + narrowW + ",3,\"" + barcode + "\"");

  commands.push("PRINT " + copies);

  return commands.join("\r\n") + "\r\n";
}

export function generateSimpleTsplLabel(
  barcode: string,
  productName: string,
  width: number = 50,
  height: number = 30,
  copies: number = 1
): string {
  const labelWidth = mmToDots(width);
  const labelHeight = mmToDots(height);
  const commands: string[] = [];

  // Header
  commands.push("SIZE " + width + " mm, " + height + " mm");
  commands.push("GAP 0 mm, 0 mm");
  commands.push("SPEED 10");
  commands.push("DENSITY 8");
  commands.push("DIRECTION 1");
  commands.push("CLS");

  // Text - centered
  const safeName = escapeTspl(truncate(productName, 30));
  const fontSize = safeName.length > 20 ? "3" : "4";
  const textWidth = getTextWidth(safeName, fontSize);
  const textX = Math.max(10, Math.round((labelWidth - textWidth) / 2));
  const textY = mmToDots(7);
  commands.push("TEXT " + textX + "," + textY + ",\"" + fontSize + "\",0,1,1,\"" + safeName + "\"");

  // Barcode - centered, auto-fit narrow width
  let narrowW = 2;
  let barcodeWidthDots = getBarcodeWidth(barcode, narrowW);
  while (barcodeWidthDots > labelWidth - 4 && narrowW > 1) {
    narrowW--;
    barcodeWidthDots = getBarcodeWidth(barcode, narrowW);
  }
  const barcodeX = Math.max(2, Math.round((labelWidth - barcodeWidthDots) / 2));
  const barcodeY = mmToDots(14);
  const barcodeHeight = mmToDots(15);
  commands.push("BARCODE " + barcodeX + "," + barcodeY + ",\"128\"," + barcodeHeight + ",1,0," + narrowW + ",3,\"" + barcode + "\"");

  commands.push("PRINT " + copies);

  return commands.join("\r\n") + "\r\n";
}


// ==========================================
// ZPL Generator (for Citizen, Zebra printers)
// Citizen CL-S621: 203 DPI, supports ZPL II
// ==========================================

function escapeZpl(text: string): string {
  return text
    .replace(/[ąĄ]/g, 'a').replace(/[ćĆ]/g, 'c').replace(/[ęĘ]/g, 'e')
    .replace(/[łŁ]/g, 'l').replace(/[ńŃ]/g, 'n').replace(/[óÓ]/g, 'o')
    .replace(/[śŚ]/g, 's').replace(/[źŹżŻ]/g, 'z')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '')
    .replace(/\^/g, '')
    .replace(/~/g, '');
}


export function generateZplLabel(
  barcode: string,
  productName: string,
  width: number = 50,
  height: number = 30,
  copies: number = 1
): string {
  // Citizen CL-S621 at 203 DPI, Zebra printers
  const dpi = CURRENT_DPI;
  const labelWidthDots = Math.round(width * dpi / 25.4);
  const labelHeightDots = Math.round(height * dpi / 25.4);

  const safeName = escapeZpl(productName);

  // Auto-fit text: calculate max chars that fit label width (10 dot margin each side)
  const charWidth = 14; // ZPL font 0 at 28x28 ~ 14 dots per char
  const maxTextWidth = labelWidthDots - 20;
  const maxChars = Math.floor(maxTextWidth / charWidth);
  const displayName = safeName.length > maxChars
    ? safeName.substring(0, maxChars - 3) + "..."
    : safeName;

  // Center text
  const textWidthDots = displayName.length * charWidth;
  const textX = Math.max(10, Math.round((labelWidthDots - textWidthDots) / 2));

  // Calculate barcode width and auto-fit module width
  // Code128: (start=11 + data*11 + checksum=11 + stop=13) * moduleWidth + quiet zones
  let barcodeModuleWidth = 2;
  let barcodeEstWidth = ((11 + barcode.length * 11 + 11 + 13) * barcodeModuleWidth) + 40;

  // Reduce module width if barcode overflows
  if (barcodeEstWidth > maxTextWidth) {
    barcodeModuleWidth = 1;
    barcodeEstWidth = ((11 + barcode.length * 11 + 11 + 13) * barcodeModuleWidth) + 40;
  }

  // Center barcode
  const barcodeX = Math.max(2, Math.round((labelWidthDots - barcodeEstWidth) / 2));

  const commands: string[] = [];

  // Start label
  commands.push("^XA");

  // === CITIZEN/ZEBRA: Media type = gap detection ===
  commands.push("^MNY");                          // Media tracking: detect gap between labels
  commands.push("^LS0");                          // Label shift = 0 (no horizontal offset)

  // Label dimensions
  commands.push("^PW" + labelWidthDots);          // Print width in dots
  commands.push("^LL" + labelHeightDots);         // Label length in dots
  commands.push("^LH0,0");                        // Label home position

  // Encoding
  commands.push("^CI28");                         // UTF-8

  // Product name - centered, near top
  const textY = Math.round(labelHeightDots * 0.08);
  commands.push("^FO" + textX + "," + textY);
  commands.push("^A0N,28,28");                    // Font 0, normal, 28x28 dots
  commands.push("^FD" + displayName + "^FS");

  // Barcode - Code 128, centered
  const barcodeY = Math.round(labelHeightDots * 0.35);
  const barcodeHeightDots = Math.round(labelHeightDots * 0.40);

  commands.push("^BY" + barcodeModuleWidth + ",3"); // Module width, wide-to-narrow ratio
  commands.push("^FO" + barcodeX + "," + barcodeY);
  commands.push("^BCN," + barcodeHeightDots + ",Y,N,N"); // Code128, height, text below
  commands.push("^FD" + barcode + "^FS");

  // Print quantity
  commands.push("^PQ" + copies);

  // End label
  commands.push("^XZ");

  return commands.join("\n") + "\n";
}


export { setDpi };


export function parseHtmlForTspl(html: string): Partial<TsplLabelData> {
  const data: Partial<TsplLabelData> = {};

  const nameMatch = html.match(/class="product-name"[^>]*>([^<]+)</i);
  if (nameMatch) data.productName = nameMatch[1].trim();

  const barcodeMatch = html.match(/JsBarcode[^,]*,\s*"([^"]+)"/i);
  if (barcodeMatch) data.barcode = barcodeMatch[1];

  const unitsMatch = html.match(/(\d+)\s*szt/i);
  if (unitsMatch) data.unitsPerPallet = parseInt(unitsMatch[1]);

  return data;
}
