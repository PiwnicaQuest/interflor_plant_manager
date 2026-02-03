import PDFDocument from 'pdfkit';
import { DailyReportData } from '../types';

// Font paths for Polish character support
const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

/**
 * Generate a daily POS report PDF
 */
export function generateDailyReportPDF(data: DailyReportData): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
  });

  // Register fonts with Polish character support
  doc.registerFont('Regular', FONT_REGULAR);
  doc.registerFont('Bold', FONT_BOLD);

  const pageWidth = 515; // A4 width minus margins
  let y = 40;

  // Helper functions
  const formatCurrency = (amount: number): string => {
    return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' PLN';
  };

  const drawLine = (yPos: number, color: string = '#cccccc') => {
    doc.strokeColor(color).lineWidth(0.5)
       .moveTo(40, yPos).lineTo(555, yPos).stroke();
  };

  const getDocTypeFullLabel = (type: string): string => {
    const labels: Record<string, string> = {
      invoice: 'Faktury VAT (FV)',
      receipt: 'Paragony (PA)',
      proforma: 'Pro Formy (PF)',
    };
    return labels[type] || type;
  };

  const getPaymentLabel = (method: string): string => {
    const labels: Record<string, string> = {
      cash: 'Gotówka',
      card: 'Karta płatnicza',
      transfer: 'Przelew',
      split: 'Mieszana',
    };
    return labels[method] || method;
  };

  const getDocTypeShort = (type: string): string => {
    const labels: Record<string, string> = {
      invoice: 'FV',
      receipt: 'PA',
      proforma: 'PF',
    };
    return labels[type] || type;
  };

  // ============================================
  // HEADER
  // ============================================
  doc.rect(40, y, pageWidth, 70).fill('#1f2937');

  doc.fontSize(18).font('Bold').fillColor('#ffffff')
     .text('RAPORT DOBOWY KASY', 50, y + 15, { align: 'center', width: pageWidth - 20 });

  doc.fontSize(10).font('Regular').fillColor('#9ca3af')
     .text(data.companyName, 50, y + 40, { align: 'center', width: pageWidth - 20 });

  y += 85;

  // Report metadata
  doc.fontSize(9).font('Regular').fillColor('#374151');
  doc.text(`Data raportu: ${data.reportDate}`, 40, y);
  doc.text(`Wygenerowano: ${data.generatedAt}`, 300, y);
  y += 15;
  doc.text(`Operator: ${data.operatorName}`, 40, y);
  doc.text(`Liczba transakcji: ${data.totals.transactionCount}`, 300, y);

  y += 25;
  drawLine(y, '#e5e7eb');
  y += 20;

  // ============================================
  // TRANSACTION LIST (first section)
  // ============================================
  if (data.transactions && data.transactions.length > 0) {
    doc.fontSize(11).font('Bold').fillColor('#1f2937')
       .text('ZESTAWIENIE TRANSAKCJI', 40, y);
    y += 20;

    // Transaction table header
    const drawTransactionHeader = () => {
      doc.rect(40, y, pageWidth, 18).fill('#f3f4f6');
      doc.fontSize(8).font('Bold').fillColor('#374151');
      doc.text('Godz.', 45, y + 5, { width: 40 });
      doc.text('Nr dokumentu', 88, y + 5, { width: 100 });
      doc.text('Typ', 190, y + 5, { width: 35 });
      doc.text('Klient', 228, y + 5, { width: 145 });
      doc.text('Metoda', 376, y + 5, { width: 70 });
      doc.text('Kwota', 448, y + 5, { width: 97, align: 'right' });
      y += 18;
    };

    drawTransactionHeader();

    // Transaction rows
    doc.font('Regular').fontSize(8);
    for (let i = 0; i < data.transactions.length; i++) {
      const tx = data.transactions[i];

      // Calculate row height based on customer name length
      doc.font('Regular').fontSize(8);
      const customerName = tx.customerName || '-';
      const nameHeight = doc.heightOfString(customerName, { width: 145 });
      const rowHeight = Math.max(16, nameHeight + 8);

      // Check page break - leave room for this row
      if (y > 800 - rowHeight) {
        doc.addPage();
        y = 40;
        drawTransactionHeader();
        doc.font('Regular').fontSize(8);
      }

      const isEven = i % 2 === 0;

      if (isEven) {
        doc.rect(40, y, pageWidth, rowHeight).fill('#fafafa');
      }

      const isProforma = tx.documentType === 'proforma';
      doc.fillColor(isProforma ? '#9ca3af' : '#374151');

      doc.text(tx.time, 45, y + 4, { width: 40 });
      doc.text(tx.documentNumber, 88, y + 4, { width: 100 });
      doc.text(getDocTypeShort(tx.documentType), 190, y + 4, { width: 35 });
      doc.text(customerName, 228, y + 4, { width: 145 });

      // Display split payment details or single method
      if (tx.paymentMethod === 'split' && tx.paymentSplits && tx.paymentSplits.length > 0) {
        const splitText = tx.paymentSplits
          .map(s => `${getPaymentLabel(s.method)} ${s.amount.toFixed(0)}`)
          .join(' / ');
        doc.fontSize(7).text(splitText, 376, y + 4, { width: 70 });
        doc.fontSize(8);
      } else {
        doc.text(getPaymentLabel(tx.paymentMethod), 376, y + 4, { width: 70 });
      }
      doc.text(formatCurrency(tx.amount), 448, y + 4, { width: 97, align: 'right' });
      y += rowHeight;
    }

    // Transaction count summary
    y += 5;
    drawLine(y, '#e5e7eb');
    y += 8;
    doc.fontSize(8).font('Regular').fillColor('#6b7280')
       .text(`Razem transakcji: ${data.transactions.length}`, 45, y);
    y += 25;
  }

  // ============================================
  // PAYMENT METHOD SUMMARY
  // ============================================
  // Check for new page
  if (y > 620) {
    doc.addPage();
    y = 40;
  }

  doc.fontSize(11).font('Bold').fillColor('#1f2937')
     .text('PODSUMOWANIE WG METODY PŁATNOŚCI', 40, y);
  y += 20;

  // Payment summary table header
  doc.rect(40, y, pageWidth, 18).fill('#ecfdf5');
  doc.fontSize(9).font('Bold').fillColor('#065f46');
  doc.text('Metoda płatności', 50, y + 5, { width: 200 });
  doc.text('Liczba transakcji', 260, y + 5, { width: 120, align: 'center' });
  doc.text('Suma', 400, y + 5, { width: 145, align: 'right' });
  y += 18;

  // Payment rows (excluding proforma from totals)
  doc.font('Regular').fontSize(9).fillColor('#374151');
  for (const ps of data.paymentSummary) {
    doc.text(getPaymentLabel(ps.method), 50, y + 4, { width: 200 });
    doc.text(ps.transactionCount.toString(), 260, y + 4, { width: 120, align: 'center' });
    doc.text(formatCurrency(ps.total), 400, y + 4, { width: 145, align: 'right' });
    y += 18;
  }

  // Payment totals row
  doc.rect(40, y, pageWidth, 20).fill('#d1fae5');
  doc.font('Bold').fillColor('#065f46');
  doc.text('RAZEM (bez Pro Form)', 50, y + 6, { width: 200 });

  const totalTxWithoutProforma = data.paymentSummary.reduce((sum, p) => sum + p.transactionCount, 0);
  const totalAmountWithoutProforma = data.paymentSummary.reduce((sum, p) => sum + p.total, 0);

  doc.text(totalTxWithoutProforma.toString(), 260, y + 6, { width: 120, align: 'center' });
  doc.text(formatCurrency(totalAmountWithoutProforma), 400, y + 6, { width: 145, align: 'right' });
  y += 35;

  // ============================================
  // DOCUMENT TYPE SUMMARY
  // ============================================
  doc.fontSize(11).font('Bold').fillColor('#1f2937')
     .text('PODSUMOWANIE WG TYPU DOKUMENTU', 40, y);
  y += 20;

  // Document summary table header
  doc.rect(40, y, pageWidth, 18).fill('#eff6ff');
  doc.fontSize(9).font('Bold').fillColor('#1e40af');
  doc.text('Typ dokumentu', 50, y + 5, { width: 200 });
  doc.text('Liczba', 260, y + 5, { width: 120, align: 'center' });
  doc.text('Suma', 400, y + 5, { width: 145, align: 'right' });
  y += 18;

  // Document rows
  doc.font('Regular').fontSize(9).fillColor('#374151');
  for (const ds of data.documentSummary) {
    const isProforma = ds.type === 'proforma';
    if (isProforma) {
      doc.fillColor('#9ca3af'); // Gray out proforma
    }
    doc.text(getDocTypeFullLabel(ds.type) + (isProforma ? ' *' : ''), 50, y + 4, { width: 200 });
    doc.text(ds.count.toString(), 260, y + 4, { width: 120, align: 'center' });
    doc.text(formatCurrency(ds.total), 400, y + 4, { width: 145, align: 'right' });
    doc.fillColor('#374151');
    y += 18;
  }

  // Note about proforma
  const hasProforma = data.documentSummary.some(d => d.type === 'proforma');
  if (hasProforma) {
    doc.fontSize(7).font('Regular').fillColor('#9ca3af')
       .text('* Pro Formy nie są uwzględniane w podsumowaniach finansowych', 50, y);
    y += 15;
  }

  y += 20;

  // Check for new page before VAT summary
  if (y > 620) {
    doc.addPage();
    y = 40;
  }

  // ============================================
  // VAT SUMMARY
  // ============================================
  doc.fontSize(11).font('Bold').fillColor('#1f2937')
     .text('ZESTAWIENIE VAT (bez Pro Form)', 40, y);
  y += 20;

  // VAT summary table header
  doc.rect(40, y, pageWidth, 18).fill('#fef3c7');
  doc.fontSize(9).font('Bold').fillColor('#92400e');
  doc.text('Stawka VAT', 50, y + 5, { width: 100 });
  doc.text('Netto', 160, y + 5, { width: 120, align: 'right' });
  doc.text('VAT', 290, y + 5, { width: 100, align: 'right' });
  doc.text('Brutto', 400, y + 5, { width: 145, align: 'right' });
  y += 18;

  // VAT rows
  doc.font('Regular').fontSize(9).fillColor('#374151');
  for (const vs of data.vatSummary) {
    doc.text(vs.vatRate + '%', 50, y + 4, { width: 100 });
    doc.text(formatCurrency(vs.netTotal), 160, y + 4, { width: 120, align: 'right' });
    doc.text(formatCurrency(vs.vatTotal), 290, y + 4, { width: 100, align: 'right' });
    doc.text(formatCurrency(vs.grossTotal), 400, y + 4, { width: 145, align: 'right' });
    y += 18;
  }

  // VAT totals row
  doc.rect(40, y, pageWidth, 20).fill('#fde68a');
  doc.font('Bold').fillColor('#92400e');
  doc.text('SUMA', 50, y + 6, { width: 100 });
  doc.text(formatCurrency(data.totals.netTotal), 160, y + 6, { width: 120, align: 'right' });
  doc.text(formatCurrency(data.totals.vatTotal), 290, y + 6, { width: 100, align: 'right' });
  doc.text(formatCurrency(data.totals.grossTotal), 400, y + 6, { width: 145, align: 'right' });
  y += 40;

  // ============================================
  // GRAND TOTAL BOX
  // ============================================
  doc.rect(40, y, pageWidth, 45).fill('#1f2937');
  doc.fontSize(12).font('Bold').fillColor('#9ca3af')
     .text('SUMA DZIENNA (bez Pro Form)', 50, y + 8);
  doc.fontSize(20).font('Bold').fillColor('#ffffff')
     .text(formatCurrency(totalAmountWithoutProforma), 50, y + 22, { width: pageWidth - 20, align: 'right' });
  y += 55;

  // ============================================
  // GRAND TOTAL BOX (without Proforma and Transfer)
  // ============================================
  const totalWithoutProformaAndTransfer = data.paymentSummary
    .filter(p => p.method !== 'transfer')
    .reduce((sum, p) => sum + p.total, 0);

  doc.rect(40, y, pageWidth, 45).fill('#374151');
  doc.fontSize(12).font('Bold').fillColor('#9ca3af')
     .text('SUMA DZIENNA (bez Pro Form i Przelewów)', 50, y + 8);
  doc.fontSize(20).font('Bold').fillColor('#ffffff')
     .text(formatCurrency(totalWithoutProformaAndTransfer), 50, y + 22, { width: pageWidth - 20, align: 'right' });
  y += 60;

  // ============================================
  // SIGNATURE SECTION
  // ============================================
  // Check if we need a new page for signature
  if (y > 700) {
    doc.addPage();
    y = 40;
  }

  y += 20;

  doc.fontSize(8).font('Regular').fillColor('#6b7280')
     .text('Uwagi: ________________________________________________________________', 40, y);
  y += 40;

  doc.text('_________________________', 40, y);
  doc.text('_________________________', 350, y);
  y += 12;
  doc.fontSize(7)
     .text('Podpis operatora', 40, y);
  doc.text('Data i pieczęć', 350, y);
  y += 25;

  // Footer
  doc.fontSize(7).fillColor('#9ca3af')
     .text(`Wygenerowano automatycznie: ${data.generatedAt}`, 40, y, { align: 'center', width: pageWidth });

  doc.end();
  return doc;
}
