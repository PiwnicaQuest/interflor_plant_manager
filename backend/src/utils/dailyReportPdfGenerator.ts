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

  const getDocTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      invoice: 'FV',
      receipt: 'PA',
      proforma: 'PF',
    };
    return labels[type] || type;
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
  y += 15;

  // ============================================
  // TRANSACTIONS TABLE
  // ============================================
  doc.fontSize(11).font('Bold').fillColor('#1f2937')
     .text('ZESTAWIENIE TRANSAKCJI', 40, y);
  y += 20;

  // Table header
  doc.rect(40, y, pageWidth, 18).fill('#f3f4f6');
  doc.fontSize(8).font('Bold').fillColor('#374151');
  doc.text('Lp.', 45, y + 5, { width: 25 });
  doc.text('Godz.', 70, y + 5, { width: 40 });
  doc.text('Nr dokumentu', 115, y + 5, { width: 120 });
  doc.text('Klient', 240, y + 5, { width: 130 });
  doc.text('Typ', 375, y + 5, { width: 30 });
  doc.text('Płatność', 410, y + 5, { width: 55 });
  doc.text('Kwota', 470, y + 5, { width: 80, align: 'right' });
  y += 18;

  // Table rows
  doc.font('Regular').fontSize(8).fillColor('#374151');
  let rowIndex = 0;
  
  for (const tx of data.transactions) {
    // Check if we need a new page
    if (y > 700) {
      doc.addPage();
      y = 40;
    }

    rowIndex++;
    const bgColor = rowIndex % 2 === 0 ? '#f9fafb' : '#ffffff';
    doc.rect(40, y, pageWidth, 16).fill(bgColor);
    
    doc.fillColor('#374151');
    doc.text(rowIndex.toString(), 45, y + 4, { width: 25 });
    doc.text(tx.time, 70, y + 4, { width: 40 });
    doc.text(tx.documentNumber, 115, y + 4, { width: 120 });
    doc.text(tx.customerName.substring(0, 25), 240, y + 4, { width: 130 });
    doc.text(getDocTypeLabel(tx.documentType), 375, y + 4, { width: 30 });
    doc.text(getPaymentLabel(tx.paymentMethod).substring(0, 10), 410, y + 4, { width: 55 });
    doc.text(formatCurrency(tx.amount), 470, y + 4, { width: 80, align: 'right' });
    y += 16;
  }

  if (data.transactions.length === 0) {
    doc.text('Brak transakcji w wybranym dniu', 40, y + 10);
    y += 30;
  }

  y += 20;

  // Check for new page before summaries
  if (y > 550) {
    doc.addPage();
    y = 40;
  }

  drawLine(y, '#e5e7eb');
  y += 20;

  // ============================================
  // PAYMENT METHOD SUMMARY
  // ============================================
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
  y += 60;

  // ============================================
  // SIGNATURE SECTION
  // ============================================
  if (y < 700) {
    y = Math.max(y, 720);
  } else {
    doc.addPage();
    y = 680;
  }

  doc.fontSize(8).font('Regular').fillColor('#6b7280')
     .text('Uwagi: ________________________________________________________________', 40, y);
  y += 40;

  doc.text('_________________________', 40, y);
  doc.text('_________________________', 350, y);
  y += 12;
  doc.fontSize(7)
     .text('Podpis operatora', 40, y);
  doc.text('Data i pieczęć', 350, y);

  // Footer
  doc.fontSize(7).fillColor('#9ca3af')
     .text(`Wygenerowano automatycznie: ${data.generatedAt}`, 40, 800, { align: 'center', width: pageWidth });

  doc.end();
  return doc;
}
