import PDFDocument from "pdfkit";
import { InvoiceWithItems, CustomerSnapshot } from "../types";
import { SettingsModel } from "../models/Settings";

const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const BLUE = "#2563eb";
const TEXT = "#111827";
const GRAY = "#6b7280";
const LIGHT_GRAY = "#f3f4f6";
const LIGHT_BLUE = "#dbeafe";
const BORDER = "#d1d5db";
const GREEN = "#15803d";
const YELLOW_BG = "#fef9c3";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 35;
const MR = 35;
const MT = 35;
const MB = 35;
const CW = PAGE_W - ML - MR;

function fmtDate(d: Date | string | undefined): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pl-PL");
}

function fmtNum(v: number | string | undefined | null): string {
  return (Number(v) || 0).toFixed(2);
}

function payMethodLabel(m?: string): string {
  if (!m) return "-";
  const l: Record<string, string> = { card: "Karta", cash: "Gotówka", transfer: "Przelew" };
  return l[m.toLowerCase()] || m;
}

function payStatusLabel(s: string): string {
  const l: Record<string, string> = { unpaid: "Nieopłacona", partially_paid: "Częściowo opłacona", paid: "Opłacona", overdue: "Po terminie" };
  return l[s.toLowerCase()] || s;
}

function getBuyer(b?: CustomerSnapshot) {
  if (!b) return { name: "", addr: "", city: "", nip: "" };
  let n = b.companyName || `${b.firstName || ""} ${b.lastName || ""}`.trim();
  return { name: n, addr: b.street || "", city: `${b.postalCode || ""} ${b.city || ""}`.trim(), nip: b.nip || "" };
}

