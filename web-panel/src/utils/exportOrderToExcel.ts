import { OrderWithItems, OrderStatus } from '../types';

export async function exportOrderToExcel(order: OrderWithItems): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  
  const statusLabels: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: 'Oczekuje',
      [OrderStatus.IN_PROGRESS]: 'W realizacji',
    [OrderStatus.READY_FOR_PICKUP]: 'Gotowe do odbióru',
    [OrderStatus.COMPLETED]: 'Zakończone',
    [OrderStatus.CANCELLED]: 'Anulowane',
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'INTERFLOR';
  workbook.created = new Date();
  
  const worksheet = workbook.addWorksheet(order.orderNumber.replace(/\//g, '-'), {
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  worksheet.columns = [
    { width: 35 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  const headerStyle = {
    font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2E7D32' } },
    alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
    border: { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } }
  };

  const labelStyle = {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8F5E9' } },
    alignment: { horizontal: 'left' as const, vertical: 'middle' as const },
  };

  const valueStyle = {
    font: { size: 11 },
    alignment: { horizontal: 'left' as const, vertical: 'middle' as const },
  };

  const tableHeaderStyle = {
    font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1565C0' } },
    alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
    border: { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } }
  };

  const tableCellStyle = {
    font: { size: 10 },
    border: { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } },
    alignment: { vertical: 'middle' as const },
  };

  const summaryLabelStyle = {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF3E0' } },
    alignment: { horizontal: 'right' as const, vertical: 'middle' as const },
  };

  const summaryValueStyle = {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF3E0' } },
    alignment: { horizontal: 'left' as const, vertical: 'middle' as const },
  };

  const totalStyle = {
    font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF388E3C' } },
    alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
  };

  let rowNum = 1;

  // Header
  worksheet.mergeCells(`A${rowNum}:I${rowNum}`);
  const titleRow = worksheet.getRow(rowNum);
  titleRow.getCell(1).value = `ZAMÓWIENIE ${order.orderNumber}`;
  titleRow.getCell(1).style = headerStyle;
  titleRow.height = 30;
  rowNum++;

  // Order info
  worksheet.getRow(rowNum).getCell(1).value = 'Data utworzenia:';
  worksheet.getRow(rowNum).getCell(1).style = labelStyle;
  worksheet.getRow(rowNum).getCell(2).value = new Date(order.createdAt).toLocaleDateString('pl-PL');
  worksheet.getRow(rowNum).getCell(2).style = valueStyle;
  worksheet.getRow(rowNum).getCell(4).value = 'Status:';
  worksheet.getRow(rowNum).getCell(4).style = labelStyle;
  worksheet.getRow(rowNum).getCell(5).value = statusLabels[order.status] || order.status;
  worksheet.getRow(rowNum).getCell(5).style = valueStyle;
  rowNum++;

  // Customer
  worksheet.mergeCells(`B${rowNum}:E${rowNum}`);
  worksheet.getRow(rowNum).getCell(1).value = 'Klient:';
  worksheet.getRow(rowNum).getCell(1).style = labelStyle;
  worksheet.getRow(rowNum).getCell(2).value = order.customerName || 'Brak klienta';
  worksheet.getRow(rowNum).getCell(2).style = valueStyle;
  rowNum += 2;

  // Table headers
  const headers = ['Produkt', 'Rozmiar', 'Wysokość', 'Data przyj.', 'Palety', 'Szt/paleta', 'Łącznie szt.', 'Cena jedn.', 'Wartość'];
  const headerRow = worksheet.getRow(rowNum);
  headers.forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
    headerRow.getCell(index + 1).style = tableHeaderStyle;
  });
  headerRow.height = 25;
  rowNum++;

  // Items
  let totalPallets = 0;
  let totalUnits = 0;

  order.items.forEach((item, index) => {
    const snapshot = item.productSnapshot;
    const row = worksheet.getRow(rowNum);
    
    row.getCell(1).value = snapshot?.plantName || 'Nieznany produkt';
    row.getCell(2).value = snapshot?.potSize || '-';
    row.getCell(3).value = snapshot?.plantHeightCm ? `${snapshot.plantHeightCm} cm` : '-';
    row.getCell(4).value = snapshot?.createdAt ? new Date(snapshot.createdAt).toLocaleDateString('pl-PL') : '-';
    row.getCell(5).value = item.palletCount || 1;
    row.getCell(6).value = item.unitsPerPallet || item.quantity;
    row.getCell(7).value = item.quantity;
    row.getCell(8).value = Number(item.unitPriceGross);
    row.getCell(9).value = Number(item.unitPriceGross) * item.quantity;

    const bgColor = index % 2 === 0 ? 'FFFFFFFF' : 'FFF5F5F5';
    for (let i = 1; i <= 9; i++) {
      row.getCell(i).style = {
        ...tableCellStyle,
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: bgColor } },
        alignment: { ...tableCellStyle.alignment, horizontal: i >= 5 ? 'center' as const : 'left' as const }
      };
    }

    totalPallets += item.palletCount || 1;
    totalUnits += item.quantity;
    rowNum++;
  });

  rowNum++;

  // Summary
  worksheet.getRow(rowNum).getCell(6).value = 'Łącznie palet:';
  worksheet.getRow(rowNum).getCell(6).style = summaryLabelStyle;
  worksheet.getRow(rowNum).getCell(7).value = totalPallets;
  worksheet.getRow(rowNum).getCell(7).style = summaryValueStyle;
  rowNum++;

  worksheet.getRow(rowNum).getCell(6).value = 'Łącznie sztuk:';
  worksheet.getRow(rowNum).getCell(6).style = summaryLabelStyle;
  worksheet.getRow(rowNum).getCell(7).value = totalUnits;
  worksheet.getRow(rowNum).getCell(7).style = summaryValueStyle;
  rowNum++;

  worksheet.mergeCells(`F${rowNum}:G${rowNum}`);
  worksheet.getRow(rowNum).getCell(6).value = `SUMA: ${Number(order.totalAmount).toFixed(2)} PLN`;
  worksheet.getRow(rowNum).getCell(6).style = totalStyle;
  worksheet.getRow(rowNum).height = 25;

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `zamówienie_${order.orderNumber.replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  link.click();
}
