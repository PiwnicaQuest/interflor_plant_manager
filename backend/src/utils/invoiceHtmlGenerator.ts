import { SettingsModel } from '../models/Settings';

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unitPriceNet: number;
  unitPriceGross?: number;
  vatRate: number;
  growerPassport?: string;
}

interface CustomerSnapshot {
  customerCode?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  vatEu?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  orderId?: number;
  orderNumber?: string;
  issueDate: Date | string;
  saleDate: Date | string;
  paymentDeadline?: Date | string;
  paymentMethod?: string;
  paymentSplits?: Array<{ paymentMethod: string; amount: number }>;
  paymentStatus: string;
  items?: InvoiceItem[];
  subtotalNet: number;
  totalVat: number;
  totalGross: number;
  paidAmount: number;
  paidAt?: Date | string;
  notes?: string;
  buyerSnapshot?: CustomerSnapshot;
  recipientSnapshot?: CustomerSnapshot;
  transactionType?: string;
}

interface VatSummaryRow {
  rate: number;
  netValue: number;
  vatAmount: number;
  grossValue: number;
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatCurrency(value: number | undefined): string {
  return (value || 0).toFixed(2);
}

function getPaymentMethodLabel(method?: string): string {
  if (!method) return '-';
  const labels: Record<string, string> = {
    card: 'Karta',
    cash: 'Gotówka',
    transfer: 'Przelew',
  };
  return labels[method.toLowerCase()] || method;
}

function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    unpaid: 'Nieopłacona',
    partially_paid: 'Częściowo opłacona',
    paid: 'Opłacona',
    overdue: 'Przeterminowana',
  };
  return labels[status.toLowerCase()] || status;
}

function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function calculateVatSummary(items: InvoiceItem[] | undefined, invoice: Invoice): VatSummaryRow[] {
  const vatMap = new Map<number, VatSummaryRow>();

  items?.forEach(item => {
    const rate = item.vatRate;
    const itemNet = Number(item.unitPriceNet) * Number(item.quantity);
    const itemVat = itemNet * (rate / 100);
    const itemGross = itemNet + itemVat;

    const existing = vatMap.get(rate);
    if (existing) {
      existing.netValue += itemNet;
      existing.vatAmount += itemVat;
      existing.grossValue += itemGross;
    } else {
      vatMap.set(rate, {
        rate,
        netValue: itemNet,
        vatAmount: itemVat,
        grossValue: itemGross,
      });
    }
  });

  // Sort by VAT rate descending
  const rows = Array.from(vatMap.values()).sort((a, b) => b.rate - a.rate);

  // Adjust for rounding differences - use invoice totals as source of truth
  if (rows.length > 0) {
    const sumNet = rows.reduce((sum, r) => sum + r.netValue, 0);
    const sumVat = rows.reduce((sum, r) => sum + r.vatAmount, 0);
    const sumGross = rows.reduce((sum, r) => sum + r.grossValue, 0);

    const diffNet = (Number(invoice.subtotalNet) || 0) - sumNet;
    const diffVat = (Number(invoice.totalVat) || 0) - sumVat;
    const diffGross = (Number(invoice.totalGross) || 0) - sumGross;

    // Apply rounding adjustment to the first (highest) rate row
    if (Math.abs(diffNet) < 1 && Math.abs(diffVat) < 1 && Math.abs(diffGross) < 1) {
      rows[0].netValue += diffNet;
      rows[0].vatAmount += diffVat;
      rows[0].grossValue += diffGross;
    }
  }

  return rows;
}

