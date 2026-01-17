import { InvoiceWithItems, PaymentMethod, PaymentStatus, PaymentSplit } from '../types';
import { SettingsModel } from '../models/Settings';

interface SellerInfo {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  nip: string;
  vatEu?: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  bankName?: string;
  invoiceComment?: string;
}

/**
 * Generate HTML for invoice printing
 * Used by Print Agent to fetch and print invoices
 */
export async function generateInvoiceHtml(invoice: InvoiceWithItems): Promise<string> {
  // Fetch company settings
  const isProforma = invoice.invoiceType === "proforma";
  const companySettings = await SettingsModel.getCompanySettings();

  // Check if this is a WDT invoice (EU company with VAT-EU)
  const isWdt = invoice.transactionType === 'wdt';

  const sellerInfo: SellerInfo = {
    name: companySettings.companyName || 'Nazwa firmy nie skonfigurowana',
    nip: companySettings.nip || 'NIP nie skonfigurowany',
    vatEu: companySettings.nip ? 'PL' + companySettings.nip.replace(/[^0-9]/g, '') : undefined,
    address: companySettings.street || '',
    postalCode: companySettings.postalCode || '',
    city: companySettings.city || '',
    phone: companySettings.phone || '',
    email: companySettings.email || '',
    bankName: companySettings.bankName || '',
    bankAccount: companySettings.bankAccount || '',
    invoiceComment: companySettings.invoiceComment || '',
  };

  const formatDate = (date: Date | string): string => {
    return new Date(date).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatPrice = (price: number | string | null | undefined): string => {
    const num = parseFloat(String(price || 0)) || 0;
    return num.toFixed(2);
  };

  const getPaymentMethodLabel = (method?: PaymentMethod): string => {
    if (!method) return '-';
    const labels: Record<PaymentMethod, string> = {
      [PaymentMethod.CARD]: 'Karta',
      [PaymentMethod.CASH]: 'Gotówka',
      [PaymentMethod.TRANSFER]: 'Przelew',
    };
    return labels[method] || method;
  };

  const getPaymentStatusLabel = (status: PaymentStatus): string => {
    const labels: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'Nieopłacona',
      [PaymentStatus.PARTIALLY_PAID]: 'Częściowo opłacona',
      [PaymentStatus.PAID]: 'Opłacona',
      [PaymentStatus.OVERDUE]: 'Przeterminowana',
    };
    return labels[status] || status;
  };

  const buyer = invoice.buyerSnapshot;
  const recipient = invoice.recipientSnapshot;

  const getBuyerName = (): string => {
    let name = '';
    if (buyer?.companyName) {
      name = buyer.companyName;
    } else if (buyer?.firstName || buyer?.lastName) {
      name = ((buyer.firstName || '') + ' ' + (buyer.lastName || '')).trim();
    } else {
      name = 'Nabywca';
    }
    if (buyer?.customerCode) {
      return '[' + buyer.customerCode + '] ' + name;
    }
    return name;
  };

  const getRecipientName = (): string => {
    if (recipient?.companyName) return recipient.companyName;
    if (recipient?.firstName || recipient?.lastName) {
      return ((recipient.firstName || '') + ' ' + (recipient.lastName || '')).trim();
    }
    return '';
  };

  const hasRecipient = recipient && (
    recipient.companyName ||
    recipient.firstName ||
    recipient.lastName ||
    recipient.street
  );

  const totalQuantity = invoice.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const remainingAmount = parseFloat(String(invoice.totalGross)) - parseFloat(String(invoice.paidAmount));

  // Generate items HTML
  const itemsHtml = (invoice.items || []).map((item, index) => {
    return '<tr>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">' + (index + 1) + '</td>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px;">' +
        '<div>' + (item.description || 'Brak opisu') + '</div>' +
        (item.growerPassport ? '<div style="color: #6b7280; font-size: 10px;">Paszport: ' + item.growerPassport + '</div>' : '') +
      '</td>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px; text-align: center; font-weight: 600;">' + item.quantity + '</td>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">szt.</td>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px; text-align: right;">' + formatPrice(item.unitPriceNet) + '</td>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">' + item.vatRate + '%</td>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px; text-align: right;">' + formatPrice(item.totalNet) + '</td>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px; text-align: right;">' + formatPrice(item.totalVat) + '</td>' +
      '<td style="border: 1px solid #d1d5db; padding: 6px; text-align: right; font-weight: 600;">' + formatPrice(item.totalGross) + '</td>' +
    '</tr>';
  }).join('\n');

  // Generate VAT summary by rate
  const vatMap = new Map<number, { netValue: number; vatAmount: number; grossValue: number }>();
  (invoice.items || []).forEach(item => {
    const rate = item.vatRate;
    const existing = vatMap.get(rate);
    if (existing) {
      existing.netValue += parseFloat(String(item.totalNet)) || 0;
      existing.vatAmount += parseFloat(String(item.totalVat)) || 0;
      existing.grossValue += parseFloat(String(item.totalGross)) || 0;
    } else {
      vatMap.set(rate, {
        netValue: parseFloat(String(item.totalNet)) || 0,
        vatAmount: parseFloat(String(item.totalVat)) || 0,
        grossValue: parseFloat(String(item.totalGross)) || 0,
      });
    }
  });
  
  const vatSummaryRows = Array.from(vatMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, values]) => 
      '<tr>' +
        '<td style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: center; font-weight: 600;">' + rate + '%</td>' +
        '<td style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right;">' + values.netValue.toFixed(2) + ' zł</td>' +
        '<td style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right;">' + values.vatAmount.toFixed(2) + ' zł</td>' +
        '<td style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right; font-weight: 600;">' + values.grossValue.toFixed(2) + ' zł</td>' +
      '</tr>'
    ).join('\n');
  
  const vatSummaryHtml = vatSummaryRows ? 
    '<table style="width: 50%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; margin-left: auto;">' +
      '<thead><tr style="background: #f3f4f6;">' +
        '<th style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: center; width: 25%;">Stawka VAT</th>' +
        '<th style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right;">Netto</th>' +
        '<th style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right;">VAT</th>' +
        '<th style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right;">Brutto</th>' +
      '</tr></thead>' +
      '<tbody>' + vatSummaryRows +
        '<tr style="background: #f8fafc; font-weight: bold;">' +
          '<td style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: center;">RAZEM</td>' +
          '<td style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right;">' + formatPrice(invoice.subtotalNet) + ' zł</td>' +
          '<td style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right;">' + formatPrice(invoice.totalVat) + ' zł</td>' +
          '<td style="border: 1px solid #d1d5db; padding: 5px 10px; text-align: right; color: #2563eb;">' + formatPrice(invoice.totalGross) + ' zł</td>' +
        '</tr>' +
      '</tbody>' +
    '</table>' : '';

  // Generate payment splits HTML if applicable
  let paymentSplitsHtml = '';
  if (invoice.paymentSplits && invoice.paymentSplits.length > 1) {
    const splitsText = invoice.paymentSplits.map((split: PaymentSplit) =>
      '<p style="font-size: 14px; padding-left: 8px;">• ' + getPaymentMethodLabel(split.paymentMethod) + ': <span style="font-weight: 600;">' + formatPrice(split.amount) + ' zł</span></p>'
    ).join('\n');
    paymentSplitsHtml = '<p style="font-size: 14px; font-weight: 600;">Płatność podzielona:</p>\n' + splitsText;
  } else {
    paymentSplitsHtml = '<p style="font-size: 14px;">Forma: <span style="font-weight: 600;">' + getPaymentMethodLabel(invoice.paymentMethod) + '</span></p>';
  }

  // Build HTML parts
  const gridCols = hasRecipient ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)';

  const recipientSection = hasRecipient ? `
      <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #bbf7d0;">
        <h3 style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Odbiorca</h3>
        <p style="font-weight: bold; font-size: 14px;">${getRecipientName()}</p>
        ${recipient?.street ? '<p style="font-size: 13px;">' + recipient.street + '</p>' : ''}
        ${(recipient?.postalCode || recipient?.city) ? '<p style="font-size: 13px;">' + (recipient.postalCode || '') + ' ' + (recipient.city || '') + '</p>' : ''}
        ${recipient?.phone ? '<p style="font-size: 13px; margin-top: 8px;">Tel: <span style="font-weight: 600;">' + recipient.phone + '</span></p>' : ''}
      </div>
  ` : '';

  const paidAmountNum = parseFloat(String(invoice.paidAmount));
  const totalGrossNum = parseFloat(String(invoice.totalGross));
  const showPaidAmount = paidAmountNum > 0 && paidAmountNum < totalGrossNum;

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isProforma ? "Pro Forma" : "Faktura"} ${invoice.invoiceNumber}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #111827; line-height: 1.4; }
    .invoice-container { max-width: 210mm; margin: 0 auto; padding: 20px; background: white; }
    @media print {
      body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .invoice-container { max-width: 100%; padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #d1d5db;">
      <div>
        <h1 style="font-size: 22px; font-weight: bold; color: #1f2937;">${isProforma ? "PRO FORMA" : (isWdt ? "FAKTURA VAT - WDT" : "FAKTURA VAT")}</h1>
        <p style="font-size: 18px; font-weight: bold; color: #2563eb; margin-top: 4px;">${invoice.invoiceNumber}</p>
        ${invoice.orderId ? '<p style="font-size: 13px; color: #6b7280; margin-top: 4px;">Zamówienie: ' + invoice.orderId + '</p>' : ''}
      </div>
      <div style="text-align: right; font-size: 13px;">
        <p>Data wystawienia: <span style="font-weight: 600;">${formatDate(invoice.issueDate)}</span></p>
        <p>Data sprzedaży: <span style="font-weight: 600;">${formatDate(invoice.saleDate)}</span></p>
        ${invoice.paymentDeadline ? '<p>Termin płatności: <span style="font-weight: 600;">' + formatDate(invoice.paymentDeadline) + '</span></p>' : ''}
      </div>
    </div>

    <!-- Seller, Buyer & Recipient -->
    <div style="display: grid; grid-template-columns: ${gridCols}; gap: 15px; margin-bottom: 20px;">
      <!-- Sprzedawca -->
      <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
        <h3 style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Sprzedawca</h3>
        <p style="font-weight: bold;">${sellerInfo.name}</p>
        <p style="font-size: 13px;">${sellerInfo.address}</p>
        <p style="font-size: 13px;">${sellerInfo.postalCode} ${sellerInfo.city}</p>
        <p style="font-size: 13px; margin-top: 8px;">NIP: <span style="font-weight: 600;">${sellerInfo.nip}</span></p>
        ${isWdt && sellerInfo.vatEu ? '<p style="font-size: 13px;">VAT-UE: <span style="font-weight: 600;">' + sellerInfo.vatEu + '</span></p>' : ''}
        ${sellerInfo.phone ? '<p style="font-size: 13px;">Tel: ' + sellerInfo.phone + '</p>' : ''}
        ${sellerInfo.email ? '<p style="font-size: 13px;">Email: ' + sellerInfo.email + '</p>' : ''}
      </div>

      <!-- Nabywca -->
      <div style="background: #eff6ff; padding: 15px; border-radius: 8px; border: 1px solid #bfdbfe;">
        <h3 style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Nabywca</h3>
        <p style="font-weight: bold; font-size: 14px;">${getBuyerName()}</p>
        ${buyer?.street ? '<p style="font-size: 13px;">' + buyer.street + '</p>' : ''}
        ${(buyer?.postalCode || buyer?.city) ? '<p style="font-size: 13px;">' + (buyer.postalCode || '') + ' ' + (buyer.city || '') + '</p>' : ''}
        ${buyer?.nip ? '<p style="font-size: 13px; margin-top: 8px;">NIP: <span style="font-weight: 600;">' + buyer.nip + '</span></p>' : ''}
        ${isWdt && buyer?.vatEu ? '<p style="font-size: 13px;">VAT-UE: <span style="font-weight: 600;">' + buyer.vatEu + '</span></p>' : ''}
        ${isWdt && buyer?.country ? '<p style="font-size: 13px;">Kraj: <span style="font-weight: 600;">' + buyer.country + '</span></p>' : ''}
      </div>

      ${recipientSection}
    </div>

    <!-- Items Table -->
    <div style="margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: left; width: 4%;">Lp.</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: left; width: 28%;">Nazwa</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: center; width: 6%;">Ilość</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: center; width: 5%;">J.m.</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: right; width: 11%;">Cena netto</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: center; width: 6%;">VAT%</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: right; width: 13%;">Kwota netto</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: right; width: 13%;">Kwota VAT</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; text-align: right; width: 14%;">Kwota brutto</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr style="background: #f3f4f6; font-weight: bold;">
            <td colspan="2" style="border: 1px solid #d1d5db; padding: 6px; text-align: right;">RAZEM:</td>
            <td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">${totalQuantity}</td>
            <td colspan="3" style="border: 1px solid #d1d5db; padding: 6px;"></td>
            <td style="border: 1px solid #d1d5db; padding: 6px; text-align: right;">${formatPrice(invoice.subtotalNet)} zł</td>
            <td style="border: 1px solid #d1d5db; padding: 6px; text-align: right;">${formatPrice(invoice.totalVat)} zł</td>
            <td style="border: 1px solid #d1d5db; padding: 6px; text-align: right; color: #2563eb;">${formatPrice(invoice.totalGross)} zł</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- VAT Summary -->
    ${vatSummaryHtml}
    <!-- Summary -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 20px;">
      <div>
        <h3 style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Płatność</h3>
        ${paymentSplitsHtml}
        <p style="font-size: 14px; margin-top: 4px;">Status: <span style="font-weight: 600;">${getPaymentStatusLabel(invoice.paymentStatus)}</span></p>
        ${showPaidAmount ? '<p style="font-size: 14px;">Zapłacono: <span style="font-weight: 600;">' + formatPrice(invoice.paidAmount) + ' zł</span></p>' : ''}
        ${sellerInfo.bankAccount ? `
          <div style="margin-top: 12px; padding: 10px; background: #f9fafb; border-radius: 6px; font-size: 12px;">
            <p style="font-weight: 600;">${sellerInfo.bankName}</p>
            <p style="font-family: monospace; margin-top: 4px;">${sellerInfo.bankAccount}</p>
          </div>
        ` : ''}
        ${sellerInfo.invoiceComment ? `
          <div style="margin-top: 12px; padding: 10px; background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; font-size: 12px;">
            <p style="color: #854d0e;">${sellerInfo.invoiceComment}</p>
          </div>
        ` : ''}
      </div>
      <div style="display: flex; justify-content: flex-end;">
        <div style="background: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; min-width: 200px;">
          <h3 style="font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Podsumowanie płatności</h3>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; border-bottom: 1px solid #e2e8f0; margin-bottom: 6px;">
            <span>Wartość faktury:</span>
            <strong>${formatPrice(invoice.totalGross)} zł</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px;">
            <span>Zapłacono:</span>
            <strong>${formatPrice(invoice.paidAmount)} zł</strong>
          </div>
          <div style="border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 8px;">
            <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">Pozostało do zapłaty:</div>
            <div style="font-size: 16px; font-weight: bold; color: #2563eb; text-align: right;">
              ${remainingAmount.toFixed(2)} PLN
            </div>
          </div>
          ${invoice.paymentDeadline && remainingAmount > 0 ? '<div style="font-size: 10px; color: #64748b; margin-top: 6px; text-align: right;">Termin: ' + formatDate(invoice.paymentDeadline) + '</div>' : ''}
        </div>
      </div>
    </div>

    ${invoice.notes ? `
    <!-- Notes -->
    <div style="margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px;">
      <h3 style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Uwagi</h3>
      <p style="font-size: 13px;">${invoice.notes}</p>
    </div>
    ` : ''}

    ${isWdt ? `
    <!-- WDT Annotation -->
    <div style="margin-bottom: 20px; padding: 15px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px;">
      <p style="font-size: 12px; font-weight: 600; color: #92400e;">
        Wewnątrzwspólnotowa dostawa towarów - art. 42 ustawy o podatku od towarów i usług.
      </p>
      <p style="font-size: 11px; color: #78350f; margin-top: 4px;">
        Stawka VAT 0% zgodnie z art. 41 ust. 3 ustawy o VAT.
      </p>
    </div>
    ` : ''}

    <!-- Signatures -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 50px; padding-top: 20px;">
      <div style="text-align: center;">
        <div style="border-top: 1px solid #9ca3af; padding-top: 8px; margin-top: 50px;">
          <p style="font-size: 11px; color: #6b7280;">Podpis osoby upoważnionej do wystawienia</p>
        </div>
      </div>
      <div style="text-align: center;">
        <div style="border-top: 1px solid #9ca3af; padding-top: 8px; margin-top: 50px;">
          <p style="font-size: 11px; color: #6b7280;">Podpis osoby upoważnionej do odbioru</p>
        </div>
      </div>
    </div>

    <!-- Print Button (no-print) -->
    <div class="no-print" style="margin-top: 30px; text-align: center;">
      <button onclick="window.print()" style="padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">
        Drukuj fakturę
      </button>
    </div>
  </div>
</body>
</html>`;

  return html;
}
