import { ReceiptWithItems } from '../types';
import { SettingsModel } from '../models/Settings';
import { OrderModel } from '../models/Order';

export async function generateReceiptHtml(receipt: ReceiptWithItems): Promise<string> {
  // Pobierz ustawienia firmy
  const settings = await SettingsModel.getCompanySettings();

  // Pobierz zamówienie jeżeli jest powiazane
  let orderNumber = '';
  let orderItems: any[] = [];
  if (receipt.orderId) {
    const order = await OrderModel.getById(receipt.orderId);
    if (order) {
      orderNumber = order.orderNumber || '';
      orderItems = order.items || [];
    }
  }

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      card: 'Karta',
      cash: 'Gotówka',
      transfer: 'Przelew',
    };
    return labels[method] || method;
  };

  // Generuj pozycje - uzyj items z order lub receipt
  const items = orderItems.length > 0 ? orderItems : (receipt.items || []);

  const itemsHtml = items.map((item: any) => {
    const productName = item.productName || item.productSnapshot?.plantName || item.description || `Produkt #${item.productId || item.id}`;
    const quantity = item.quantity || 1;
    const unitPrice = Number(item.unitPriceGross || item.unitPrice || 0);
    const totalPrice = Number(item.totalPrice || item.total || (unitPrice * quantity));

    return `
      <tr style="border-bottom: 1px dotted #ddd;">
        <td style="padding: 4px 2px; word-wrap: break-word;">${productName}</td>
        <td style="text-align: center; font-weight: 600;">${quantity}</td>
        <td style="text-align: right;">${unitPrice.toFixed(2)}</td>
        <td style="text-align: right; font-weight: 600;">${totalPrice.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  // Generuj platnosci
  let paymentHtml = '';
  if (receipt.paymentSplits && receipt.paymentSplits.length > 1) {
    const splitsHtml = receipt.paymentSplits.map(split => `
      <div style="display: flex; justify-content: space-between; font-size: 13px;">
        <span>${getPaymentMethodLabel(split.paymentMethod)}:</span>
        <span>${Number(split.amount).toFixed(2)} PLN</span>
      </div>
    `).join('');
    paymentHtml = `
      <div>
        <p style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">Płatność podzielona:</p>
        ${splitsHtml}
      </div>
    `;
  } else {
    paymentHtml = `
      <div style="display: flex; justify-content: space-between; font-size: 13px;">
        <span>Forma płatności:</span>
        <span style="font-weight: 600;">${getPaymentMethodLabel(receipt.paymentMethod)}</span>
      </div>
    `;
  }

  const companyAddress = [settings.street, `${settings.postalCode} ${settings.city}`].filter(Boolean).join(', ');
  const createdAtDate = receipt.createdAt instanceof Date ? receipt.createdAt : new Date(receipt.createdAt);

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paragon ${receipt.receiptNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 77mm;
      margin: 0;
      padding: 0;
      font-family: "Courier New", Courier, monospace;
      font-weight: bold;
      font-size: 13px;
      line-height: 1.3;
      background: white;
      color: black;
    }
    @media print {
      @page { 
        size: 77mm auto; 
        margin: 0; 
      }
      html, body { 
        width: 77mm; 
        margin: 0; 
        padding: 0; 
      }
      .receipt { 
        width: 77mm; 
        max-width: 77mm; 
        padding: 2mm; 
        margin: 0; 
      }
    }
    .receipt {
      width: 77mm;
      max-width: 77mm;
      margin: 0;
      padding: 8px;
      background: white;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed black;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .header h1 {
      font-size: 15px;
      font-weight: bold;
      margin-bottom: 2px;
    }
    .header p {
      font-size: 11px;
    }
    .title {
      text-align: center;
      margin-bottom: 8px;
    }
    .title h2 {
      font-size: 13px;
      font-weight: bold;
    }
    .date-section {
      border-bottom: 1px dashed #999;
      padding-bottom: 6px;
      margin-bottom: 6px;
      font-size: 11px;
    }
    .items-section {
      border-bottom: 1px dashed #999;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      table-layout: fixed;
    }
    th {
      text-align: left;
      padding: 2px 1px;
      border-bottom: 1px solid #999;
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
    }
    td {
      padding: 2px 1px;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th:nth-child(1) { width: 45%; }
    th:nth-child(2) { text-align: center; width: 15%; }
    th:nth-child(3), th:nth-child(4) { text-align: right; width: 20%; }
    .total-section {
      border-bottom: 2px dashed black;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 15px;
      font-weight: bold;
    }
    .payment-section {
      border-bottom: 1px dashed #999;
      padding-bottom: 6px;
      margin-bottom: 6px;
    }
    .footer {
      text-align: center;
      font-size: 11px;
      margin-top: 8px;
    }
    .footer p {
      margin-bottom: 2px;
    }
    .footer .timestamp {
      font-size: 10px;
      color: #666;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px dotted #999;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1>${settings.companyName || 'Firma nie skonfigurowana'}</h1>
      <p>${companyAddress || 'ul. Kwiatowa 15, 00-001 Warszawa'}</p>
      <p>NIP: ${settings.nip || '123-456-78-90'}</p>
      ${settings.phone ? `<p>Tel: ${settings.phone}</p>` : ''}
    </div>

    <div class="title">
      <h2>DOWÓD WYDANIA</h2>
      <p style="font-weight: bold; font-size: 12px;">${receipt.receiptNumber}</p>
      ${orderNumber ? `<p style="font-size: 11px;">Zamówienie: ${orderNumber}</p>` : ''}
    </div>

    <div class="date-section">
      <p>Data: ${formatDate(createdAtDate)}</p>
    </div>

    <div class="items-section">
      <table>
        <thead>
          <tr>
            <th>Nazwa</th>
            <th>Szt</th>
            <th>Cena</th>
            <th>Wart</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <div class="total-section">
      <div class="total">
        <span>SUMA:</span>
        <span>${Number(receipt.totalAmount).toFixed(2)} PLN</span>
      </div>
    </div>

    <div class="payment-section">
      ${paymentHtml}
    </div>

    <div class="footer">
      <p style="font-weight: 600;">Dziękujemy za zakupy!</p>
      <p style="color: #666;">Zapraszamy ponownie</p>
      <div class="timestamp">
        <p>${formatDate(createdAtDate)}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}
