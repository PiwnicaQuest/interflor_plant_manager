import * as XLSX from 'xlsx';
import { useState, useEffect } from 'react';
import { OrderWithItems, OrderStatus, OrderStatusHistoryItem, PaymentMethod, DocumentType } from '../../types';
import { api } from '../../services/api';
import { CancelOrderModal } from './CancelOrderModal';
import { ProductDetailsModal } from './ProductDetailsModal';
import { OrderItem } from '../../types';
import { TransferProductsModal } from './TransferProductsModal';
import { MergeOrdersModal } from './MergeOrdersModal';
import { ReopenOrderModal } from './ReopenOrderModal';

interface OrderDetailsProps {
  order: OrderWithItems;
  onClose: () => void;
  onOrderUpdated?: () => void;
  onEdit?: () => void;
}

const statusConfig: Record<OrderStatus, { label: string; class: string }> = {
  [OrderStatus.PENDING]: { label: 'Oczekuje', class: 'badge-info' },
  [OrderStatus.IN_PROGRESS]: { label: 'W realizacji', class: 'badge-warning' },
  [OrderStatus.READY_FOR_PICKUP]: { label: 'Gotowe do odbióru', class: 'badge-success' },
  [OrderStatus.COMPLETED]: { label: 'Zakończone', class: 'badge-success' },
  [OrderStatus.CANCELLED]: { label: 'Anulowane', class: 'badge-danger' },
};