function getAdjustedItems(items: InvoiceItem[] | undefined, invoice: Invoice): Array<InvoiceItem & { adjustedNet: number; adjustedVat: number; adjustedGross: number }> {
  if (!items || items.length === 0) return [];

  // Calculate raw sums from items
  const rawSumNet = items.reduce((sum, item) => {
    return sum + (Number(item.unitPriceNet) * Number(item.quantity));
  }, 0);

  const rawSumVat = items.reduce((sum, item) => {
    const itemNet = Number(item.unitPriceNet) * Number(item.quantity);
    return sum + (itemNet * (item.vatRate / 100));
  }, 0);

  const rawSumGross = rawSumNet + rawSumVat;

  // Get invoice totals
  const invoiceNet = Number(invoice.subtotalNet) || 0;
  const invoiceVat = Number(invoice.totalVat) || 0;
  const invoiceGross = Number(invoice.totalGross) || 0;

  // Calculate adjusted items
  let adjustedItems = items.map(item => {
    const itemNet = Number(item.unitPriceNet) * Number(item.quantity);
    const itemVat = itemNet * (item.vatRate / 100);
    const itemGross = itemNet + itemVat;

    const netRatio = rawSumNet > 0 ? invoiceNet / rawSumNet : 1;
    const vatRatio = rawSumVat > 0 ? invoiceVat / rawSumVat : 1;
    const grossRatio = rawSumGross > 0 ? invoiceGross / rawSumGross : 1;

    return {
      ...item,
      adjustedNet: itemNet * netRatio,
      adjustedVat: itemVat * vatRatio,
      adjustedGross: itemGross * grossRatio,
    };
  });

  // Final adjustment to ensure exact match (apply difference to last item)
  if (adjustedItems.length > 0) {
    const sumAdjNet = adjustedItems.reduce((sum, item) => sum + item.adjustedNet, 0);
    const sumAdjVat = adjustedItems.reduce((sum, item) => sum + item.adjustedVat, 0);
    const sumAdjGross = adjustedItems.reduce((sum, item) => sum + item.adjustedGross, 0);

    const lastItem = adjustedItems[adjustedItems.length - 1];
    lastItem.adjustedNet += invoiceNet - sumAdjNet;
    lastItem.adjustedVat += invoiceVat - sumAdjVat;
    lastItem.adjustedGross += invoiceGross - sumAdjGross;
  }

  return adjustedItems;
}

