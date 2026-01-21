import { InvoiceWithItems, CustomerSnapshot } from '../types';
import { SettingsModel } from '../models/Settings';

function fmtDate(d: Date | string | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('pl-PL');
}

function fmtNum(v: number | string | undefined | null): string {
  return (Number(v) || 0).toFixed(2);
}

function payMethodLabel(m?: string): string {
  if (!m) return '-';
  const l: Record<string, string> = { card: 'Karta', cash: 'Gotówka', transfer: 'Przelew' };
  return l[m.toLowerCase()] || m;
}

function payStatusLabel(s: string): string {
  const l: Record<string, string> = {
    unpaid: 'Nieopłacona',
    partially_paid: 'Częściowo opłacona',
    paid: 'Opłacona',
    overdue: 'Po terminie'
  };
  return l[s.toLowerCase()] || s;
}

function getBuyer(b?: CustomerSnapshot) {
  if (!b) return { name: '', addr: '', city: '', nip: '' };
  let n = b.companyName || `${b.firstName || ''} ${b.lastName || ''}`.trim();
  return { name: n, addr: b.street || '', city: `${b.postalCode || ''} ${b.city || ''}`.trim(), nip: b.nip || '' };
}

function getRecipient(r?: CustomerSnapshot) {
  if (!r) return null;
  const name = r.companyName || `${r.firstName || ''} ${r.lastName || ''}`.trim();
  if (!name && !r.street && !r.city) return null;
  return {
    name: name,
    addr: r.street || '',
    city: `${r.postalCode || ''} ${r.city || ''}`.trim(),
    phone: (r as any).phone || ''
  };
}

