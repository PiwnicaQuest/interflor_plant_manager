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

const DPI = 300;
const MM_TO_DOTS = DPI / 25.4;

function mmToDots(mm: number): number {
  return Math.round(mm * MM_TO_DOTS);
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
  commands.push("GAP 2 mm, 0 mm");
  commands.push("SPEED 4");
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

  // Barcode - centered
  const barcodeWidthDots = getBarcodeWidth(barcode, 2);
  const barcodeX = Math.max(10, Math.round((labelWidth - barcodeWidthDots) / 2));
  const barcodeY = mmToDots(height - 16);
  const barcodeHeight = mmToDots(10);
  commands.push("BARCODE " + barcodeX + "," + barcodeY + ",\"128\"," + barcodeHeight + ",1,0,2,3,\"" + barcode + "\"");

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
  commands.push("GAP 2 mm, 0 mm");
  commands.push("SPEED 4");
  commands.push("DENSITY 8");
  commands.push("DIRECTION 1");
  commands.push("CLS");

  // Text - centered
  const safeName = escapeTspl(truncate(productName, 30));
  const fontSize = safeName.length > 20 ? "3" : "4";
  const textWidth = getTextWidth(safeName, fontSize);
  const textX = Math.max(10, Math.round((labelWidth - textWidth) / 2));
  const textY = mmToDots(2);
  commands.push("TEXT " + textX + "," + textY + ",\"" + fontSize + "\",0,1,1,\"" + safeName + "\"");

  // Barcode - centered
  const barcodeWidthDots = getBarcodeWidth(barcode, 2);
  const barcodeX = Math.max(10, Math.round((labelWidth - barcodeWidthDots) / 2));
  const barcodeY = mmToDots(9);
  const barcodeHeight = mmToDots(15);
  commands.push("BARCODE " + barcodeX + "," + barcodeY + ",\"128\"," + barcodeHeight + ",1,0,2,3,\"" + barcode + "\"");

  commands.push("PRINT " + copies);

  return commands.join("\r\n") + "\r\n";
}

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
