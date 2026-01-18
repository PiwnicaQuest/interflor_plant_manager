import { InvoiceCorrectionWithItems } from '../types';
import { SettingsModel } from '../models/Settings';

export async function generateCorrectionHTML(correction: InvoiceCorrectionWithItems): Promise<string> {
  const settings = await SettingsModel.getCompanySettings();

  const companyName = settings.companyName || 'Firma';
  const companyNip = settings.nip || '';
  const companyStreet = settings.street || '';
  const companyPostalCode = settings.postalCode || '';
  const companyCity = settings.city || '';
  const companyPhone = settings.phone || '';
  const bankName = settings.bankName || '';
  const bankAccount = settings.bankAccount || '';

  const buyer = correction.buyerSnapshot;
  const buyerName = buyer.companyName || `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim();

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('pl-PL');
  };

  const formatMoney = (amount: number) => {
    return amount.toFixed(2).replace('.', ',') + ' zl';
  };

  const formatDiff = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return sign + amount.toFixed(2).replace('.', ',') + ' zl';
  };

  const itemsRows = correction.items.map((item, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${item.description}</td>
      <td class="center">${item.originalQuantity}</td>
      <td class="center">${item.correctedQuantity}</td>
      <td class="center diff">${item.differenceQuantity >= 0 ? '+' : ''}${item.differenceQuantity}</td>
      <td class="right">${item.originalUnitPriceNet.toFixed(2)}</td>
      <td class="right">${item.correctedUnitPriceNet.toFixed(2)}</td>
      <td class="center">${item.originalVatRate}%</td>
      <td class="right">${item.originalTotalGross.toFixed(2)}</td>
      <td class="right">${item.correctedTotalGross.toFixed(2)}</td>
      <td class="right diff">${formatDiff(item.differenceGross)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Faktura korygujaca ${correction.correctionNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      padding: 15px;
      max-width: 210mm;
      margin: 0 auto;
    }

    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #dc2626;
    }
    .header h1 {
      color: #dc2626;
      font-size: 20px;
      margin-bottom: 5px;
    }
    .header .correction-number {
      font-size: 16px;
      font-weight: bold;
    }
    .header .dates {
      font-size: 11px;
      color: #666;
      margin-top: 5px;
    }

    .reference-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 15px;
    }
    .reference-box h3 {
      color: #dc2626;
      font-size: 12px;
      margin-bottom: 5px;
    }
    .reference-box p {
      margin: 2px 0;
    }

    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 15px;
    }
    .party-box {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px;
    }
    .party-box.seller {
      background: #f0fdf4;
      border-color: #86efac;
    }
    .party-box.buyer {
      background: #eff6ff;
      border-color: #93c5fd;
    }
    .party-box h3 {
      font-size: 11px;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 5px;
      padding-bottom: 3px;
      border-bottom: 1px solid #ddd;
    }
    .party-box .name {
      font-weight: bold;
      font-size: 12px;
    }

    .reason-box {
      background: #fefce8;
      border: 1px solid #fde047;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 15px;
    }
    .reason-box h3 {
      color: #a16207;
      font-size: 11px;
      margin-bottom: 5px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 10px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 5px 4px;
    }
    th {
      background: #f3f4f6;
      font-weight: 600;
      text-align: center;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .diff {
      font-weight: bold;
    }
    tr td.diff {
      background: #fef3c7;
    }

    .summary {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 15px;
    }
    .summary-box {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
    }
    .summary-box.before {
      background: #f9fafb;
    }
    .summary-box.after {
      background: #f0fdf4;
    }
    .summary-box.diff {
      background: #fef2f2;
    }
    .summary-box h4 {
      font-size: 10px;
      color: #666;
      margin-bottom: 5px;
    }
    .summary-box .amount {
      font-size: 14px;
      font-weight: bold;
    }
    .summary-box.diff .amount {
      color: #dc2626;
    }
    .summary-box .vat-row {
      font-size: 9px;
      color: #666;
      margin-top: 3px;
    }

    .bank-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 15px;
    }
    .bank-info h3 {
      font-size: 11px;
      margin-bottom: 5px;
    }

    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-top: 40px;
    }
    .signature-box {
      text-align: center;
      padding-top: 40px;
      border-top: 1px solid #000;
    }
    .signature-box span {
      font-size: 9px;
      color: #666;
    }

    @media print {
      body { padding: 0; }
      @page { margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>FAKTURA KORYGUJACA</h1>
    <div class="correction-number">${correction.correctionNumber}</div>
    <div class="dates">Data wystawienia: ${formatDate(correction.issueDate)}</div>
  </div>

  <div class="reference-box">
    <h3>Dotyczy faktury</h3>
    <p><strong>Numer:</strong> ${correction.originalInvoiceNumber}</p>
    <p><strong>Data wystawienia:</strong> ${formatDate(correction.originalInvoiceDate)}</p>
  </div>

  <div class="parties">
    <div class="party-box seller">
      <h3>Sprzedawca</h3>
      <div class="name">${companyName}</div>
      <div>${companyStreet}</div>
      <div>${companyPostalCode} ${companyCity}</div>
      ${companyNip ? `<div>NIP: ${companyNip}</div>` : ''}
      ${companyPhone ? `<div>Tel: ${companyPhone}</div>` : ''}
    </div>
    <div class="party-box buyer">
      <h3>Nabywca</h3>
      <div class="name">${buyerName}</div>
      <div>${buyer.street || ''}</div>
      <div>${buyer.postalCode || ''} ${buyer.city || ''}</div>
      ${buyer.nip ? `<div>NIP: ${buyer.nip}</div>` : ''}
    </div>
  </div>

  <div class="reason-box">
    <h3>Przyczyna korekty</h3>
    <p>${correction.correctionReason}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width: 25px">Lp.</th>
        <th rowspan="2">Nazwa towaru/uslugi</th>
        <th colspan="3">Ilosc</th>
        <th colspan="2">Cena netto</th>
        <th rowspan="2" style="width: 40px">VAT</th>
        <th colspan="3">Wartosc brutto</th>
      </tr>
      <tr>
        <th style="width: 45px">Przed</th>
        <th style="width: 45px">Po</th>
        <th style="width: 45px">Roznica</th>
        <th style="width: 55px">Przed</th>
        <th style="width: 55px">Po</th>
        <th style="width: 60px">Przed</th>
        <th style="width: 60px">Po</th>
        <th style="width: 70px">Roznica</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-box before">
      <h4>PRZED KOREKTA</h4>
      <div class="amount">${formatMoney(correction.originalTotalGross)}</div>
      <div class="vat-row">Netto: ${formatMoney(correction.originalSubtotalNet)}</div>
      <div class="vat-row">VAT: ${formatMoney(correction.originalTotalVat)}</div>
    </div>
    <div class="summary-box after">
      <h4>PO KOREKCIE</h4>
      <div class="amount">${formatMoney(correction.correctedTotalGross)}</div>
      <div class="vat-row">Netto: ${formatMoney(correction.correctedSubtotalNet)}</div>
      <div class="vat-row">VAT: ${formatMoney(correction.correctedTotalVat)}</div>
    </div>
    <div class="summary-box diff">
      <h4>ROZNICA</h4>
      <div class="amount">${formatDiff(correction.differenceGross)}</div>
      <div class="vat-row">Netto: ${formatDiff(correction.differenceNet)}</div>
      <div class="vat-row">VAT: ${formatDiff(correction.differenceVat)}</div>
    </div>
  </div>

  ${bankName && bankAccount ? `
  <div class="bank-info">
    <h3>Dane do przelewu (w przypadku zwrotu)</h3>
    <p><strong>Bank:</strong> ${bankName}</p>
    <p><strong>Nr konta:</strong> ${bankAccount}</p>
  </div>
  ` : ''}

  <div class="signatures">
    <div class="signature-box">
      <span>Podpis osoby upowaznionej do wystawienia</span>
    </div>
    <div class="signature-box">
      <span>Podpis osoby upowaznionej do odbióru</span>
    </div>
  </div>
</body>
</html>`;
}