export function OrderDetails({ order, onClose, onOrderUpdated, onEdit }: OrderDetailsProps) {
  const [statusHistory, setStatusHistory] = useState<OrderStatusHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [isCreatingProforma, setIsCreatingProforma] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<OrderItem | null>(null);

  // Document generation state
  const [documentType, setDocumentType] = useState<'invoice' | 'receipt'>('receipt');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentDeadline, setPaymentDeadline] = useState('');

  useEffect(() => {
    loadStatusHistory();
    // Set default payment deadline to 14 days from now
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    setPaymentDeadline(deadline.toISOString().split('T')[0]);
  }, [order.id]);

  const loadStatusHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await api.getOrderStatusHistory(order.id);
      setStatusHistory(response.history);
    } catch (error) {
      console.error('Błąd podczas pobierania historii statusów:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCancelOrder = async (reason: string) => {
    try {
      setIsCancelling(true);
      setError(null);

      await api.cancelOrder(order.id, reason);

      setSuccessMessage('Zamówienie zostało anulowane. Stany magazynowe zostały przywrócone.');
      setShowCancelModal(false);

      await loadStatusHistory();

      if (onOrderUpdated) {
        onOrderUpdated();
      }

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Błąd podczas anulowania zamówienia:', err);

      if (err.response?.status === 400) {
        setError(err.response.data?.error || 'Nie można anulować tego zamówienia');
      } else if (err.response?.status === 404) {
        setError('Zamówienie nie zostało znalezione');
      } else {
        setError('Wystąpił błąd podczas anulowania zamówienia');
      }

      setShowCancelModal(false);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteOrder = async () => {
    try {
      setIsDeleting(true);
      setError(null);

      await api.deleteOrder(order.id);

      setSuccessMessage('Zamówienie zostało trwale usunięte.');
      setShowDeleteModal(false);

      if (onOrderUpdated) {
        onOrderUpdated();
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Błąd podczas usuwania zamówienia:', err);

      if (err.response?.status === 400) {
        setError(err.response.data?.error || 'Nie można usunąć tego zamówienia');
      } else if (err.response?.status === 404) {
        setError('Zamówienie nie zostało znalezione');
      } else {
        setError('Wystąpił błąd podczas usuwania zamówienia');
      }

      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateDocument = async () => {
    try {
      setIsCreatingDocument(true);
      setError(null);

      const result = await api.checkout({
        orderId: order.id,
        paymentMethod,
        documentType: documentType === 'invoice' ? 'invoice' : 'receipt',
      });

      setSuccessMessage(
        documentType === 'invoice'
          ? `Faktura ${result.documentNumber} została utworzona`
          : `Paragon ${result.documentNumber} został utworzony`
      );
      setShowDocumentModal(false);

      if (onOrderUpdated) {
        onOrderUpdated();
      }

      // Open print page in new tab
      if (documentType === 'invoice') {
        window.open(`/print/invoice/${result.documentId}`, '_blank');
      } else {
        window.open(`/print/receipt/${result.documentId}`, '_blank');
      }

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Błąd podczas tworzenia dokumentu:', err);
      setError(err.response?.data?.error || 'Wystąpił błąd podczas tworzenia dokumentu');
      setShowDocumentModal(false);
    } finally {
      setIsCreatingDocument(false);
    }
  };

  const canCancelOrder = () => {
    return order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED;
  };

  const canEditOrder = () => {
    return order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED;
  };

  const canTransferProducts = () => {
    return order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED && order.items && order.items.length > 0;
  };

  const canMergeOrders = () => {
    // Can merge if order is not completed/cancelled and has a customer
    return order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED && order.customerId;
  };

  const canCreateDocument = () => {
    return order.status === OrderStatus.READY_FOR_PICKUP || order.status === OrderStatus.PENDING;
  };

  const canReopenOrder = () => {
    // Tylko dla zakończonych lub anulowanych zamówień
    return order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED;
  };

  const canCreateProforma = () => {
    // Only for pending orders with a customer
    return order.status === OrderStatus.PENDING && order.customerId;
  };



  const handleReopenOrder = async (newStatus: OrderStatus, reason: string) => {
    try {
      setIsReopening(true);
      setError(null);

      await api.updateOrderStatus(order.id, newStatus, `[OTWARCIE PONOWNE] ${reason}`);

      setSuccessMessage(`Zamówienie zostało ponownie otwarte ze statusem "${statusConfig[newStatus].label}"`);
      setShowReopenModal(false);

      await loadStatusHistory();

      if (onOrderUpdated) {
        onOrderUpdated();
      }

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Błąd podczas otwierania zamówienia:', err);

      if (err.response?.status === 400) {
        setError(err.response.data?.error || 'Nie można otworzyć tego zamówienia');
      } else if (err.response?.status === 404) {
        setError('Zamówienie nie zostało znalezione');
      } else {
        setError('Wystąpił błąd podczas otwierania zamówienia');
      }

      setShowReopenModal(false);
    } finally {
      setIsReopening(false);
    }
  };

  const handleCreateProforma = async () => {
    try {
      setIsCreatingProforma(true);
      setError(null);

      // Set validUntil to 14 days from now
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 14);

      const result = await api.createProformaFromOrder(order.id, {
        validUntil: validUntil.toISOString().split('T')[0],
      });

      setSuccessMessage(`Proforma ${result.proforma.invoiceNumber} została utworzona`);

      if (onOrderUpdated) {
        onOrderUpdated();
      }

      // Open proforma print page in new tab
      window.open(`/print/proforma/${result.proforma.id}`, '_blank');
    } catch (err: any) {
      console.error('Błąd podczas tworzenia proformy:', err);
      setError(err.response?.data?.error || 'Wystąpił błąd podczas tworzenia proformy');
    } finally {
      setIsCreatingProforma(false);
    }
  };

  const handleTransferSuccess = () => {
    setSuccessMessage('Produkty zostały pomyślnie przeniesione!');
    setShowTransferModal(false);

    if (onOrderUpdated) {
      onOrderUpdated();
    }

    setTimeout(() => {
      onClose();
    }, 2000);
  };

  const handleMergeSuccess = () => {
    setSuccessMessage('Zamówienia zostały pomyślnie połączone!');
    setShowMergeModal(false);

    if (onOrderUpdated) {
      onOrderUpdated();
    }

    setTimeout(() => {
      onClose();
    }, 2000);
  };

  // Export to Excel with styling
  const handleExportExcel = async () => {
    const ExcelJS = (await import('exceljs')).default;
    
    const statusLabels: Record<OrderStatus, string> = {
      [OrderStatus.PENDING]: 'Oczekuje',
      [OrderStatus.IN_PROGRESS]: "W realizacji",
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

    // Set column widths
    worksheet.columns = [
      { width: 35 }, // A - Produkt/Etykieta
      { width: 12 }, // B - Rozmiar
      { width: 10 }, // C - Wysokość
      { width: 14 }, // D - Data przyjęcia
      { width: 10 }, // E - Palety
      { width: 12 }, // F - Szt/paleta
      { width: 14 }, // G - Łącznie szt.
      { width: 14 }, // H - Cena jedn.
      { width: 14 }, // I - Wartość
    ];

    // Style definitions
    const headerStyle = {
      font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF2E7D32' } },
      alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
      border: {
        top: { style: 'thin' as const },
        left: { style: 'thin' as const },
        bottom: { style: 'thin' as const },
        right: { style: 'thin' as const },
      }
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
      border: {
        top: { style: 'thin' as const },
        left: { style: 'thin' as const },
        bottom: { style: 'thin' as const },
        right: { style: 'thin' as const },
      }
    };

    const tableCellStyle = {
      font: { size: 10 },
      border: {
        top: { style: 'thin' as const },
        left: { style: 'thin' as const },
        bottom: { style: 'thin' as const },
        right: { style: 'thin' as const },
      },
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

    // === HEADER: Order number ===
    worksheet.mergeCells(`A${rowNum}:I${rowNum}`);
    const titleRow = worksheet.getRow(rowNum);
    titleRow.getCell(1).value = `ZAMÓWIENIE ${order.orderNumber}`;
    titleRow.getCell(1).style = headerStyle;
    titleRow.height = 30;
    rowNum++;

    // === Order info ===
    worksheet.getRow(rowNum).getCell(1).value = 'Data utworzenia:';
    worksheet.getRow(rowNum).getCell(1).style = labelStyle;
    worksheet.getRow(rowNum).getCell(2).value = new Date(order.createdAt).toLocaleDateString('pl-PL');
    worksheet.getRow(rowNum).getCell(2).style = valueStyle;
    worksheet.getRow(rowNum).getCell(4).value = 'Status:';
    worksheet.getRow(rowNum).getCell(4).style = labelStyle;
    worksheet.getRow(rowNum).getCell(5).value = statusLabels[order.status] || order.status;
    worksheet.getRow(rowNum).getCell(5).style = valueStyle;
    rowNum++;

    // === Customer info ===
    worksheet.getRow(rowNum).getCell(1).value = 'Klient:';
    worksheet.getRow(rowNum).getCell(1).style = labelStyle;
    worksheet.mergeCells(`B${rowNum}:E${rowNum}`);
    worksheet.getRow(rowNum).getCell(2).value = order.customerName || 'Brak danych';
    worksheet.getRow(rowNum).getCell(2).style = { ...valueStyle, font: { size: 11, bold: true } };
    rowNum += 2;

    // === Products table header ===
    const headers = ['Produkt', 'Rozmiar', 'Wysokość', 'Data przyj.', 'Palety', 'Szt/paleta', 'Łącznie szt.', 'Cena jedn.', 'Wartość'];
    const headerRow = worksheet.getRow(rowNum);
    headers.forEach((header, idx) => {
      headerRow.getCell(idx + 1).value = header;
      headerRow.getCell(idx + 1).style = tableHeaderStyle;
    });
    headerRow.height = 25;
    rowNum++;

    // === Products data ===
    (order.items || []).forEach((item, idx) => {
      const row = worksheet.getRow(rowNum);
      const isEven = idx % 2 === 0;
      const rowFill = isEven 
        ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } }
        : { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF5F5F5' } };

      row.getCell(1).value = item.productSnapshot?.plantName || item.productName || `Produkt #${item.productId}`;
      row.getCell(2).value = item.productSnapshot?.potSize || '-';
      row.getCell(3).value = item.productSnapshot?.plantHeightCm ? `${item.productSnapshot.plantHeightCm} cm` : '-';
      row.getCell(4).value = item.productSnapshot?.createdAt ? new Date(item.productSnapshot.createdAt).toLocaleDateString('pl-PL') : '-';
      row.getCell(5).value = item.palletCount || 0;
      row.getCell(6).value = item.unitsPerPallet || 1;
      row.getCell(7).value = item.quantity;
      row.getCell(8).value = (item.unitPriceGross || 0).toFixed(2) + ' PLN';
      row.getCell(9).value = (item.totalPrice || 0).toFixed(2) + ' PLN';

      for (let i = 1; i <= 9; i++) {
        row.getCell(i).style = { 
          ...tableCellStyle, 
          fill: rowFill,
          alignment: { 
            ...tableCellStyle.alignment, 
            horizontal: i >= 5 ? 'center' as const : 'left' as const 
          } 
        };
      }
      row.height = 22;
      rowNum++;
    });

    rowNum++;

    // === Summary ===
    const totalPallets = (order.items || []).reduce((sum, item) => sum + (item.palletCount || 0), 0);
    const totalUnits = (order.items || []).reduce((sum, item) => sum + item.quantity, 0);

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
    worksheet.getRow(rowNum).getCell(6).value = 'SUMA: ' + (order.totalAmount || 0).toFixed(2) + ' PLN';
    worksheet.getRow(rowNum).getCell(6).style = totalStyle;
    worksheet.getRow(rowNum).height = 28;
    rowNum += 2;

    // === Notes ===
    if (order.customerNotes) {
      worksheet.getRow(rowNum).getCell(1).value = 'Uwagi klienta:';
      worksheet.getRow(rowNum).getCell(1).style = { font: { bold: true, size: 10, italic: true } };
      rowNum++;
      worksheet.mergeCells(`A${rowNum}:I${rowNum}`);
      worksheet.getRow(rowNum).getCell(1).value = order.customerNotes;
      worksheet.getRow(rowNum).getCell(1).style = { font: { size: 10 }, alignment: { wrapText: true } };
      rowNum++;
    }

    if (order.notes) {
      worksheet.getRow(rowNum).getCell(1).value = 'Uwagi wewnętrzne:';
      worksheet.getRow(rowNum).getCell(1).style = { font: { bold: true, size: 10, italic: true } };
      rowNum++;
      worksheet.mergeCells(`A${rowNum}:I${rowNum}`);
      worksheet.getRow(rowNum).getCell(1).value = order.notes;
      worksheet.getRow(rowNum).getCell(1).style = { font: { size: 10 }, alignment: { wrapText: true } };
    }

    // Generate and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `zamówienie_${order.orderNumber.replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
  };



  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-[1152px] w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Zamówienie {order.orderNumber}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Utworzono: {formatDate(order.createdAt)}
              </p>
            </div>
            <span className={`badge ${statusConfig[order.status].class} text-lg px-4 py-2`}>
              {statusConfig[order.status].label}
            </span>
          </div>

          {/* Komunikat sukcesu */}
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-green-800">{successMessage}</p>
              </div>
            </div>
          )}

          {/* Komunikat błędu */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Klient */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Dane klienta</h3>
            <div className="text-sm text-gray-700">
              <p><strong>Nazwa:</strong> {order.customerName || 'Brak danych'}</p>
            </div>
          </div>

          {/* Produkty */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Produkty</h3>
            <div className="card overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th className="py-2 px-3">Produkt</th>
                    <th className="py-2 px-2 text-center">Data przyj.</th>
                    <th className="py-2 px-2 text-center text-xs">Nabite przez</th>
                    <th className="py-2 px-2 text-center">Palety</th>
                    <th className="py-2 px-2 text-center">Szt/pal</th>
                    <th className="py-2 px-2 text-center">Łącznie szt.</th>
                    <th className="py-2 px-3 text-right">Cena jedn.</th>
                    <th className="py-2 px-3 text-right">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item) => (
                      <tr key={item.id} onClick={() => setSelectedProduct(item)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                        <td className="py-2 px-3">
                          <div>{item.productSnapshot?.plantName || item.productName || `Produkt #${item.productId}`}</div>
                          <div className="text-xs text-gray-500">{item.productSnapshot?.potSize || '-'} | Wys: {item.productSnapshot?.plantHeightCm ? `${item.productSnapshot.plantHeightCm}cm` : '-'}</div>
                        </td>
                        <td className="py-2 px-2 text-center text-xs">{item.productSnapshot?.createdAt ? new Date(item.productSnapshot.createdAt).toLocaleDateString("pl-PL") : "-"}</td>
                        <td className="py-2 px-2 text-center text-xs">
                          {item.createdByEmail ? (
                            <div>
                              <div>{item.createdByEmail.split('@')[0]}</div>
                              <div className="text-gray-400">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("pl-PL") + ' ' + new Date(item.createdAt).toLocaleTimeString("pl-PL", { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="py-2 px-2 text-center font-semibold">{item.palletCount || 0}</td>
                        <td className="py-2 px-2 text-center text-sm">{item.unitsPerPallet || 1}</td>
                        <td className="py-2 px-2 text-center font-semibold">{item.quantity}</td>
                        <td className="py-2 px-3 text-right">{(item.unitPriceGross || 0).toFixed(2)} PLN</td>
                        <td className="py-2 px-3 text-right font-semibold">{(item.totalPrice || 0).toFixed(2)} PLN</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="text-center text-gray-500 py-4">Brak produktów</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Podsumowanie */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Łącznie palet:</span>
              <span className="font-semibold">{order.items?.reduce((sum, item) => sum + (item.palletCount || 0), 0) || 0}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Łącznie sztuk:</span>
              <span className="font-semibold">{order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}</span>
            </div>
            <div className="flex justify-between text-xl font-bold border-t pt-2">
              <span>Suma zamówienia:</span>
              <span>{(order.totalAmount || 0).toFixed(2)} PLN</span>
            </div>
          </div>

          {order.customerNotes && (
            <div className="card p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Notatki klienta</h3>
              <p className="text-sm text-gray-700">{order.customerNotes}</p>
            </div>
          )}

          {order.notes && (
            <div className="card p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Notatki wewnętrzne</h3>
              <p className="text-sm text-gray-700">{order.notes}</p>
            </div>
          )}

          {/* Historia statusów */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Historia statusów</h3>

            {isLoadingHistory ? (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="text-sm text-gray-500 mt-2">Ładowanie historii...</p>
              </div>
            ) : statusHistory.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Brak historii zmian statusu</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                <div className="space-y-4">
                  {statusHistory.map((item, index) => (
                    <div key={item.id} className="relative pl-10">
                      <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        statusConfig[item.statusTo]?.class === 'badge-success' ? 'bg-primary-500' :
                        statusConfig[item.statusTo]?.class === 'badge-warning' ? 'bg-yellow-500' :
                        statusConfig[item.statusTo]?.class === 'badge-danger' ? 'bg-red-500' :
                        statusConfig[item.statusTo]?.class === 'badge-info' ? 'bg-blue-500' :
                        'bg-gray-500'
                      }`}>
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          {item.statusTo === OrderStatus.COMPLETED ? (
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          ) : item.statusTo === OrderStatus.CANCELLED ? (
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          ) : (
                            <circle cx="10" cy="10" r="3" />
                          )}
                        </svg>
                      </div>

                      <div className={`bg-white border rounded-lg p-3 shadow-sm ${
                        index === 0 ? 'border-l-4 ' + (
                          statusConfig[item.statusTo]?.class === 'badge-success' ? 'border-l-primary-500' :
                          statusConfig[item.statusTo]?.class === 'badge-warning' ? 'border-l-yellow-500' :
                          statusConfig[item.statusTo]?.class === 'badge-danger' ? 'border-l-red-500' :
                          statusConfig[item.statusTo]?.class === 'badge-info' ? 'border-l-blue-500' :
                          'border-l-gray-500'
                        ) : 'border-gray-200'
                      }`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {item.statusFrom && (
                              <>
                                <span className={`badge ${statusConfig[item.statusFrom]?.class || 'badge-secondary'} text-xs`}>
                                  {statusConfig[item.statusFrom]?.label || item.statusFrom}
                                </span>
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </>
                            )}
                            <span className={`badge ${statusConfig[item.statusTo]?.class || 'badge-secondary'} text-xs font-semibold`}>
                              {statusConfig[item.statusTo]?.label || item.statusTo}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatDate(item.createdAt)}
                          </span>
                        </div>

                        <div className="text-xs text-gray-600 mb-1">
                          Zmienione przez: <span className="font-medium">{item.changedByEmail || `Użytkownik #${item.changedBy}`}</span>
                        </div>

                        {item.notes && (
                          <div className="mt-2 text-sm text-gray-700 bg-gray-50 rounded p-2">
                            <span className="font-medium text-gray-600">Notatka: </span>
                            {item.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Przyciski */}
          <div className="flex flex-wrap gap-3">
            <button onClick={onClose} className="btn btn-secondary flex-1 min-w-[120px]">
              Zamknij
            </button>
            <button
              onClick={() => window.open("/print/order/" + order.id, "_blank")}
              className="btn btn-outline flex-1 min-w-[120px]"
            >
              Drukuj zamówienie
            </button>
            <button
              onClick={handleExportExcel}
              className="btn flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
            >
              Eksport Excel
            </button>
            {canCreateDocument() && (
              <button
                onClick={() => setShowDocumentModal(true)}
                className="btn flex-1 min-w-[120px] bg-primary-600 hover:bg-primary-700 text-white border-primary-600"
              >
                Wystaw dokument
              </button>
            )}
            {canCreateProforma() && (
              <button
                onClick={handleCreateProforma}
                className="btn flex-1 min-w-[120px] bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                disabled={isCreatingProforma}
              >
                {isCreatingProforma ? 'Tworzenie...' : 'Generuj proformę'}
              </button>
            )}

            {canTransferProducts() && (
              <button
                onClick={() => setShowTransferModal(true)}
                className="btn btn-info flex-1 min-w-[120px]"
              >
                Przenieś produkty
              </button>
            )}
            {canMergeOrders() && (
              <button
                onClick={() => setShowMergeModal(true)}
                className="btn flex-1 min-w-[120px] bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
              >
                Połącz zamówienia
              </button>
            )}
            {canEditOrder() && onEdit && (
              <button
                onClick={onEdit}
                className="btn btn-primary flex-1 min-w-[120px]"
              >
                Edytuj zamówienie
              </button>
            )}
            {canCancelOrder() && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="btn btn-danger flex-1 min-w-[120px]"
                disabled={isCancelling}
              >
                Anuluj zamówienie
              </button>
            )}
            {canReopenOrder() && (
              <button
                onClick={() => setShowReopenModal(true)}
                className="btn flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                disabled={isReopening}
              >
                Otwórz ponownie
              </button>
            )}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="btn flex-1 min-w-[120px] bg-red-700 hover:bg-red-800 text-white border-red-700"
              disabled={isDeleting}
            >
              Usuń zamówienie
            </button>
          </div>
        </div>
      </div>

      {/* Modal szczegółów produktu */}
      {selectedProduct && (
        <ProductDetailsModal
          productId={selectedProduct.productId!}
          quantity={selectedProduct.quantity}
          unitPrice={selectedProduct.unitPriceGross}
          totalPrice={selectedProduct.totalPrice}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Modal anulowania zamówienia */}
      {showCancelModal && (
        <CancelOrderModal
          orderNumber={order.orderNumber}
          onConfirm={handleCancelOrder}
          onClose={() => setShowCancelModal(false)}
          isLoading={isCancelling}
        />
      )}

      {/* Modal przenoszenia produktów */}
      {showTransferModal && (
        <TransferProductsModal
          sourceOrder={order}
          onClose={() => setShowTransferModal(false)}
          onSuccess={handleTransferSuccess}
        />
      )}

      {/* Modal łączenia zamówień */}
      {showMergeModal && order.customerId && (
        <MergeOrdersModal
          masterOrder={order}
          onClose={() => setShowMergeModal(false)}
          onSuccess={handleMergeSuccess}
        />
      )}

      {/* Modal otwierania ponownie zamówienia */}
      {showReopenModal && (
        <ReopenOrderModal
          orderNumber={order.orderNumber}
          onConfirm={handleReopenOrder}
          onClose={() => setShowReopenModal(false)}
          isLoading={isReopening}
        />
      )}

      {/* Modal potwierdzenia usuwania */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-red-700 mb-4">
              Potwierdź usunięcie zamówienia
            </h3>
            <p className="text-gray-700 mb-2">
              Czy na pewno chcesz <strong>trwale usunąć</strong> zamówienie{' '}
              <span className="font-semibold">{order.orderNumber}</span>?
            </p>
            <p className="text-sm text-red-600 mb-6">
              Ta operacja jest nieodwracalna. Wszystkie dane zamówienia zostaną usunięte.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-secondary flex-1"
                disabled={isDeleting}
              >
                Anuluj
              </button>
              <button
                onClick={handleDeleteOrder}
                className="btn flex-1 bg-red-700 hover:bg-red-800 text-white border-red-700"
                disabled={isDeleting}
              >
                {isDeleting ? 'Usuwanie...' : 'Tak, usuń zamówienie'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal wystawiania dokumentu */}
      {showDocumentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Wystaw dokument sprzedaży
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Zamówienie: <strong>{order.orderNumber}</strong>
              <br />
              Klient: <strong>{order.customerName || 'Brak danych'}</strong>
              <br />
              Kwota: <strong>{(order.totalAmount || 0).toFixed(2)} PLN</strong>
            </p>

            <div className="space-y-4">
              {/* Document Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Typ dokumentu
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDocumentType('receipt')}
                    className={`p-4 border-2 rounded-lg text-center transition-all ${
                      documentType === 'receipt'
                        ? 'border-primary-500 bg-green-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-1">🧾</div>
                    <div className="font-semibold">Paragon</div>
                    <div className="text-xs text-gray-500">Format A4</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocumentType('invoice')}
                    className={`p-4 border-2 rounded-lg text-center transition-all ${
                      documentType === 'invoice'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-1">📄</div>
                    <div className="font-semibold">Faktura VAT</div>
                    <div className="text-xs text-gray-500">Format A4</div>
                  </button>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Metoda płatności
                </label>
                <select
                  className="input w-full"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value={PaymentMethod.CASH}>💵 Gotówka</option>
                  <option value={PaymentMethod.CARD}>💳 Karta</option>
                  <option value={PaymentMethod.TRANSFER}>🏦 Przelew</option>
                </select>
              </div>

              {/* Payment Deadline (only for invoice) */}
              {documentType === 'invoice' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Termin płatności
                  </label>
                  <input
                    type="date"
                    className="input w-full"
                    value={paymentDeadline}
                    onChange={(e) => setPaymentDeadline(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDocumentModal(false)}
                className="btn btn-secondary flex-1"
                disabled={isCreatingDocument}
              >
                Anuluj
              </button>
              <button
                onClick={handleCreateDocument}
                className={`btn flex-1 text-white ${
                  documentType === 'receipt'
                    ? 'bg-primary-600 hover:bg-primary-700 border-primary-600'
                    : 'bg-blue-600 hover:bg-blue-700 border-blue-600'
                }`}
                disabled={isCreatingDocument}
              >
                {isCreatingDocument
                  ? 'Tworzenie...'
                  : documentType === 'receipt'
                  ? 'Wystaw paragon'
                  : 'Wystaw fakturę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