export async function generateInvoiceHtml(invoice: Invoice): Promise<string> {
  // Fetch company settings
  const settings = await SettingsModel.getCompanySettings();

  const sellerInfo = {
    name: settings.companyName || 'Firma nie skonfigurowana',
    address: settings.street || 'Skonfiguruj dane firmy w Ustawieniach',
    city: settings.city || '',
    postalCode: settings.postalCode || '',
    nip: settings.nip || '0000000000',
    phone: settings.phone || '',
    email: settings.email || '',
    bankAccount: settings.bankAccount || '',
    bankName: settings.bankName || '',
    invoiceComment: settings.invoiceComment || '',
  };

  const buyer = invoice.buyerSnapshot;
  const recipient = invoice.recipientSnapshot;

  const getBuyerName = () => {
    let name = '';
    if (buyer?.companyName) {
      name = buyer.companyName;
    } else if (buyer?.firstName || buyer?.lastName) {
      name = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim();
    } else {
      name = 'Nabywca';
    }
    if (buyer?.customerCode) {
      return '[' + buyer.customerCode + '] ' + name;
    }
    return name;
  };

  const getRecipientName = () => {
    if (recipient?.companyName) return recipient.companyName;
    if (recipient?.firstName || recipient?.lastName) {
      return `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim();
    }
    return '';
  };

  const hasRecipient = recipient && (
    recipient.companyName ||
    recipient.firstName ||
    recipient.lastName ||
    recipient.street
  );

  const totalQuantity = invoice.items?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0;
  const vatSummary = calculateVatSummary(invoice.items, invoice);
  const remainingToPay = Number(invoice.totalGross) - Number(invoice.paidAmount);
  const adjustedItems = getAdjustedItems(invoice.items, invoice);

  // Determine invoice title based on transaction type
  const invoiceTitle = invoice.transactionType === 'wdt' ? 'FAKTURA VAT (WDT)' : 'FAKTURA VAT';

  // Generate items rows
  let itemsHtml = '';
  adjustedItems.forEach((item, index) => {
    itemsHtml += `
      <tr>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: center; vertical-align: top;">${index + 1}</td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: left; vertical-align: top;">
          <div style="font-weight: 500;">${escapeHtml(item.description)}</div>
          ${item.growerPassport ? `<div style="font-size: 8px; color: #6b7280;">Paszport: ${escapeHtml(item.growerPassport)}</div>` : ''}
          <div style="font-size: 8px; color: #6b7280;">PKWiU: 01.30.10.0</div>
        </td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: center; vertical-align: top; font-weight: 600;">${item.quantity}</td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: center; vertical-align: top;">szt.</td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right; vertical-align: top;">${formatCurrency(item.unitPriceNet)}</td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right; vertical-align: top;">${formatCurrency(item.unitPriceGross)}</td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: center; vertical-align: top;">${item.vatRate}%</td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right; vertical-align: top;">${formatCurrency(item.adjustedNet)}</td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right; vertical-align: top;">${formatCurrency(item.adjustedVat)}</td>
        <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right; vertical-align: top; font-weight: 600;">${formatCurrency(item.adjustedGross)}</td>
      </tr>
    `;
  });

  // Generate VAT summary rows
  let vatRowsHtml = '';
  vatSummary.forEach(row => {
    vatRowsHtml += `
      <tr>
        <td style="border: 1px solid #d1d5db; padding: 4px 8px; text-align: center; font-weight: 600; font-size: 10px;">${row.rate}%</td>
        <td style="border: 1px solid #d1d5db; padding: 4px 8px; text-align: right; font-size: 10px;">${formatCurrency(row.netValue)} zł</td>
        <td style="border: 1px solid #d1d5db; padding: 4px 8px; text-align: right; font-size: 10px;">${formatCurrency(row.vatAmount)} zł</td>
        <td style="border: 1px solid #d1d5db; padding: 4px 8px; text-align: right; font-size: 10px; font-weight: 600;">${formatCurrency(row.grossValue)} zł</td>
      </tr>
    `;
  });

  // Generate payment splits HTML
  let paymentInfoHtml = '';
  if (invoice.paymentSplits && invoice.paymentSplits.length > 1) {
    paymentInfoHtml = `
      <div style="font-weight: 600; margin-bottom: 4px;">Płatność podzielona:</div>
      ${invoice.paymentSplits.map(split => `
        <div style="padding-left: 8px;">
          • ${getPaymentMethodLabel(split.paymentMethod)}: <strong>${formatCurrency(split.amount)} zł</strong>
        </div>
      `).join('')}
    `;
  } else {
    paymentInfoHtml = `<div>Forma: <strong>${getPaymentMethodLabel(invoice.paymentMethod)}</strong></div>`;
  }

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Faktura ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @media print {
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
      html, body {
        width: 210mm;
        height: 297mm;
        margin: 0;
        padding: 0;
      }
      .invoice-container {
        width: 194mm !important;
        max-width: 194mm !important;
        padding: 0 !important;
        margin: 0 !important;
        font-size: 10px !important;
      }
      .no-print { display: none !important; }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
    @media screen {
      .invoice-container {
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1f2937; background-color: #f5f5f5;">
  <div class="invoice-container" style="background-color: #ffffff; padding: 8mm; width: 190mm; max-width: 190mm; margin: 0 auto; box-sizing: border-box;">

    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #d1d5db;">
      <div>
        <h1 style="font-size: 22px; font-weight: bold; color: #1f2937; margin: 0;">${invoiceTitle}</h1>
        <div style="font-size: 18px; font-weight: bold; color: #2563eb; margin-top: 4px;">${escapeHtml(invoice.invoiceNumber)}</div>
        ${invoice.orderNumber ? `<div style="font-size: 10px; color: #6b7280; margin-top: 4px;">Zamówienie: ${escapeHtml(invoice.orderNumber)}</div>` : ''}
      </div>
      <div style="text-align: right; font-size: 11px;">
        <div>Data wystawienia: <strong>${formatDate(invoice.issueDate)}</strong></div>
        <div>Data sprzedaży: <strong>${formatDate(invoice.saleDate)}</strong></div>
        ${invoice.paymentDeadline ? `<div>Termin płatności: <strong>${formatDate(invoice.paymentDeadline)}</strong></div>` : ''}
      </div>
    </div>

    <!-- Parties -->
    <div style="display: grid; grid-template-columns: ${hasRecipient ? '1fr 1fr 1fr' : '1fr 1fr'}; gap: 12px; margin-bottom: 20px;">
      <!-- Seller -->
      <div style="padding: 12px; border-radius: 6px; font-size: 11px; background-color: #f9fafb;">
        <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Sprzedawca</div>
        <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">${escapeHtml(sellerInfo.name)}</div>
        <div>${escapeHtml(sellerInfo.address)}</div>
        <div>${escapeHtml(sellerInfo.postalCode)} ${escapeHtml(sellerInfo.city)}</div>
        <div style="margin-top: 6px;">NIP: <strong>${escapeHtml(sellerInfo.nip)}</strong></div>
        ${sellerInfo.phone ? `<div>Tel: ${escapeHtml(sellerInfo.phone)}</div>` : ''}
        ${sellerInfo.email ? `<div>Email: ${escapeHtml(sellerInfo.email)}</div>` : ''}
      </div>

      <!-- Buyer -->
      <div style="padding: 12px; border-radius: 6px; font-size: 11px; background-color: #eff6ff; border: 1px solid #bfdbfe;">
        <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Nabywca</div>
        <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">${escapeHtml(getBuyerName())}</div>
        ${buyer?.street ? `<div>${escapeHtml(buyer.street)}</div>` : ''}
        ${(buyer?.postalCode || buyer?.city) ? `<div>${escapeHtml(buyer?.postalCode || '')} ${escapeHtml(buyer?.city || '')}</div>` : ''}
        ${buyer?.nip ? `<div style="margin-top: 6px;">NIP: <strong>${escapeHtml(buyer.nip)}</strong></div>` : ''}
        ${buyer?.vatEu ? `<div>VAT-EU: <strong>${escapeHtml(buyer.vatEu)}</strong></div>` : ''}
      </div>

      ${hasRecipient ? `
      <!-- Recipient -->
      <div style="padding: 12px; border-radius: 6px; font-size: 11px; background-color: #f0fdf4; border: 1px solid #bbf7d0;">
        <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Odbiorca</div>
        <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">${escapeHtml(getRecipientName())}</div>
        ${recipient?.street ? `<div>${escapeHtml(recipient.street)}</div>` : ''}
        ${(recipient?.postalCode || recipient?.city) ? `<div>${escapeHtml(recipient?.postalCode || '')} ${escapeHtml(recipient?.city || '')}</div>` : ''}
        ${recipient?.phone ? `<div style="margin-top: 6px;">Tel: <strong>${escapeHtml(recipient.phone)}</strong></div>` : ''}
      </div>
      ` : ''}
    </div>

    <!-- Items Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 16px; table-layout: fixed;">
      <colgroup>
        <col style="width: 4%;" />
        <col style="width: 31%;" />
        <col style="width: 6%;" />
        <col style="width: 5%;" />
        <col style="width: 9%;" />
        <col style="width: 9%;" />
        <col style="width: 5%;" />
        <col style="width: 10%;" />
        <col style="width: 10%;" />
        <col style="width: 11%;" />
      </colgroup>
      <thead>
        <tr>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;">Lp.</th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: left;">Nazwa towaru/usługi</th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;">Ilość</th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;">J.m.</th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;"><div>Cena</div><div>netto</div></th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;"><div>Cena</div><div>brutto</div></th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;">VAT%</th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;">Kwota netto</th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;">Kwota VAT</th>
          <th style="border: 1px solid #d1d5db; padding: 6px 4px; background-color: #f3f4f6; font-weight: 600; text-align: center;"><div>Kwota</div><div>brutto</div></th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr style="background-color: #f3f4f6; font-weight: bold;">
          <td colspan="2" style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right;">RAZEM:</td>
          <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: center;">${totalQuantity}</td>
          <td colspan="4" style="border: 1px solid #d1d5db; padding: 5px 4px;"></td>
          <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right;">${formatCurrency(invoice.subtotalNet)} zł</td>
          <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right;">${formatCurrency(invoice.totalVat)} zł</td>
          <td style="border: 1px solid #d1d5db; padding: 5px 4px; text-align: right; color: #2563eb;">${formatCurrency(invoice.totalGross)} zł</td>
        </tr>
      </tfoot>
    </table>

    <!-- VAT Summary + Payment Box -->
    <div style="display: grid; grid-template-columns: 1fr auto; gap: 20px; margin-bottom: 20px; align-items: start;">
      <!-- Left side - VAT Summary + Payment Info -->
      <div>
        <!-- VAT Summary by Rate -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Podsumowanie stawek VAT</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 16px;">
            <thead>
              <tr>
                <th style="border: 1px solid #d1d5db; padding: 5px 8px; background-color: #f3f4f6; font-weight: 600; text-align: center; font-size: 9px; width: 20%;">Stawka VAT</th>
                <th style="border: 1px solid #d1d5db; padding: 5px 8px; background-color: #f3f4f6; font-weight: 600; text-align: center; font-size: 9px; width: 26%;">Netto</th>
                <th style="border: 1px solid #d1d5db; padding: 5px 8px; background-color: #f3f4f6; font-weight: 600; text-align: center; font-size: 9px; width: 26%;">VAT</th>
                <th style="border: 1px solid #d1d5db; padding: 5px 8px; background-color: #f3f4f6; font-weight: 600; text-align: center; font-size: 9px; width: 31%;">Brutto</th>
              </tr>
            </thead>
            <tbody>
              ${vatRowsHtml}
              <tr style="background-color: #f8fafc; font-weight: bold;">
                <td style="border: 1px solid #d1d5db; padding: 4px 8px; text-align: center; font-size: 10px;">RAZEM</td>
                <td style="border: 1px solid #d1d5db; padding: 4px 8px; text-align: right; font-size: 10px;">${formatCurrency(invoice.subtotalNet)} zł</td>
                <td style="border: 1px solid #d1d5db; padding: 4px 8px; text-align: right; font-size: 10px;">${formatCurrency(invoice.totalVat)} zł</td>
                <td style="border: 1px solid #d1d5db; padding: 4px 8px; text-align: right; font-size: 10px; color: #2563eb;">${formatCurrency(invoice.totalGross)} zł</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Payment Info -->
        <div style="font-size: 10px;">
          <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Płatność</div>
          ${paymentInfoHtml}
          <div style="margin-top: 4px;">Status: <strong>${getPaymentStatusLabel(invoice.paymentStatus)}</strong></div>

          ${sellerInfo.bankAccount ? `
          <div style="margin-top: 10px; padding: 10px; background-color: #f9fafb; border-radius: 4px; font-size: 10px;">
            <div style="font-weight: 600;">${escapeHtml(sellerInfo.bankName)}</div>
            <div style="font-family: monospace; margin-top: 4px;">${escapeHtml(sellerInfo.bankAccount)}</div>
          </div>
          ` : ''}

          ${sellerInfo.invoiceComment ? `
          <div style="margin-top: 10px; padding: 10px; background-color: #fefce8; border: 1px solid #fde047; border-radius: 4px; font-size: 10px; color: #854d0e;">
            ${escapeHtml(sellerInfo.invoiceComment)}
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Right side - Payment Summary Box -->
      <div style="background-color: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; min-width: 180px;">
        <div style="font-size: 8px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 2px;">Podsumowanie płatności</div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
          <span>Wartość faktury:</span>
          <strong>${formatCurrency(invoice.totalGross)} zł</strong>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 10px;">
          <span>Zapłacono:</span>
          <strong>${formatCurrency(invoice.paidAmount)} zł</strong>
        </div>

        ${invoice.paidAt && Number(invoice.paidAmount) > 0 ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 9px; color: #64748b;">
          <span>Data zapłaty:</span>
          <span>${formatDate(invoice.paidAt)}</span>
        </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px;">
          <span style="font-weight: 600;">Pozostało do zapłaty:</span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 14px; font-weight: bold; color: #2563eb;">
            ${formatCurrency(remainingToPay)} PLN
          </span>
        </div>

        ${invoice.paymentDeadline && remainingToPay > 0 ? `
        <div style="font-size: 9px; color: #64748b; margin-top: 6px; text-align: right;">
          Termin: ${formatDate(invoice.paymentDeadline)}
        </div>
        ` : ''}
      </div>
    </div>

    <!-- Notes -->
    ${invoice.notes ? `
    <div style="margin-bottom: 20px; padding: 12px; background-color: #f9fafb; border-radius: 6px;">
      <div style="font-size: 9px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 6px;">Uwagi</div>
      <div>${escapeHtml(invoice.notes)}</div>
    </div>
    ` : ''}

    <!-- Signatures -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 40px; padding-top: 20px;">
      <div style="border-top: 1px solid #9ca3af; padding-top: 6px; margin-top: 40px; text-align: center; font-size: 9px; color: #6b7280;">
        Podpis osoby upoważnionej do wystawienia
      </div>
      <div style="border-top: 1px solid #9ca3af; padding-top: 6px; margin-top: 40px; text-align: center; font-size: 9px; color: #6b7280;">
        Podpis osoby upoważnionej do odbioru
      </div>
    </div>

    <!-- Print Button -->
    <div class="no-print" style="margin-top: 24px; text-align: center;">
      <button onclick="window.print()" style="padding: 10px 24px; background-color: #2563eb; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer;">
        Drukuj fakturę
      </button>
    </div>
  </div>
</body>
</html>
  `;
}
