import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import { OrderWithItems, CustomerSnapshot } from "../types";
import { SettingsModel } from "../models/Settings";

// === COLORS ===
const TEXT = "#1f2937";
const GRAY = "#6b7280";
const ORANGE = "#ea580c";
const LIGHT_ORANGE = "#fff7ed";
const LIGHT_GRAY = "#f9fafb";
const BORDER = "#e5e7eb";
const GREEN = "#16a34a";
const LIGHT_GREEN = "#f0fdf4";
const GREEN_BORDER = "#bbf7d0";

// Margins
const ML = 35;
const MR = 35;
const MT = 35;

// Fonts
const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";


async function generateBarcode(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: "code128",
        text: text,
        scale: 3,
        height: 10,
        includetext: false,
        textxalign: "center",
      },
      (err: Error | string, png: Buffer) => {
        if (err) reject(err);
        else resolve(png);
      }
    );
  });
}

function statusColor(s: string): string {
  const c: Record<string, string> = {
    pending: "#f59e0b",
    processing: "#3b82f6",
    shipped: "#8b5cf6",
    delivered: "#22c55e",
    completed: "#6b7280",
    cancelled: "#ef4444"
  };
  return c[s] || GRAY;
}

function getCustomer(b?: CustomerSnapshot) {
  if (!b) return { name: "", code: "" };
  let n = b.companyName || `${b.firstName || ""} ${b.lastName || ""}`.trim();
  return {
    name: n,
    code: b.customerCode || ""
  };
}

function getRecipient(r?: CustomerSnapshot) {
  if (!r) return null;
  const name = r.companyName || `${r.firstName || ""} ${r.lastName || ""}`.trim();
  if (!name) return null;
  return { name, code: r.customerCode || "" };
}

function roundedRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r: number) {
  doc.moveTo(x + r, y)
    .lineTo(x + w - r, y)
    .quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h - r)
    .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - r)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y)
    .closePath();
}

function formatCurrency(v: number | string | null | undefined): string {
  const num = Number(v) || 0;
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " zł";
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("pl-PL");
}

function translateStatus(s: string): string {
  const t: Record<string, string> = {
    pending: "Oczekujące",
    processing: "W realizacji",
    shipped: "Wysłane",
    delivered: "Dostarczone",
    completed: "Zakończone",
    cancelled: "Anulowane"
  };
  return t[s] || s;
}