export async function generateInvoiceHtml(invoice: InvoiceWithItems): Promise<string> {
  const settings = await SettingsModel.getCompanySettings();
  const seller = {
    name: settings.companyName || '',
    addr: settings.street || '',
    city: `${settings.postalCode || ''} ${settings.city || ''}`.trim(),
    nip: settings.nip || '',
    bank: settings.bankName || '',
    account: settings.bankAccount || '',
    comment: settings.invoiceComment || '',
  };
  const buyer = getBuyer(invoice.buyerSnapshot);
  const recipient = getRecipient(invoice.recipientSnapshot);
  const items = invoice.items || [];

  // Calculate VAT summary
  const vatMap = new Map<number, { net: number; vat: number; gross: number }>();
  let totalQty = 0;

  items.forEach(item => {
    const r = item.vatRate;
    const qty = Number(item.quantity) || 0;
    totalQty += qty;
    const n = Number(item.totalNet) || Number(item.unitPriceNet) * qty;
    const v = Number(item.totalVat) || n * r / 100;
    const g = Number(item.totalGross) || n + v;
    const e = vatMap.get(r) || { net: 0, vat: 0, gross: 0 };
    e.net += n; e.vat += v; e.gross += g;
    vatMap.set(r, e);
  });

  // Generate items rows
  const itemsHtml = items.map((item, idx) => {
    const qty = Number(item.quantity) || 0;
    const uNet = Number(item.unitPriceNet) || 0;
    const uGross = uNet * (1 + item.vatRate / 100);
    const tNet = Number(item.totalNet) || uNet * qty;
    const tVat = Number(item.totalVat) || tNet * item.vatRate / 100;
    const tGross = Number(item.totalGross) || tNet + tVat;
    const passport = (item as any).growerPassport || '';

    return `
      <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
        <td class="center">${idx + 1}</td>
        <td class="name">
          <div>${item.description || 'Produkt'}</div>
          ${passport ? `<div class="passport">Paszport: ${passport}</div>` : ''}
          <div class="pkwiu">PKWiU: 01.30.10.0</div>
        </td>
        <td class="center qty">${qty}</td>
        <td class="center">szt.</td>
        <td class="right">${fmtNum(uNet)}</td>
        <td class="right">${fmtNum(uGross)}</td>
        <td class="center">${item.vatRate}%</td>
        <td class="right">${fmtNum(tNet)}</td>
        <td class="right">${fmtNum(tVat)}</td>
        <td class="right bold">${fmtNum(tGross)}</td>
      </tr>
    `;
  }).join('');

  // Generate VAT summary rows
  const vatRowsHtml = Array.from(vatMap.entries()).map(([rate, v]) => `
    <tr>
      <td class="rate">${rate}%</td>
      <td class="right">${fmtNum(v.net)} zł</td>
      <td class="right">${fmtNum(v.vat)} zł</td>
      <td class="right bold blue">${fmtNum(v.gross)} zł</td>
    </tr>
  `).join('');

  const remain = Number(invoice.totalGross) - Number(invoice.paidAmount);

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Faktura ${invoice.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #111827;
      background: white;
      padding: 20px;
    }
    @media print {
      @page { size: A4 portrait; margin: 8mm; }
      body { padding: 0; }
      .invoice { max-width: 100%; }
    }
    .invoice { max-width: 720px; margin: 0 auto; }

    /* Header */
    .header { margin-bottom: 20px; }
    .header h1 { font-size: 27px; color: #111827; margin-bottom: 8px; }
    .header .inv-number { font-size: 19px; color: #2563eb; font-weight: bold; }
    .dates { float: right; text-align: right; font-size: 13px; }
    .dates span { font-weight: bold; }

    /* Boxes */
    .boxes { display: flex; gap: 12px; margin-bottom: 20px; clear: both; }
    .box { flex: 1; padding: 12px; border-radius: 8px; border: 1px solid #d1d5db; }
    .box.seller { background: #f3f4f6; }
    .box.buyer { background: #dbeafe; }
    .box.recipient { background: #dcfce7; border-color: #86efac; }
    .box-title { font-size: 12px; color: #6b7280; font-weight: bold; margin-bottom: 8px; }
    .box-name { font-size: 14px; font-weight: bold; margin-bottom: 8px; }
    .box.buyer .box-name { color: #2563eb; }
    .box.recipient .box-name { color: #16a34a; }
    .box-addr { font-size: 12px; color: #374151; }
    .box-nip { font-size: 12px; margin-top: 8px; }
    .box-nip span { font-weight: bold; }

    /* Items table */
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    .items-table th {
      background: #f3f4f6;
      padding: 8px 4px;
      text-align: center;
      border: 1px solid #d1d5db;
      font-size: 11px;
      color: #6b7280;
    }
    .items-table td {
      padding: 8px 4px;
      border: 1px solid #d1d5db;
      vertical-align: top;
    }
    .items-table tr.even { background: #ffffff; }
    .items-table tr.odd { background: #fafafa; }
    .items-table .center { text-align: center; }
    .items-table .right { text-align: right; }
    .items-table .bold { font-weight: bold; }
    .items-table .name { max-width: 180px; }
    .items-table .passport, .items-table .pkwiu { font-size: 10px; color: #6b7280; margin-top: 4px; }
    .items-table .qty { color: #2563eb; font-weight: bold; }
    .items-table tfoot td { background: #f3f4f6; font-weight: bold; }
    .items-table tfoot .blue { color: #2563eb; }

    /* Bottom section */
    .bottom { display: flex; gap: 20px; }
    .bottom-left { flex: 2; }
    .bottom-right { flex: 1; }

    /* VAT summary */
    .vat-section { margin-bottom: 16px; }
    .vat-section h3 { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
    .vat-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .vat-table th, .vat-table td {
      padding: 6px 8px;
      border: 1px solid #d1d5db;
    }
    .vat-table th { background: #f3f4f6; text-align: left; font-size: 11px; color: #6b7280; }
    .vat-table .right { text-align: right; }
    .vat-table .rate { color: #2563eb; font-weight: bold; }
    .vat-table .bold { font-weight: bold; }
    .vat-table .blue { color: #2563eb; }
    .vat-table tfoot td { background: #f3f4f6; font-weight: bold; }

    /* Payment info */
    .payment-section { margin-bottom: 16px; }
    .payment-section h3 { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
    .payment-row { font-size: 13px; margin-bottom: 4px; }
    .payment-row span { font-weight: bold; }

    /* Bank info */
    .bank-box {
      background: #dbeafe;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 12px;
    }
    .bank-name { color: #2563eb; font-weight: bold; font-size: 13px; margin-bottom: 4px; }
    .bank-account { font-size: 13px; }

    /* Comment box */
    .comment-box {
      background: #fef9c3;
      border: 1px solid #fde047;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      color: #15803d;
      font-weight: bold;
    }

    /* Summary box */
    .summary-box {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 12px;
    }
    .summary-box h3 { font-size: 11px; color: #6b7280; margin-bottom: 12px; }
    .summary-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
    .summary-row span:last-child { font-weight: bold; }
    .summary-total {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #d1d5db;
      text-align: center;
    }
    .summary-total .label { font-size: 12px; color: #6b7280; }
    .summary-total .amount { font-size: 19px; font-weight: bold; color: #2563eb; }

    /* Signatures */
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
      padding-top: 20px;
    }
    .signature {
      text-align: center;
      width: 200px;
    }
    .signature-line {
      border-top: 1px solid #d1d5db;
      padding-top: 8px;
      font-size: 11px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="dates">
        <div>Data wystawienia: <span>${fmtDate(invoice.issueDate)}</span></div>
        <div>Data sprzedaży: <span>${fmtDate(invoice.saleDate)}</span></div>
      </div>
      <h1>FAKTURA VAT</h1>
      <div class="inv-number">${invoice.invoiceNumber || ''}</div>
    </div>

    <div class="boxes">
      <div class="box seller">
        <div class="box-title">SPRZEDAWCA</div>
        <div class="box-name">${seller.name}</div>
        <div class="box-addr">${seller.addr}</div>
        <div class="box-addr">${seller.city}</div>
        <div class="box-nip">NIP: <span>${seller.nip}</span></div>
      </div>
      <div class="box buyer">
        <div class="box-title">NABYWCA</div>
        <div class="box-name">${buyer.name}</div>
        <div class="box-addr">${buyer.addr}</div>
        <div class="box-addr">${buyer.city}</div>
        ${buyer.nip ? `<div class="box-nip">NIP: <span>${buyer.nip}</span></div>` : ''}
      </div>
      ${recipient ? `
      <div class="box recipient">
        <div class="box-title">ODBIORCA</div>
        <div class="box-name">${recipient.name}</div>
        <div class="box-addr">${recipient.addr}</div>
        <div class="box-addr">${recipient.city}</div>
        ${recipient.phone ? `<div class="box-nip">Tel: <span>${recipient.phone}</span></div>` : ''}
      </div>
      ` : ''}
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 25px;">Lp.</th>
          <th>Nazwa towaru/usługi</th>
          <th style="width: 35px;">Ilość</th>
          <th style="width: 30px;">J.m.</th>
          <th style="width: 55px;">Cena netto</th>
          <th style="width: 55px;">Cena brutto</th>
          <th style="width: 35px;">VAT%</th>
          <th style="width: 65px;">Kwota netto</th>
          <th style="width: 55px;">Kwota VAT</th>
          <th style="width: 65px;">Kwota brutto</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" class="right">RAZEM:</td>
          <td class="center blue">${totalQty}</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td class="right">${fmtNum(invoice.subtotalNet)} zł</td>
          <td class="right">${fmtNum(invoice.totalVat)} zł</td>
          <td class="right blue">${fmtNum(invoice.totalGross)} zł</td>
        </tr>
      </tfoot>
    </table>

    <div class="bottom">
      <div class="bottom-left">
        <div class="vat-section">
          <h3>PODSUMOWANIE STAWEK VAT</h3>
          <table class="vat-table">
            <thead>
              <tr>
                <th style="width: 70px;">Stawka VAT</th>
                <th style="width: 90px;">Netto</th>
                <th style="width: 85px;">VAT</th>
                <th style="width: 95px;">Brutto</th>
              </tr>
            </thead>
            <tbody>
              ${vatRowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td>RAZEM</td>
                <td class="right">${fmtNum(invoice.subtotalNet)} zł</td>
                <td class="right">${fmtNum(invoice.totalVat)} zł</td>
                <td class="right blue">${fmtNum(invoice.totalGross)} zł</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="payment-section">
          <h3>PŁATNOŚĆ</h3>
          <div class="payment-row">Forma: <span>${payMethodLabel(invoice.paymentMethod)}</span></div>
          <div class="payment-row">Status: <span>${payStatusLabel(invoice.paymentStatus)}</span></div>
          ${invoice.paymentDeadline ? `<div class="payment-row">Termin: <span>${fmtDate(invoice.paymentDeadline)}</span></div>` : ''}
        </div>

        ${seller.account ? `
        <div class="bank-box">
          <div class="bank-name">${seller.bank}</div>
          <div class="bank-account">Numer konta: ${seller.account}</div>
        </div>
        ` : ''}

        ${seller.comment ? `
        <div class="comment-box">${seller.comment}</div>
        ` : ''}
      </div>

      <div class="bottom-right">
        <div class="summary-box">
          <h3>PODSUMOWANIE PŁATNOŚCI</h3>
          <div class="summary-row">
            <span>Wartość faktury:</span>
            <span>${fmtNum(invoice.totalGross)} zł</span>
          </div>
          <div class="summary-row">
            <span>Zapłacono:</span>
            <span>${fmtNum(invoice.paidAmount)} zł</span>
          </div>
          <div class="summary-total">
            <div class="label">Pozostało do zapłaty:</div>
            <div class="amount">${fmtNum(remain)} PLN</div>
          </div>
        </div>
      </div>
    </div>

    <div class="signatures">
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej do wystawienia</div>
      </div>
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej do odbioru</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}

export default generateInvoiceHtml;
