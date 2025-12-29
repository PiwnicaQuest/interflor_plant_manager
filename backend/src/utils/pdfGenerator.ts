import PDFDocument from 'pdfkit';
import { InvoiceWithItems, CustomerSnapshot, PaymentMethod } from '../types';
import { SettingsModel } from '../models/Settings';

// Font paths for Polish character support
const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

/**
 * Generate a Polish invoice PDF compliant with tax regulations
 */
export async function generateInvoicePDF(invoice: InvoiceWithItems): Promise<PDFKit.PDFDocument> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });

  // Register fonts with Polish character support
  doc.registerFont('Regular', FONT_REGULAR);
  doc.registerFont('Bold', FONT_BOLD);

  // Fetch company information from settings
  const companySettings = await SettingsModel.getCompanySettings();

  // Map company settings to seller format
  const seller = {
    name: companySettings.companyName || 'Nazwa firmy nie skonfigurowana',
    nip: companySettings.nip || 'NIP nie skonfigurowany',
    address: companySettings.street || '',
    postalCode: companySettings.postalCode || '',
    city: companySettings.city || '',
    phone: companySettings.phone || '',
    email: companySettings.email || '',
    bankName: companySettings.bankName || '',
    bankAccount: companySettings.bankAccount || '',
  };

  // Helper functions
  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('pl-PL');
  };

  const toNumber = (val: number | string | null | undefined): number => {
    return parseFloat(String(val || 0)) || 0;
  };

  const formatCurrency = (amount: number | string | null | undefined): string => {
    const num = toNumber(amount);
    return num.toFixed(2) + ' PLN';
  };

  const formatPaymentMethod = (method?: string): string => {
    const methods: Record<string, string> = {
      cash: 'Gotówka',
      card: 'Karta płatnicza',
      transfer: 'Przelew bankowy',
    };
    return method ? methods[method] || method : 'Nie określono';
  };

  // Calculate totals from items for consistency
  let calculatedSubtotalNet = 0;
  let calculatedTotalVat = 0;
  let calculatedTotalGross = 0;

  if (invoice.items && invoice.items.length > 0) {
    for (const item of invoice.items) {
      calculatedSubtotalNet += toNumber(item.totalNet);
      calculatedTotalVat += toNumber(item.totalVat);
      calculatedTotalGross += toNumber(item.totalGross);
    }
  }

  // Round to 2 decimal places
  calculatedSubtotalNet = Math.round(calculatedSubtotalNet * 100) / 100;
  calculatedTotalVat = Math.round(calculatedTotalVat * 100) / 100;
  calculatedTotalGross = Math.round(calculatedTotalGross * 100) / 100;

  let yPosition = 50;

  // Header - Invoice Title
  doc.fontSize(20)
    .font('Bold')
    .text('FAKTURA VAT', 50, yPosition, { align: 'center' });

  yPosition += 40;

  // Invoice metadata
  doc.fontSize(10).font('Regular');
  doc.text(`Nr faktury: ${invoice.invoiceNumber}`, 50, yPosition);
  yPosition += 15;
  doc.text(`Data wystawienia: ${formatDate(invoice.issueDate)}`, 50, yPosition);
  yPosition += 15;
  doc.text(`Data sprzedaży: ${formatDate(invoice.saleDate)}`, 50, yPosition);

  yPosition += 30;

  // Two columns: Seller and Buyer
  const leftColumnX = 50;
  const rightColumnX = 300;
  let leftY = yPosition;
  let rightY = yPosition;

  // SELLER (left column)
  doc.fontSize(11).font('Bold');
  doc.text('SPRZEDAWCA:', leftColumnX, leftY);
  leftY += 20;

  doc.fontSize(10).font('Regular');
  doc.text(seller.name, leftColumnX, leftY);
  leftY += 15;
  doc.text(`NIP: ${seller.nip}`, leftColumnX, leftY);
  leftY += 15;
  if (seller.address) {
    doc.text(seller.address, leftColumnX, leftY);
    leftY += 15;
  }
  if (seller.postalCode || seller.city) {
    doc.text(`${seller.postalCode} ${seller.city}`.trim(), leftColumnX, leftY);
    leftY += 15;
  }
  if (seller.phone) {
    doc.text(`Tel: ${seller.phone}`, leftColumnX, leftY);
    leftY += 15;
  }
  if (seller.email) {
    doc.text(`Email: ${seller.email}`, leftColumnX, leftY);
    leftY += 15;
  }

  // BUYER (right column)
  const buyer: CustomerSnapshot = invoice.buyerSnapshot;
  doc.fontSize(11).font('Bold');
  doc.text('NABYWCA:', rightColumnX, rightY);
  rightY += 20;

  doc.fontSize(10).font('Regular');
  if (buyer && buyer.companyName) {
    doc.text(buyer.companyName, rightColumnX, rightY);
    rightY += 15;
  } else if (buyer && (buyer.firstName || buyer.lastName)) {
    doc.text(`${buyer.firstName || ''} ${buyer.lastName || ''}`.trim(), rightColumnX, rightY);
    rightY += 15;
  } else {
    doc.text('Brak danych nabywcy', rightColumnX, rightY);
    rightY += 15;
  }

  if (buyer && buyer.nip) {
    doc.text(`NIP: ${buyer.nip}`, rightColumnX, rightY);
    rightY += 15;
  }

  if (buyer && buyer.street) {
    doc.text(buyer.street, rightColumnX, rightY);
    rightY += 15;
  }
  if (buyer && (buyer.postalCode || buyer.city)) {
    doc.text(`${buyer.postalCode || ''} ${buyer.city || ''}`.trim(), rightColumnX, rightY);
    rightY += 15;
  }
  if (buyer && buyer.phone) {
    doc.text(`Tel: ${buyer.phone}`, rightColumnX, rightY);
    rightY += 15;
  }
  if (buyer && buyer.email) {
    doc.text(`Email: ${buyer.email}`, rightColumnX, rightY);
    rightY += 15;
  }

  yPosition = Math.max(leftY, rightY) + 30;

  // Items table
  const tableTop = yPosition;
  const tableHeaders = ['Lp.', 'Nazwa towaru/usługi', 'Ilość', 'J.m.', 'Cena netto', 'VAT %', 'Wartość netto', 'Wartość VAT', 'Wartość brutto'];
  const colWidths = [25, 140, 35, 30, 55, 40, 65, 60, 70];
  const colPositions = [50];

  for (let i = 0; i < colWidths.length - 1; i++) {
    colPositions.push(colPositions[i] + colWidths[i]);
  }

  // Table header
  doc.fontSize(7).font('Bold');
  tableHeaders.forEach((header, i) => {
    doc.text(header, colPositions[i], tableTop, { width: colWidths[i], align: 'center' });
  });

  yPosition = tableTop + 15;
  doc.moveTo(50, yPosition).lineTo(545, yPosition).stroke();
  yPosition += 5;

  // Table rows
  doc.fontSize(8).font('Regular');
  
  if (invoice.items && invoice.items.length > 0) {
    invoice.items.forEach((item, index) => {
      const vatRate = toNumber(item.vatRate);
      const rowData = [
        (index + 1).toString(),
        item.description || 'Brak opisu',
        String(item.quantity || 0),
        'szt.',
        formatCurrency(item.unitPriceNet),
        vatRate.toFixed(0) + '%',
        formatCurrency(item.totalNet),
        formatCurrency(item.totalVat),
        formatCurrency(item.totalGross),
      ];

      // Check if we need a new page
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }

      rowData.forEach((text, i) => {
        const align = i === 1 ? 'left' : 'center';
        doc.text(text, colPositions[i], yPosition, { width: colWidths[i], align });
      });

      yPosition += 20;
    });
  } else {
    // No items
    doc.text('Brak pozycji na fakturze', 50, yPosition);
    yPosition += 20;
  }

  // Bottom line of table
  doc.moveTo(50, yPosition).lineTo(545, yPosition).stroke();
  yPosition += 20;

  // Summary box - use calculated totals from items for consistency
  const summaryX = 350;
  doc.fontSize(10).font('Bold');

  doc.text('RAZEM NETTO:', summaryX, yPosition);
  doc.text(formatCurrency(calculatedSubtotalNet), summaryX + 100, yPosition, { width: 80, align: 'right' });
  yPosition += 15;

  doc.text('RAZEM VAT:', summaryX, yPosition);
  doc.text(formatCurrency(calculatedTotalVat), summaryX + 100, yPosition, { width: 80, align: 'right' });
  yPosition += 15;

  doc.fontSize(12).font('Bold');
  doc.text('RAZEM BRUTTO:', summaryX, yPosition);
  doc.text(formatCurrency(calculatedTotalGross), summaryX + 100, yPosition, { width: 80, align: 'right' });
  yPosition += 30;

  // Payment information
  doc.fontSize(10).font('Regular');
  doc.text(`Sposób płatności: ${formatPaymentMethod(invoice.paymentMethod)}`, 50, yPosition);
  yPosition += 15;

  // Payment deadline and bank info - only for transfer payments
  if (invoice.paymentMethod === PaymentMethod.TRANSFER) {
    if (invoice.paymentDeadline) {
      doc.text(`Termin płatności: ${formatDate(invoice.paymentDeadline)}`, 50, yPosition);
      yPosition += 15;
    }
    if (seller.bankName || seller.bankAccount) {
      yPosition += 10;
      doc.font('Bold');
      doc.text('Dane do przelewu:', 50, yPosition);
      yPosition += 15;
      doc.font('Regular');
      if (seller.bankName) {
        doc.text(`Bank: ${seller.bankName}`, 50, yPosition);
        yPosition += 15;
      }
      if (seller.bankAccount) {
        doc.text(`Numer konta: ${seller.bankAccount}`, 50, yPosition);
        yPosition += 15;
      }
    }
  }

  // Company-wide invoice comment (from settings)
  if (companySettings.invoiceComment) {
    yPosition += 15;
    doc.fontSize(10).font('Bold');
    doc.text('Uwagi sprzedawcy:', 50, yPosition);
    yPosition += 15;
    doc.fontSize(9).font('Regular');
    doc.text(companySettings.invoiceComment, 50, yPosition, { width: 500 });
    yPosition += 25;
  }

  // Per-invoice notes
  if (invoice.notes) {
    yPosition += 10;
    doc.fontSize(10).font('Bold');
    doc.text('Uwagi do zamówienia:', 50, yPosition);
    yPosition += 15;
    doc.fontSize(9).font('Regular').text(invoice.notes, 50, yPosition, { width: 500 });
  }

  // Footer - signatures
  yPosition = 720;
  doc.fontSize(9).font('Regular');
  doc.text('........................................', 80, yPosition);
  doc.text('........................................', 350, yPosition);
  yPosition += 15;
  doc.fontSize(8);
  doc.text('Podpis wystawiającego', 80, yPosition);
  doc.text('Podpis odbiorcy', 350, yPosition);

  // Finalize PDF
  doc.end();

  return doc;
}