function renderOrder(
  doc: PDFKit.PDFDocument,
  order: OrderWithItems,
  seller: { name: string },
  barcodeBuffers: Map<string, Buffer>,
  isFirstPage: boolean
): void {
  const customer = getCustomer(order.customerSnapshot);
  const recipient = getRecipient(order.recipientSnapshot);
  const hasRecipient = recipient !== null;
  const items = order.items || [];

  if (!isFirstPage) {
    doc.addPage();
  }

  let y = MT;

  // === HEADER ===
  doc.font("B").fontSize(22).fillColor(ORANGE).text("ZAMÓWIENIE", ML, y);
  doc.font("B").fontSize(14).fillColor(TEXT).text(`#${order.orderNumber}`, ML + 165, y + 5);

  const statusText = translateStatus(order.status);
  const sColor = statusColor(order.status);
  const sw = doc.widthOfString(statusText) + 16;
  const sx = 595 - MR - sw;
  doc.roundedRect(sx, y, sw, 24, 4).fill(sColor);
  doc.font("B").fontSize(10).fillColor("#ffffff").text(statusText, sx + 8, y + 6);

  y += 35;

  // === META INFO ===
  doc.font("R").fontSize(9).fillColor(GRAY);
  doc.text("Data zamówienia:", ML, y);
  doc.font("B").fillColor(TEXT).text(formatDate(order.createdAt), ML + 90, y);

  y += 22;

  // === SELLER & CUSTOMER & RECIPIENT BOXES ===
  const boxW = hasRecipient ? 168 : 252;
  const boxH = 80;
  const gap = hasRecipient ? 12 : 20;
  const radius = 8;
  const nameFont = hasRecipient ? 10 : 11;

  // Seller box
  roundedRect(doc, ML, y, boxW, boxH, radius);
  doc.fill(LIGHT_GRAY);
  roundedRect(doc, ML, y, boxW, boxH, radius);
  doc.stroke(BORDER);

  doc.font("B").fontSize(9).fillColor(GRAY).text("SPRZEDAWCA", ML + 10, y + 10);
  doc.font("B").fontSize(nameFont).fillColor(TEXT).text(seller.name, ML + 10, y + 26, { width: boxW - 20 });

  // Customer box
  const bx = ML + boxW + gap;
  roundedRect(doc, bx, y, boxW, boxH, radius);
  doc.fill(LIGHT_ORANGE);
  roundedRect(doc, bx, y, boxW, boxH, radius);
  doc.stroke(BORDER);

  doc.font("B").fontSize(9).fillColor(GRAY).text("ZAMAWIAJĄCY", bx + 10, y + 10);
  doc.font("B").fontSize(nameFont).fillColor(ORANGE);
  const custNameH = doc.heightOfString(customer.name, { width: boxW - 20 });
  doc.text(customer.name, bx + 10, y + 26, { width: boxW - 20 });
  if (customer.code) {
    const codeY = y + 26 + custNameH + 4;
    doc.font("R").fontSize(9).fillColor(TEXT).text("Kod: ", bx + 10, codeY, { continued: true }).font("B").fillColor(ORANGE).text(customer.code);
  }

  // Recipient box (if different from customer)
  if (hasRecipient) {
    const rx = bx + boxW + gap;
    roundedRect(doc, rx, y, boxW, boxH, radius);
    doc.fill(LIGHT_GREEN);
    roundedRect(doc, rx, y, boxW, boxH, radius);
    doc.strokeColor(GREEN_BORDER).lineWidth(1).stroke();

    doc.font("B").fontSize(9).fillColor(GRAY).text("ODBIORCA", rx + 10, y + 10);
    doc.font("B").fontSize(10).fillColor(GREEN);
    const recNameH = doc.heightOfString(recipient.name, { width: boxW - 20 });
    doc.text(recipient.name, rx + 10, y + 26, { width: boxW - 20 });
    if (recipient.code) {
      const rcodeY = y + 26 + recNameH + 4;
      doc.font("R").fontSize(9).fillColor(TEXT).text("Kod: ", rx + 10, rcodeY, { continued: true }).font("B").fillColor(GREEN).text(recipient.code);
    }
  }

  y += boxH + 18;

  // === ITEMS TABLE ===
  // Columns: Checkbox | Lp. | Nazwa | Palety | szt/pal | Ilosc | Barcode | Cena/szt | Wartosc
  const cw = [20, 22, 150, 38, 42, 42, 95, 48, 68];
  const cx: number[] = [];
  let accX = ML;
  for (const w of cw) { cx.push(accX); accX += w; }
  const tw = cw.reduce((a, b) => a + b, 0);
  const hdrH = 22;
  const rowH = 38;

  // Header
  doc.rect(ML, y, tw, hdrH).fill(ORANGE);
  doc.font("B").fontSize(8).fillColor("#ffffff");
  const headers = ["", "Lp.", "Nazwa rośliny", "Palety", "szt/pal", "Ilość", "Barcode", "Cena/szt", "Wartość"];
  const hdrAlign = ["center", "center", "center", "center", "center", "center", "center", "center", "center"];
  for (let i = 0; i < headers.length; i++) {
    const opts: PDFKit.Mixins.TextOptions = { width: cw[i] - 4, align: hdrAlign[i] as any };
    doc.text(headers[i], cx[i] + 2, y + 6, opts);
  }
  y += hdrH;

  // Calculate totals
  let totalQuantity = 0;
  let totalAmount = 0;

  // Helper function to draw table lines for current page
  const drawTableLines = (startY: number, endY: number, includeHeader: boolean) => {
    doc.strokeColor("#4b5563").lineWidth(1);
    const topY = includeHeader ? startY - hdrH : startY;
    doc.rect(ML, topY, tw, endY - topY).stroke();

    // Vertical lines
    for (let i = 1; i < cx.length; i++) {
      doc.moveTo(cx[i], topY).lineTo(cx[i], endY).stroke();
    }

    // Horizontal lines
    let lineY = startY;
    while (lineY <= endY) {
      doc.moveTo(ML, lineY).lineTo(ML + tw, lineY).stroke();
      lineY += rowH;
    }
  };

  // Rows
  let rowIndex = 0;
  const rowCenter = Math.floor(rowH / 2);
  let pageTableStartY = y; // Track where table starts on current page
  let isFirstTablePage = true;

  for (const item of items) {
    if (y + rowH > 800) {
      // Draw lines for current page before adding new page
      drawTableLines(pageTableStartY, y, isFirstTablePage);
      doc.addPage();
      y = MT;
      pageTableStartY = y;
      isFirstTablePage = false;
    }
    const bg = rowIndex % 2 === 0 ? "#ffffff" : "#fafafa";
    doc.rect(ML, y, tw, rowH).fill(bg);

    // Checkbox column (centered)
    doc.rect(cx[0] + 5, y + rowCenter - 5, 10, 10).lineWidth(1).strokeColor(GRAY).stroke();

    // Lp. (centered)
    doc.font("R").fontSize(8).fillColor(TEXT).text(String(rowIndex + 1), cx[1] + 2, y + rowCenter - 4, { width: cw[1] - 4, align: "center" });

    // Nazwa + Data (vertically centered as a group)
    const plantName = item.productSnapshot?.plantName || "-";
    doc.font("B").fontSize(8);
    const plantNameHeight = doc.heightOfString(plantName, { width: cw[2] - 8 });
    const productDate = item.productSnapshot?.createdAt;
    const dateHeight = productDate ? 9 : 0;
    const totalContentHeight = plantNameHeight + dateHeight;
    const nameStartY = y + rowCenter - totalContentHeight / 2;

    doc.fillColor(TEXT).text(plantName, cx[2] + 4, nameStartY, { width: cw[2] - 8 });
    if (productDate) {
      doc.font("R").fontSize(7).fillColor(GRAY).text(formatDate(productDate), cx[2] + 4, nameStartY + plantNameHeight + 2, { width: cw[2] - 8 });
    }

    // Palety (centered)
    const pallets = item.palletCount || 0;
    doc.font("R").fontSize(9).fillColor(TEXT).text(String(pallets), cx[3] + 2, y + rowCenter - 5, { width: cw[3] - 4, align: "center" });

    // szt/pal (centered)
    const unitsPerPallet = item.unitsPerPallet || 0;
    doc.font("R").fontSize(9).fillColor(TEXT).text(String(unitsPerPallet), cx[4] + 2, y + rowCenter - 5, { width: cw[4] - 4, align: "center" });

    // Ilosc (centered)
    const quantity = item.quantity || 0;
    totalQuantity += quantity;
    doc.font("B").fontSize(10).fillColor(ORANGE).text(String(quantity), cx[5] + 2, y + rowCenter - 5, { width: cw[5] - 4, align: "center" });

    // Barcode (centered as a group: image + text)
    const code = item.productSnapshot?.barcode || "";
    if (code && barcodeBuffers.has(code)) {
      const barcodeBuffer = barcodeBuffers.get(code)!;
      const barcodeH = 18;
      const barcodeTextH = 8;
      const barcodeGroupH = barcodeH + barcodeTextH;
      const barcodeStartY = y + rowCenter - barcodeGroupH / 2;
      doc.image(barcodeBuffer, cx[6] + 4, barcodeStartY, { width: cw[6] - 8, height: barcodeH });
      doc.font("R").fontSize(6).fillColor(GRAY).text(code, cx[6] + 2, barcodeStartY + barcodeH + 2, { width: cw[6] - 4, align: "center" });
    } else {
      doc.font("R").fontSize(8).fillColor(GRAY).text(code || "-", cx[6] + 2, y + rowCenter - 4, { width: cw[6] - 4, align: "center" });
    }

    // Cena/szt (centered)
    const price = Number(item.unitPriceGross) || 0;
    doc.font("R").fontSize(8).fillColor(TEXT).text(formatCurrency(price), cx[7] + 2, y + rowCenter - 4, { width: cw[7] - 4, align: "right" });

    // Wartosc (centered)
    const lineTotal = quantity * price;
    totalAmount += lineTotal;
    doc.font("B").fontSize(8).fillColor(TEXT).text(formatCurrency(lineTotal), cx[8] + 2, y + rowCenter - 4, { width: cw[8] - 6, align: "right" });

    y += rowH;
    rowIndex++;
  }

  // Draw table lines for the last page
  drawTableLines(pageTableStartY, y, isFirstTablePage);

  // === SUMMARY SECTION ===
  y += 10;

  // Check if we need a new page for summary
  if (y + 60 > 800) {
    doc.addPage();
    y = MT;
  }

  const summaryBoxW = 250;
  const summaryBoxX = ML + tw - summaryBoxW;

  // Summary row 1: Total quantity
  doc.font("R").fontSize(10).fillColor(TEXT);
  doc.text("Łączna ilość:", summaryBoxX, y, { width: summaryBoxW - 120, align: "right" });
  doc.font("B").fontSize(10).fillColor(TEXT);
  doc.text(totalQuantity + " szt.", summaryBoxX + summaryBoxW - 115, y, { width: 110, align: "right" });

  y += 18;

  // Summary row 2: Total amount (highlighted)
  roundedRect(doc, summaryBoxX - 10, y - 4, summaryBoxW + 10, 28, 4);
  doc.fill(LIGHT_ORANGE);
  roundedRect(doc, summaryBoxX - 10, y - 4, summaryBoxW + 10, 28, 4);
  doc.strokeColor(ORANGE).lineWidth(1).stroke();

  doc.font("B").fontSize(12).fillColor(TEXT);
  doc.text("SUMA:", summaryBoxX, y + 4, { width: summaryBoxW - 120, align: "right" });
  doc.font("B").fontSize(14).fillColor(ORANGE);
  doc.text(formatCurrency(totalAmount), summaryBoxX + summaryBoxW - 115, y + 3, { width: 110, align: "right" });

  y += 40;

  // === NOTES ===
  if (order.notes || order.customerNotes) {
    if (y + 60 > 800) {
      doc.addPage();
      y = MT;
    }
    doc.font("B").fontSize(10).fillColor(TEXT).text("Uwagi:", ML, y);
    y += 14;
    const notesText = order.customerNotes || order.notes || "";
    doc.font("R").fontSize(9).fillColor(GRAY).text(notesText, ML, y, { width: tw });
  }
}

export async function generateBulkOrdersPdf(orders: OrderWithItems[]): Promise<PDFKit.PDFDocument> {
  const settings = await SettingsModel.getCompanySettings();
  const seller = { name: settings.companyName || "" };

  // Pre-generate all barcodes for all orders
  const barcodeBuffers = new Map<string, Buffer>();
  for (const order of orders) {
    for (const item of order.items || []) {
      const code = item.productSnapshot?.barcode || "";
      if (code && !barcodeBuffers.has(code)) {
        try {
          const buffer = await generateBarcode(code);
          barcodeBuffers.set(code, buffer);
        } catch (e) {
          console.error("Barcode generation failed for:", code, e);
        }
      }
    }
  }

  const doc = new PDFDocument({ size: "A4", margin: 0 });
  doc.registerFont("R", FONT_REGULAR);
  doc.registerFont("B", FONT_BOLD);

  let isFirst = true;
  for (const order of orders) {
    renderOrder(doc, order, seller, barcodeBuffers, isFirst);
    isFirst = false;
  }

  doc.end();
  return doc;
}