function getRecipient(r?: CustomerSnapshot) {
  if (!r) return null;
  const name = r.companyName || `${r.firstName || ""} ${r.lastName || ""}`.trim();
  if (!name && !r.street && !r.city) return null;
  return { 
    name: name, 
    addr: r.street || "", 
    city: `${r.postalCode || ""} ${r.city || ""}`.trim(),
    phone: (r as any).phone || ""
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

export async function generateInvoicePdfDirect(invoice: InvoiceWithItems): Promise<PDFKit.PDFDocument> {
  const settings = await SettingsModel.getCompanySettings();
  const seller = {
    name: settings.companyName || "",
    addr: settings.street || "",
    city: `${settings.postalCode || ""} ${settings.city || ""}`.trim(),
    nip: settings.nip || "",
    bank: settings.bankName || "",
    account: settings.bankAccount || "",
    comment: settings.invoiceComment || "",
  };
  const buyer = getBuyer(invoice.buyerSnapshot);
  const items = invoice.items || [];

  const doc = new PDFDocument({ size: "A4", margins: { top: MT, bottom: MB, left: ML, right: MR }, bufferPages: true });
  doc.registerFont("R", FONT_REGULAR);
  doc.registerFont("B", FONT_BOLD);

  let y = MT;

  // === HEADER ===
  doc.font("B").fontSize(24).fillColor(TEXT).text("FAKTURA VAT", ML, y);
  y += 32;
  doc.font("B").fontSize(16).fillColor(BLUE).text(invoice.invoiceNumber || "", ML, y);

  // Dates - right side
  doc.font("R").fontSize(10).fillColor(TEXT);
  const dateX = PAGE_W - MR - 180;
  doc.text("Data wystawienia: ", dateX, MT, { continued: true }).font("B").text(fmtDate(invoice.issueDate));
  doc.font("R").text("Data sprzedaży: ", dateX, MT + 16, { continued: true }).font("B").text(fmtDate(invoice.saleDate));

  y += 35;

  // === SELLER & BUYER & RECIPIENT BOXES ===
  const recipient = getRecipient(invoice.recipientSnapshot);
  const hasRecipient = recipient !== null;
  const boxW = hasRecipient ? 168 : 252;
  const boxH = 115;
  const gap = hasRecipient ? 12 : 20;
  const radius = 8;
  const LIGHT_GREEN = "#dcfce7";
  const GREEN_BORDER = "#86efac";

  // Seller box
  roundedRect(doc, ML, y, boxW, boxH, radius);
  doc.fill(LIGHT_GRAY);
  roundedRect(doc, ML, y, boxW, boxH, radius);
  doc.stroke(BORDER);

  doc.font("B").fontSize(9).fillColor(GRAY).text("SPRZEDAWCA", ML + 10, y + 10);
  doc.font("B").fontSize(hasRecipient ? 10 : 11).fillColor(TEXT).text(seller.name, ML + 10, y + 24, { width: boxW - 20 });
  doc.font("R").fontSize(9).text(seller.addr, ML + 10, y + 56);
  doc.text(seller.city, ML + 10, y + 70);
  doc.text("NIP: ", ML + 10, y + 86, { continued: true }).font("B").text(seller.nip);

  // Buyer box
  const bx = ML + boxW + gap;
  roundedRect(doc, bx, y, boxW, boxH, radius);
  doc.fill(LIGHT_BLUE);
  roundedRect(doc, bx, y, boxW, boxH, radius);
  doc.stroke(BORDER);

  doc.font("B").fontSize(9).fillColor(GRAY).text("NABYWCA", bx + 10, y + 10);
  doc.font("B").fontSize(hasRecipient ? 10 : 11).fillColor(BLUE).text(buyer.name, bx + 10, y + 24, { width: boxW - 20 });
  doc.font("R").fontSize(9).fillColor(TEXT).text(buyer.addr, bx + 10, y + 56);
  doc.text(buyer.city, bx + 10, y + 70);
  if (buyer.nip) {
    doc.text("NIP: ", bx + 10, y + 86, { continued: true }).font("B").fillColor(BLUE).text(buyer.nip);
  }

  // Recipient box (if different from buyer)
  if (hasRecipient) {
    const rx = bx + boxW + gap;
    roundedRect(doc, rx, y, boxW, boxH, radius);
    doc.fill(LIGHT_GREEN);
    roundedRect(doc, rx, y, boxW, boxH, radius);
    doc.strokeColor(GREEN_BORDER).lineWidth(1).stroke();

    doc.font("B").fontSize(9).fillColor(GRAY).text("ODBIORCA", rx + 10, y + 10);
    doc.font("B").fontSize(10).fillColor("#16a34a").text(recipient.name, rx + 10, y + 24, { width: boxW - 20 });
    doc.font("R").fontSize(9).fillColor(TEXT).text(recipient.addr, rx + 10, y + 56);
    doc.text(recipient.city, rx + 10, y + 70);
    if (recipient.phone) {
      doc.text("Tel: ", rx + 10, y + 86, { continued: true }).font("B").text(recipient.phone);
    }
  }

  y += boxH + 22;

  // === ITEMS TABLE ===
  const cw = [18, 168, 28, 22, 44, 44, 28, 54, 48, 52];
  const cx: number[] = [];
  let tx = ML;
  for (const w of cw) { cx.push(tx); tx += w; }

  // Header
  const hh = 24;
  doc.rect(ML, y, CW, hh).fillAndStroke(LIGHT_GRAY, BORDER);
  doc.font("B").fontSize(6.5).fillColor(GRAY);
  const headers = ["Lp.", "Nazwa towaru/usługi", "Ilość", "J.m.", "Cena\nnetto", "Cena\nbrutto", "VAT%", "Kwota\nnetto", "Kwota\nVAT", "Kwota\nbrutto"];
  headers.forEach((h, i) => {
    doc.text(h, cx[i] + 3, y + 4, { width: cw[i] - 6, align: "center" });
  });
  y += hh;

  cx.forEach((x, i) => { if (i > 0) doc.moveTo(x, y - hh).lineTo(x, y).stroke(BORDER); });

  // Rows
  let totalQty = 0;
  const ROW_HEIGHT = 18;

  items.forEach((item, idx) => {
    if (y + ROW_HEIGHT > PAGE_H - MB - 30) {
      doc.addPage();
      y = MT;
    }

    const bg = idx % 2 === 0 ? "#ffffff" : "#fafafa";
    doc.rect(ML, y, CW, ROW_HEIGHT).fillAndStroke(bg, BORDER);
    cx.forEach((x, i) => { if (i > 0) doc.moveTo(x, y).lineTo(x, y + ROW_HEIGHT).stroke(BORDER); });

    const qty = Number(item.quantity) || 0;
    totalQty += qty;
    const uNet = Number(item.unitPriceNet) || 0;
    const uGross = uNet * (1 + item.vatRate / 100);
    const tNet = Number(item.totalNet) || uNet * qty;
    const tVat = Number(item.totalVat) || tNet * item.vatRate / 100;
    const tGross = Number(item.totalGross) || tNet + tVat;

    const cy = y + 5;

    // Lp - centered
    doc.font("R").fontSize(7).fillColor(TEXT).text((idx + 1).toString(), cx[0] + 1, cy, { width: cw[0] - 2, align: "center" });

    // Name + passport + PKWiU compact
    const name = item.description || "Produkt";
    const passport = (item as any).growerPassport || "";
    const pkwiu = "01.30.10.0";
    const nameExtra = passport ? " [" + passport + "]" : "";
    doc.font("R").fontSize(6.5).fillColor(TEXT).text(name + nameExtra, cx[1] + 3, y + 2, { width: cw[1] - 6 });
    doc.font("R").fontSize(5).fillColor(GRAY).text("PKWiU: " + pkwiu, cx[1] + 3, y + 12, { width: cw[1] - 6 });

    // Qty - centered
    doc.font("B").fontSize(7).fillColor(BLUE).text(qty.toString(), cx[2] + 1, cy, { width: cw[2] - 2, align: "center" });

    // Jm - centered
    doc.font("R").fontSize(7).fillColor(TEXT).text("szt.", cx[3] + 1, cy, { width: cw[3] - 2, align: "center" });

    // Prices - all centered
    doc.font("R").fontSize(6.5).fillColor(TEXT).text(fmtNum(uNet), cx[4] + 1, cy, { width: cw[4] - 2, align: "center" });
    doc.text(fmtNum(uGross), cx[5] + 1, cy, { width: cw[5] - 2, align: "center" });
    doc.text(item.vatRate + "%", cx[6] + 1, cy, { width: cw[6] - 2, align: "center" });
    doc.text(fmtNum(tNet), cx[7] + 1, cy, { width: cw[7] - 2, align: "center" });
    doc.text(fmtNum(tVat), cx[8] + 1, cy, { width: cw[8] - 2, align: "center" });

    doc.font("B").fontSize(6.5).text(fmtNum(tGross), cx[9] + 1, cy, { width: cw[9] - 2, align: "center" });

    y += ROW_HEIGHT;
  });

  // RAZEM row
  const rzh = 16;
  doc.rect(ML, y, CW, rzh).fillAndStroke(LIGHT_GRAY, BORDER);
  cx.forEach((x, i) => { if (i > 0) doc.moveTo(x, y).lineTo(x, y + rzh).stroke(BORDER); });

  const rcy = y + 4;
  doc.font("B").fontSize(7).fillColor(TEXT).text("RAZEM:", cx[0] + 1, rcy, { width: cw[0] + cw[1] - 2, align: "center" });
  doc.fillColor(BLUE).text(totalQty.toString(), cx[2] + 1, rcy, { width: cw[2] - 2, align: "center" });
  doc.fillColor(TEXT).fontSize(6.5);
  doc.text(fmtNum(invoice.subtotalNet) + " zl", cx[7] + 1, rcy, { width: cw[7] - 2, align: "center" });
  doc.text(fmtNum(invoice.totalVat) + " zl", cx[8] + 1, rcy, { width: cw[8] - 2, align: "center" });
  doc.fillColor(BLUE).text(fmtNum(invoice.totalGross) + " zl", cx[9] + 1, rcy, { width: cw[9] - 2, align: "center" });

  y += rzh + 18;

  // === BOTTOM SECTION ===
  // Calculate how much space we need for bottom section
  const bottomSectionHeight = 180;
  if (y + bottomSectionHeight > PAGE_H - MB) { 
    doc.addPage(); 
    y = MT; 
  }

  const leftW = 345;
  const rightW = 175;
  const rightX = PAGE_W - MR - rightW;
  const startY = y;

  // VAT Summary
  doc.font("B").fontSize(9).fillColor(GRAY).text("PODSUMOWANIE STAWEK VAT", ML, y);
  y += 16;

  const vatCw = [70, 92, 88, 95];
  const vatX: number[] = [];
  let vx = ML;
  for (const w of vatCw) { vatX.push(vx); vx += w; }

  const vhh = 22;
  doc.rect(ML, y, leftW, vhh).fillAndStroke(LIGHT_GRAY, BORDER);
  vatX.forEach((x, i) => { if (i > 0) doc.moveTo(x, y).lineTo(x, y + vhh).stroke(BORDER); });
  doc.font("B").fontSize(8).fillColor(GRAY);
  ["Stawka VAT", "Netto", "VAT", "Brutto"].forEach((h, i) => {
    doc.text(h, vatX[i] + 6, y + 7, { width: vatCw[i] - 12, align: i === 0 ? "left" : "right" });
  });
  y += vhh;

  const vatMap = new Map<number, { net: number; vat: number; gross: number }>();
  items.forEach(item => {
    const r = item.vatRate;
    const n = Number(item.totalNet) || Number(item.unitPriceNet) * Number(item.quantity);
    const v = Number(item.totalVat) || n * r / 100;
    const g = Number(item.totalGross) || n + v;
    const e = vatMap.get(r) || { net: 0, vat: 0, gross: 0 };
    e.net += n; e.vat += v; e.gross += g;
    vatMap.set(r, e);
  });

  vatMap.forEach((v, rate) => {
    const vrh = 22;
    doc.rect(ML, y, leftW, vrh).stroke(BORDER);
    vatX.forEach((x, i) => { if (i > 0) doc.moveTo(x, y).lineTo(x, y + vrh).stroke(BORDER); });
    doc.font("B").fontSize(9).fillColor(BLUE).text(`${rate}%`, vatX[0] + 6, y + 6, { width: vatCw[0] - 12 });
    doc.font("R").fillColor(TEXT).fontSize(9);
    doc.text(`${fmtNum(v.net)} zł`, vatX[1] + 6, y + 6, { width: vatCw[1] - 12, align: "right" });
    doc.text(`${fmtNum(v.vat)} zł`, vatX[2] + 6, y + 6, { width: vatCw[2] - 12, align: "right" });
    doc.font("B").fillColor(BLUE).text(`${fmtNum(v.gross)} zł`, vatX[3] + 6, y + 6, { width: vatCw[3] - 12, align: "right" });
    y += vrh;
  });

  const vrhz = 24;
  doc.rect(ML, y, leftW, vrhz).fillAndStroke(LIGHT_GRAY, BORDER);
  vatX.forEach((x, i) => { if (i > 0) doc.moveTo(x, y).lineTo(x, y + vrhz).stroke(BORDER); });
  doc.font("B").fontSize(9).fillColor(TEXT).text("RAZEM", vatX[0] + 6, y + 7, { width: vatCw[0] - 12 });
  doc.text(`${fmtNum(invoice.subtotalNet)} zł`, vatX[1] + 6, y + 7, { width: vatCw[1] - 12, align: "right" });
  doc.text(`${fmtNum(invoice.totalVat)} zł`, vatX[2] + 6, y + 7, { width: vatCw[2] - 12, align: "right" });
  doc.fillColor(BLUE).text(`${fmtNum(invoice.totalGross)} zł`, vatX[3] + 6, y + 7, { width: vatCw[3] - 12, align: "right" });
  y += vrhz + 18;

  // PŁATNOŚĆ - inline
  doc.font("B").fontSize(9).fillColor(GRAY).text("PŁATNOŚĆ", ML, y);
  y += 14;
  const payLineY = y;
  doc.font("R").fontSize(9).fillColor(TEXT).text("Forma: ", ML, payLineY, { continued: true }).font("B").text(payMethodLabel(invoice.paymentMethod));
  doc.font("R").fontSize(9).fillColor(TEXT).text("Status: ", ML + 100, payLineY, { continued: true }).font("B").text(payStatusLabel(invoice.paymentStatus));
  if (invoice.paymentDeadline) {
    doc.font("R").fontSize(9).fillColor(TEXT).text("Termin: ", ML + 220, payLineY, { continued: true }).font("B").fillColor(BLUE).text(fmtDate(invoice.paymentDeadline));
  }
  y += 20;

  if (seller.account) {
    const bbh = 40;
    roundedRect(doc, ML, y, leftW, bbh, 6);
    doc.fill(LIGHT_BLUE);
    roundedRect(doc, ML, y, leftW, bbh, 6);
    doc.stroke(BORDER);
    doc.font("B").fontSize(10).fillColor(BLUE).text(seller.bank, ML + 12, y + 8);
    doc.font("R").fontSize(10).fillColor(TEXT).text(seller.account, ML + 12, y + 24);
    y += bbh + 10;
  }

  if (seller.comment) {
    const commentLines = Math.ceil(seller.comment.length / 50);
    const pbh = Math.max(28, 16 + commentLines * 12);
    roundedRect(doc, ML, y, leftW, pbh, 6);
    doc.fill(YELLOW_BG);
    roundedRect(doc, ML, y, leftW, pbh, 6);
    doc.stroke("#fde047");
    doc.font("B").fontSize(9).fillColor(GREEN).text(seller.comment, ML + 12, y + 8, { width: leftW - 24 });
    y += pbh;
  }

  // Payment Summary - right side
  const psY = startY;
  const psh = 120;
  roundedRect(doc, rightX, psY, rightW, psh, 6);
  doc.fill(LIGHT_GRAY);
  roundedRect(doc, rightX, psY, rightW, psh, 6);
  doc.stroke(BORDER);

  doc.font("B").fontSize(8).fillColor(GRAY).text("PODSUMOWANIE PŁATNOŚCI", rightX + 12, psY + 12, { width: rightW - 24 });

  doc.font("R").fontSize(10).fillColor(TEXT);
  doc.text("Wartość faktury:", rightX + 12, psY + 32);
  doc.font("B").text(`${fmtNum(invoice.totalGross)} zł`, rightX + 12, psY + 32, { width: rightW - 24, align: "right" });

  doc.font("R").text("Zapłacono:", rightX + 12, psY + 50);
  doc.font("B").text(`${fmtNum(invoice.paidAmount)} zł`, rightX + 12, psY + 50, { width: rightW - 24, align: "right" });

  const remain = Number(invoice.totalGross) - Number(invoice.paidAmount);
  doc.font("R").fontSize(9).text("Pozostało do zapłaty:", rightX + 12, psY + 72);
  doc.font("B").fontSize(14).fillColor(BLUE).text(`${fmtNum(remain)} PLN`, rightX + 12, psY + 90, { width: rightW - 24, align: "center" });

  // === SIGNATURES ===
  y = Math.max(y + 60, PAGE_H - MB - 55);
  if (y > PAGE_H - MB - 25) { doc.addPage(); y = MT + 60; }

  doc.strokeColor(BORDER).lineWidth(0.5);
  doc.moveTo(ML + 30, y).lineTo(ML + 210, y).stroke();
  doc.moveTo(PAGE_W - MR - 210, y).lineTo(PAGE_W - MR - 30, y).stroke();

  doc.font("R").fontSize(8).fillColor(GRAY);
  doc.text("Podpis osoby upoważnionej do wystawienia", ML + 30, y + 6, { width: 180, align: "center" });
  doc.text("Podpis osoby upoważnionej do odbioru", PAGE_W - MR - 210, y + 6, { width: 180, align: "center" });

  doc.end();
  return doc;
}

export default generateInvoicePdfDirect;
