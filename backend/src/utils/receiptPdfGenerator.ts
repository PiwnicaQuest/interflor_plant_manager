import PDFDocument from "pdfkit";
import { ReceiptWithItems, CustomerSnapshot } from "../types";
import { SettingsModel } from "../models/Settings";

const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const GREEN = "#16a34a";
const TEXT = "#111827";
const GRAY = "#6b7280";
const LIGHT_GRAY = "#f3f4f6";
const LIGHT_GREEN = "#dcfce7";
const BORDER = "#d1d5db";
const GREEN_BORDER = "#86efac";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 35;
const MR = 35;
const MT = 35;
const MB = 35;
const CW = PAGE_W - ML - MR;

function fmtDate(d: Date | string | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtNum(v: number | string | undefined | null): string {
  return (Number(v) || 0).toFixed(2);
}

function payMethodLabel(m?: string): string {
  if (!m) return "-";
  const l: Record<string, string> = { card: "Karta płatnicza", cash: "Gotówka", transfer: "Przelew bankowy" };
  return l[m.toLowerCase()] || m;
}

function getBuyer(b?: CustomerSnapshot) {
  if (!b) return { name: "Klient detaliczny", addr: "", city: "", nip: "", code: "" };
  let n = b.companyName || `${b.firstName || ""} ${b.lastName || ""}`.trim() || "Klient detaliczny";
  return { 
    name: n, 
    addr: b.street || "", 
    city: `${b.postalCode || ""} ${b.city || ""}`.trim(), 
    nip: b.nip || "",
    code: (b as any).customerCode || ""
  };
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

export async function generateReceiptPdfDirect(receipt: ReceiptWithItems): Promise<PDFKit.PDFDocument> {
  const settings = await SettingsModel.getCompanySettings();
  const seller = {
    name: settings.companyName || "",
    addr: settings.street || "",
    city: `${settings.postalCode || ""} ${settings.city || ""}`.trim(),
    nip: settings.nip || "",
    phone: settings.phone || "",
    email: settings.email || "",
  };
  const buyer = getBuyer(receipt.buyerSnapshot);
  const items = receipt.items || [];

  const doc = new PDFDocument({ size: "A4", margins: { top: MT, bottom: MB, left: ML, right: MR }, bufferPages: true });
  doc.registerFont("R", FONT_REGULAR);
  doc.registerFont("B", FONT_BOLD);

  let y = MT;

  // === HEADER ===
  doc.font("B").fontSize(24).fillColor(TEXT).text("DOWÓD WYDANIA", ML, y);
  y += 32;
  doc.font("B").fontSize(16).fillColor(GREEN).text(receipt.receiptNumber || "", ML, y);

  // Date & Badge - right side
  const dateX = PAGE_W - MR - 120;
  
  // ZAPŁACONE badge
  roundedRect(doc, dateX, MT, 120, 28, 6);
  doc.fill(LIGHT_GREEN);
  roundedRect(doc, dateX, MT, 120, 28, 6);
  doc.strokeColor(GREEN_BORDER).lineWidth(2).stroke();
  doc.font("B").fontSize(11).fillColor(GREEN).text("ZAPŁACONE", dateX, MT + 8, { width: 120, align: "center" });
  
  doc.font("R").fontSize(10).fillColor(GRAY);
  doc.text("Data: " + fmtDate(receipt.createdAt), dateX, MT + 38, { width: 120, align: "right" });

  y += 35;

  // === SELLER & BUYER BOXES ===
  const boxW = 252;
  const boxH = 100;
  const gap = 20;
  const radius = 8;

  // Seller box
  roundedRect(doc, ML, y, boxW, boxH, radius);
  doc.fill(LIGHT_GRAY);
  roundedRect(doc, ML, y, boxW, boxH, radius);
  doc.stroke(BORDER);

  doc.font("B").fontSize(9).fillColor(GRAY).text("SPRZEDAWCA", ML + 14, y + 12);
  doc.font("B").fontSize(12).fillColor(TEXT).text(seller.name, ML + 14, y + 28);
  doc.font("R").fontSize(10).text(seller.addr, ML + 14, y + 46);
  doc.text(seller.city, ML + 14, y + 60);
  doc.text("NIP: ", ML + 14, y + 76, { continued: true }).font("B").text(seller.nip);
  if (seller.phone) doc.font("R").text("Tel: " + seller.phone, ML + 14, y + 90);

  // Buyer box
  const bx = ML + boxW + gap;
  roundedRect(doc, bx, y, boxW, boxH, radius);
  doc.fill(LIGHT_GREEN);
  roundedRect(doc, bx, y, boxW, boxH, radius);
  doc.strokeColor(GREEN_BORDER).lineWidth(1).stroke();

  doc.font("B").fontSize(9).fillColor(GRAY).text("NABYWCA", bx + 14, y + 12);
  let buyerNameDisplay = buyer.code ? "[" + buyer.code + "] " + buyer.name : buyer.name;
  doc.font("B").fontSize(12).fillColor(GREEN).text(buyerNameDisplay, bx + 14, y + 28, { width: boxW - 28 });
  doc.font("R").fontSize(10).fillColor(TEXT);
  if (buyer.addr) doc.text(buyer.addr, bx + 14, y + 46);
  if (buyer.city) doc.text(buyer.city, bx + 14, y + 60);
  if (buyer.nip) {
    doc.text("NIP: ", bx + 14, y + 76, { continued: true }).font("B").fillColor(GREEN).text(buyer.nip);
  }

  y += boxH + 22;

  // === ITEMS TABLE ===
  // Columns: Lp. | Nazwa produktu | Rozmiar | Ilość | Cena jedn. | Wartość
  const cw = [30, 230, 70, 55, 70, 70];
  const cx: number[] = [];
  let tx = ML;
  for (const w of cw) { cx.push(tx); tx += w; }

  // Header
  const hh = 28;
  doc.rect(ML, y, CW, hh).fillAndStroke(LIGHT_GRAY, BORDER);
  doc.font("B").fontSize(9).fillColor(GRAY);
  const headers = ["Lp.", "Nazwa produktu", "Rozmiar", "Ilość", "Cena jedn.", "Wartość"];
  headers.forEach((h, i) => {
    const align = i < 2 ? "left" : (i === 3 ? "center" : "right");
    doc.text(h, cx[i] + 4, y + 9, { width: cw[i] - 8, align });
  });
  y += hh;

  cx.forEach((x, i) => { if (i > 0) doc.moveTo(x, y - hh).lineTo(x, y).stroke(BORDER); });

  // Rows
  let totalQty = 0;
  const ROW_HEIGHT = 36;
  
  items.forEach((item, idx) => {
    // Page break
    if (y + ROW_HEIGHT > PAGE_H - MB - 30) { 
      doc.addPage(); 
      y = MT; 
    }

    const bg = idx % 2 === 0 ? "#ffffff" : "#fafafa";
    doc.rect(ML, y, CW, ROW_HEIGHT).fillAndStroke(bg, BORDER);
    cx.forEach((x, i) => { if (i > 0) doc.moveTo(x, y).lineTo(x, y + ROW_HEIGHT).stroke(BORDER); });

    const qty = Number(item.quantity) || 0;
    totalQty += qty;
    const unitPrice = Number(item.unitPriceGross) || 0;
    const totalPrice = qty * unitPrice;

    // Lp
    doc.font("R").fontSize(9).fillColor(TEXT).text((idx + 1).toString(), cx[0] + 2, y + 12, { width: cw[0] - 4, align: "center" });

    // Name
    const name = item.description || "Produkt";
    doc.font("R").fontSize(9).fillColor(TEXT).text(name, cx[1] + 4, y + 12, { width: cw[1] - 8 });

    // Rozmiar (pot size from product snapshot if available)
    const potSize = (item as any).productSnapshot?.potSize || "-";
    doc.font("R").fontSize(9).fillColor(TEXT).text(potSize, cx[2] + 4, y + 12, { width: cw[2] - 8, align: "center" });

    // Qty
    doc.font("B").fontSize(11).fillColor(TEXT).text(qty.toString(), cx[3] + 2, y + 11, { width: cw[3] - 4, align: "center" });

    // Unit price
    doc.font("R").fontSize(9).fillColor(TEXT).text(fmtNum(unitPrice) + " zł", cx[4] + 4, y + 12, { width: cw[4] - 8, align: "right" });

    // Total
    doc.font("B").fontSize(9).fillColor(TEXT).text(fmtNum(totalPrice) + " zł", cx[5] + 4, y + 12, { width: cw[5] - 8, align: "right" });

    y += ROW_HEIGHT;
  });

  // RAZEM row
  const rzh = 28;
  doc.rect(ML, y, CW, rzh).fillAndStroke(LIGHT_GRAY, BORDER);
  cx.forEach((x, i) => { if (i > 0) doc.moveTo(x, y).lineTo(x, y + rzh).stroke(BORDER); });

  doc.font("B").fontSize(10).fillColor(TEXT).text("RAZEM:", cx[0] + 4, y + 8, { width: cw[0] + cw[1] + cw[2] - 8, align: "right" });
  doc.font("B").fontSize(12).fillColor(GREEN).text(totalQty.toString(), cx[3] + 2, y + 7, { width: cw[3] - 4, align: "center" });
  doc.font("B").fontSize(10).fillColor(GREEN).text(fmtNum(receipt.totalAmount) + " zł", cx[5] + 4, y + 8, { width: cw[5] - 8, align: "right" });

  y += rzh + 24;

  // === BOTTOM SECTION ===
  const bottomSectionHeight = 160;
  if (y + bottomSectionHeight > PAGE_H - MB) { 
    doc.addPage(); 
    y = MT; 
  }

  const leftW = 220;
  const rightW = 200;
  const rightX = PAGE_W - MR - rightW;

  // Payment info - left side
  doc.font("B").fontSize(9).fillColor(GRAY).text("FORMA PŁATNOŚCI", ML, y);
  y += 16;
  
  // Payment splits or single payment
  const paymentSplits = (receipt as any).paymentSplits;
  if (paymentSplits && Array.isArray(paymentSplits) && paymentSplits.length > 1) {
    paymentSplits.forEach((split: any) => {
      doc.font("R").fontSize(10).fillColor(TEXT)
        .text(payMethodLabel(split.paymentMethod) + ": ", ML, y, { continued: true })
        .font("B").text(fmtNum(split.amount) + " zł");
      y += 16;
    });
  } else {
    doc.font("B").fontSize(14).fillColor(TEXT).text(payMethodLabel(receipt.paymentMethod), ML, y);
    y += 24;
  }

  // Total box - right side
  const tbY = y - 60;
  const tbh = 90;
  roundedRect(doc, rightX, tbY, rightW, tbh, 8);
  doc.fill(LIGHT_GREEN);
  roundedRect(doc, rightX, tbY, rightW, tbh, 8);
  doc.strokeColor(GREEN_BORDER).lineWidth(2).stroke();

  doc.font("B").fontSize(9).fillColor(GRAY).text("DO ZAPŁATY", rightX + 12, tbY + 14, { width: rightW - 24 });
  doc.font("B").fontSize(28).fillColor(GREEN).text(fmtNum(receipt.totalAmount) + " PLN", rightX + 12, tbY + 35, { width: rightW - 24, align: "center" });
  doc.font("R").fontSize(10).fillColor(GRAY).text(totalQty + " szt. produktów", rightX + 12, tbY + 70, { width: rightW - 24, align: "center" });

  y += 60;

  // Footer message
  const fh = 50;
  roundedRect(doc, ML, y, CW, fh, 8);
  doc.fill(LIGHT_GRAY);
  roundedRect(doc, ML, y, CW, fh, 8);
  doc.stroke(BORDER);

  doc.font("B").fontSize(16).fillColor(TEXT).text("Dziękujemy za zakupy!", ML, y + 12, { width: CW, align: "center" });
  doc.font("R").fontSize(12).fillColor(GRAY).text("Zapraszamy ponownie", ML, y + 32, { width: CW, align: "center" });

  y += fh + 30;

  // === SIGNATURES ===
  y = Math.max(y + 30, PAGE_H - MB - 55);
  if (y > PAGE_H - MB - 25) { doc.addPage(); y = MT + 60; }

  doc.strokeColor(BORDER).lineWidth(0.5);
  doc.moveTo(ML + 30, y).lineTo(ML + 210, y).stroke();
  doc.moveTo(PAGE_W - MR - 210, y).lineTo(PAGE_W - MR - 30, y).stroke();

  doc.font("R").fontSize(8).fillColor(GRAY);
  doc.text("Podpis sprzedawcy", ML + 30, y + 6, { width: 180, align: "center" });
  doc.text("Podpis nabywcy", PAGE_W - MR - 210, y + 6, { width: 180, align: "center" });

  doc.end();
  return doc;
}

export default generateReceiptPdfDirect;
