import puppeteer from 'puppeteer';
import { InvoiceWithItems, PaymentMethod, PaymentStatus } from '../types';
import { SettingsModel } from '../models/Settings';

interface SellerInfo {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  nip: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  bankName?: string;
  invoiceComment?: string;
}

function formatDate(dateString: string | Date): string {
  return new Date(dateString).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getPaymentMethodLabel(method?: string): string {
  if (!method) return '-';
  const labels: Record<string, string> = {
    card: 'Karta',
    cash: 'Gotówka',
    transfer: 'Przelew',
  };
  return labels[method] || method;
}

function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    unpaid: 'Nieopłacona',
    partially_paid: 'Częściowo opłacona',
    paid: 'Opłacona',
    overdue: 'Przeterminowana',
  };
  return labels[status] || status;
}

function generateInvoiceHTML(invoice: InvoiceWithItems, sellerInfo: SellerInfo): string {
  const buyer = invoice.buyerSnapshot || {};
  const recipient = invoice.recipientSnapshot;
  
  const buyerName = buyer.companyName || 
    [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 
    'Nabywca';
  
  const buyerNameWithCode = buyer.customerCode 
    ? `[${buyer.customerCode}] ${buyerName}` 
    : buyerName;

  const hasRecipient = recipient && (
    recipient.companyName || recipient.firstName || recipient.lastName || recipient.street
  );

  const recipientName = hasRecipient 
    ? (recipient!.companyName || [recipient!.firstName, recipient!.lastName].filter(Boolean).join(' '))
    : '';

  const items = invoice.items || [];
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  
  const toNumber = (val: any): number => parseFloat(String(val || 0)) || 0;
  
  const subtotalNet = toNumber(invoice.subtotalNet);
  const totalVat = toNumber(invoice.totalVat);
  const totalGross = toNumber(invoice.totalGross);
  const paidAmount = toNumber(invoice.paidAmount);
  const remaining = totalGross - paidAmount;

  const itemsHTML = items.map((item, index) => `
    <tr>
      <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${index + 1}</td>
      <td style="border: 1px solid #d1d5db; padding: 8px;">
        <div>${item.description || 'Produkt'}</div>
        ${item.growerPassport ? `<div style="color: #6b7280; font-size: 10px;">Paszport: ${item.growerPassport}</div>` : ''}
        <div style="color: #6b7280; font-size: 10px;">PKWiU: 01.30.10.0</div>
      </td>
      <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center; font-weight: 600;">${item.quantity}</td>
      <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">szt.</td>
      <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${toNumber(item.unitPriceNet).toFixed(2)}</td>
      <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${item.vatRate}%</td>
      <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${toNumber(item.totalNet).toFixed(2)}</td>
      <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${toNumber(item.totalVat).toFixed(2)}</td>
      <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right; font-weight: 600;">${toNumber(item.totalGross).toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1f2937; padding: 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #d1d5db; }
    .title { font-size: 24px; font-weight: bold; color: #1f2937; }
    .invoice-number { font-size: 20px; font-weight: bold; color: #2563eb; margin-top: 4px; }
    .dates { text-align: right; font-size: 12px; }
    .dates span { font-weight: 600; }
    .parties { display: grid; grid-template-columns: ${hasRecipient ? '1fr 1fr 1fr' : '1fr 1fr'}; gap: 16px; margin-bottom: 24px; }
    .party-box { padding: 16px; border-radius: 8px; }
    .seller-box { background: #f9fafb; }
    .buyer-box { background: #eff6ff; border: 1px solid #bfdbfe; }
    .recipient-box { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .party-label { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
    .party-name { font-weight: bold; font-size: 14px; }
    .party-detail { font-size: 12px; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 24px; }
    thead tr { background: #f3f4f6; }
    th { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-weight: 600; }
    tfoot tr { background: #f3f4f6; font-weight: bold; }
    .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 24px; }
    .payment-info h3 { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
    .bank-info { margin-top: 12px; padding: 12px; background: #f9fafb; border-radius: 4px; font-size: 11px; }
    .total-box { background: #eff6ff; padding: 16px; border-radius: 8px; border: 2px solid #bfdbfe; text-align: right; }
    .total-label { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
    .total-amount { font-size: 28px; font-weight: bold; color: #2563eb; }
    .total-deadline { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .notes { margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; }
    .notes h3 { font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 48px; padding-top: 24px; }
    .signature { text-align: center; }
    .signature-line { border-top: 1px solid #9ca3af; padding-top: 8px; margin-top: 48px; }
    .signature-label { font-size: 10px; color: #6b7280; }
    .comment-box { margin-top: 12px; padding: 12px; background: #fefce8; border: 1px solid #fde047; border-radius: 4px; font-size: 11px; color: #854d0e; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">FAKTURA VAT</div>
      <div class="invoice-number">${invoice.invoiceNumber}</div>
    </div>
    <div class="dates">
      <div>Data wystawienia: <span>${formatDate(invoice.issueDate)}</span></div>
      <div>Data sprzedaży: <span>${formatDate(invoice.saleDate)}</span></div>
      ${invoice.paymentDeadline ? `<div>Termin płatności: <span>${formatDate(invoice.paymentDeadline)}</span></div>` : ''}
    </div>
  </div>

  <div class="parties">
    <div class="party-box seller-box">
      <div class="party-label">Sprzedawca</div>
      <div class="party-name">${sellerInfo.name}</div>
      <div class="party-detail">${sellerInfo.address}</div>
      <div class="party-detail">${sellerInfo.postalCode} ${sellerInfo.city}</div>
      <div class="party-detail" style="margin-top: 8px;">NIP: <strong>${sellerInfo.nip}</strong></div>
      ${sellerInfo.phone ? `<div class="party-detail">Tel: ${sellerInfo.phone}</div>` : ''}
      ${sellerInfo.email ? `<div class="party-detail">Email: ${sellerInfo.email}</div>` : ''}
    </div>

    <div class="party-box buyer-box">
      <div class="party-label">Nabywca</div>
      <div class="party-name">${buyerNameWithCode}</div>
      ${buyer.street ? `<div class="party-detail">${buyer.street}</div>` : ''}
      ${buyer.postalCode || buyer.city ? `<div class="party-detail">${buyer.postalCode || ''} ${buyer.city || ''}</div>` : ''}
      ${buyer.nip ? `<div class="party-detail" style="margin-top: 8px;">NIP: <strong>${buyer.nip}</strong></div>` : ''}
    </div>

    ${hasRecipient ? `
    <div class="party-box recipient-box">
      <div class="party-label">Odbiorca</div>
      <div class="party-name">${recipientName}</div>
      ${recipient!.street ? `<div class="party-detail">${recipient!.street}</div>` : ''}
      ${recipient!.postalCode || recipient!.city ? `<div class="party-detail">${recipient!.postalCode || ''} ${recipient!.city || ''}</div>` : ''}
      ${recipient!.phone ? `<div class="party-detail" style="margin-top: 8px;">Tel: <strong>${recipient!.phone}</strong></div>` : ''}
    </div>
    ` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px; text-align: center;">Lp.</th>
        <th>Nazwa</th>
        <th style="width: 50px; text-align: center;">Ilość</th>
        <th style="width: 40px; text-align: center;">J.m.</th>
        <th style="width: 70px; text-align: right;">Cena netto</th>
        <th style="width: 40px; text-align: center;">VAT</th>
        <th style="width: 70px; text-align: right;">Wart. netto</th>
        <th style="width: 60px; text-align: right;">Wart. VAT</th>
        <th style="width: 80px; text-align: right;">Wart. brutto</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">RAZEM:</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: center;">${totalQuantity}</td>
        <td colspan="3" style="border: 1px solid #d1d5db; padding: 8px;"></td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${subtotalNet.toFixed(2)} zł</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right;">${totalVat.toFixed(2)} zł</td>
        <td style="border: 1px solid #d1d5db; padding: 8px; text-align: right; color: #2563eb;">${totalGross.toFixed(2)} zł</td>
      </tr>
    </tfoot>
  </table>

  <div class="summary">
    <div class="payment-info">
      <h3>Płatność</h3>
      <div>Forma: <strong>${getPaymentMethodLabel(invoice.paymentMethod)}</strong></div>
      <div>Status: <strong>${getPaymentStatusLabel(invoice.paymentStatus)}</strong></div>
      ${paidAmount > 0 && paidAmount < totalGross ? `<div>Zapłacono: <strong>${paidAmount.toFixed(2)} zł</strong></div>` : ''}
      ${sellerInfo.bankAccount ? `
      <div class="bank-info">
        <div style="font-weight: 600;">${sellerInfo.bankName || 'Bank'}</div>
        <div style="font-family: monospace; margin-top: 4px;">${sellerInfo.bankAccount}</div>
      </div>
      ` : ''}
      ${sellerInfo.invoiceComment ? `
      <div class="comment-box">${sellerInfo.invoiceComment}</div>
      ` : ''}
    </div>
    <div style="display: flex; justify-content: flex-end;">
      <div class="total-box">
        <div class="total-label">Do zapłaty</div>
        <div class="total-amount">${remaining.toFixed(2)} PLN</div>
        ${invoice.paymentDeadline ? `<div class="total-deadline">Termin: ${formatDate(invoice.paymentDeadline)}</div>` : ''}
      </div>
    </div>
  </div>

  ${invoice.notes ? `
  <div class="notes">
    <h3>Uwagi</h3>
    <div>${invoice.notes}</div>
  </div>
  ` : ''}

  <div class="signatures">
    <div class="signature">
      <div class="signature-line">
        <div class="signature-label">Podpis osoby upoważnionej do wystawienia</div>
      </div>
    </div>
    <div class="signature">
      <div class="signature-line">
        <div class="signature-label">Podpis osoby upoważnionej do odbioru</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function generateInvoicePDFPuppeteer(invoice: InvoiceWithItems): Promise<Buffer> {
  // Fetch company settings
  const companySettings = await SettingsModel.getCompanySettings();
  
  const sellerInfo: SellerInfo = {
    name: companySettings.companyName || 'Nazwa firmy nie skonfigurowana',
    nip: companySettings.nip || 'NIP nie skonfigurowany',
    address: companySettings.street || '',
    postalCode: companySettings.postalCode || '',
    city: companySettings.city || '',
    phone: companySettings.phone || '',
    email: companySettings.email || '',
    bankName: companySettings.bankName || '',
    bankAccount: companySettings.bankAccount || '',
    invoiceComment: companySettings.invoiceComment || '',
  };

  const html = generateInvoiceHTML(invoice, sellerInfo);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
