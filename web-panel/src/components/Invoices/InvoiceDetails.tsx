import { useState, useEffect } from 'react';
import { Invoice, PaymentStatus, PrintTemplate, PaymentMethod } from '../../types';
import { API } from '../../services/api';
import { usePrint } from '../../hooks/usePrint';

interface InvoiceDetailsProps {
  invoice: Invoice;
  onClose: () => void;
  onUpdatePayment: (invoice: Invoice) => void;
  onRefresh?: () => void;
}

export function InvoiceDetails({ invoice, onClose, onUpdatePayment, onRefresh }: InvoiceDetailsProps) {
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [printStatus, setPrintStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isEditingPaymentMethod, setIsEditingPaymentMethod] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(invoice.paymentMethod || PaymentMethod.TRANSFER);
  const [isUpdatingPaymentMethod, setIsUpdatingPaymentMethod] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice>(invoice);

  // Use print hook
  const { printInvoice, hasConfiguredPrinter, getConfig } = usePrint({
    onQueued: (jobId) => {
      const config = getConfig('invoices');
      setPrintStatus({
        type: 'success',
        message: `Wysłano do drukarki ${config?.printerName || 'domyślnej'} (job: ${jobId.slice(0, 8)}...)`,
      });
      setTimeout(() => setPrintStatus(null), 5000);
    },
    onBrowserPrint: () => {
      setPrintStatus({
        type: 'info',
        message: 'Otwarto okno drukowania przeglądarki',
      });
      setTimeout(() => setPrintStatus(null), 3000);
    },
    onError: (error) => {
      setPrintStatus({
        type: 'error',
        message: error,
      });
    },
  });

  const hasPrinterConfigured = hasConfiguredPrinter('invoices');

  // Load invoice templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await API.getPrintTemplates('invoice');
        setTemplates(data);
        const defaultTemplate = data.find(t => t.isDefault);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        } else if (data.length > 0) {
          setSelectedTemplateId(data[0].id);
        }
      } catch (error) {
        console.error('Error loading templates:', error);
      }
    };
    loadTemplates();
  }, []);


  const handleUpdatePaymentMethod = async () => {
    if (selectedPaymentMethod === currentInvoice.paymentMethod) {
      setIsEditingPaymentMethod(false);
      return;
    }

    setIsUpdatingPaymentMethod(true);
    try {
      const result = await API.updateInvoicePaymentMethod(currentInvoice.id, selectedPaymentMethod);
      setCurrentInvoice(result.invoice);
      setIsEditingPaymentMethod(false);
      setPrintStatus({
        type: "success",
        message: "Forma płatności została zmieniona" + (result.invoice.paymentStatus === "paid" ? " i faktura oznaczona jako opłacona" : ""),
      });
      setTimeout(() => setPrintStatus(null), 5000);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Error updating payment method:", error);
      setPrintStatus({
        type: "error",
        message: "Błąd podczas zmiany formy płatności",
      });
    } finally {
      setIsUpdatingPaymentMethod(false);
    }
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL');
  };

  const getPaymentMethodLabel = (method?: string) => {
    const labels: Record<string, string> = {
      card: 'Karta',
      cash: 'Gotówka',
      transfer: 'Przelew',
    };
    return method ? labels[method] || method : 'Nie określono';
  };

  const getPaymentStatusLabel = (status: PaymentStatus): string => {
    const labels: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'Nieopłacona',
      [PaymentStatus.PARTIALLY_PAID]: 'Częściowo opłacona',
      [PaymentStatus.PAID]: 'Opłacona',
      [PaymentStatus.OVERDUE]: 'Po terminie',
    };
    return labels[status];
  };

  const getPaymentStatusColor = (status: PaymentStatus): string => {
    const colors: Record<PaymentStatus, string> = {
      [PaymentStatus.UNPAID]: 'text-red-700 bg-red-100',
      [PaymentStatus.PARTIALLY_PAID]: 'text-yellow-700 bg-yellow-100',
      [PaymentStatus.PAID]: 'text-green-700 bg-green-100',
      [PaymentStatus.OVERDUE]: 'text-red-900 bg-red-200',
    };
    return colors[status];
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  // Replace template placeholders with invoice data
  const replacePlaceholders = (content: string): string => {
    return content
      // Invoice data
      .replace(/\{\{invoiceNumber\}\}/g, invoice.invoiceNumber || '')
      .replace(/\{\{issueDate\}\}/g, formatDateShort(invoice.issueDate))
      .replace(/\{\{invoiceDate\}\}/g, formatDateShort(invoice.issueDate))
      .replace(/\{\{saleDate\}\}/g, formatDateShort(invoice.saleDate))
      .replace(/\{\{paymentDeadline\}\}/g, invoice.paymentDeadline ? formatDateShort(invoice.paymentDeadline) : '')
      .replace(/\{\{paymentMethod\}\}/g, getPaymentMethodLabel(invoice.paymentMethod))
      // Customer data
      .replace(/\{\{buyerName\}\}/g, invoice.customerName || '')
      .replace(/\{\{customerName\}\}/g, invoice.customerName || '')
      .replace(/\{\{buyerAddress\}\}/g, '') // TODO: Add address fields to Invoice type
      .replace(/\{\{buyerCity\}\}/g, '')
      .replace(/\{\{buyerPostalCode\}\}/g, '')
      .replace(/\{\{buyerCountry\}\}/g, 'Polska')
      .replace(/\{\{buyerTaxId\}\}/g, '')
      // Amounts
      .replace(/\{\{subtotal\}\}/g, (Number(invoice.subtotalNet) || 0).toFixed(2) + ' PLN')
      .replace(/\{\{subtotalNet\}\}/g, (Number(invoice.subtotalNet) || 0).toFixed(2) + ' PLN')
      .replace(/\{\{tax\}\}/g, (Number(invoice.totalVat) || 0).toFixed(2) + ' PLN')
      .replace(/\{\{totalVat\}\}/g, (Number(invoice.totalVat) || 0).toFixed(2) + ' PLN')
      .replace(/\{\{total\}\}/g, (Number(invoice.totalGross) || 0).toFixed(2) + ' PLN')
      .replace(/\{\{totalGross\}\}/g, (Number(invoice.totalGross) || 0).toFixed(2) + ' PLN')
      .replace(/\{\{taxRate\}\}/g, '23')
      .replace(/\{\{paidAmount\}\}/g, (Number(invoice.paidAmount) || 0).toFixed(2) + ' PLN')
      .replace(/\{\{remainingAmount\}\}/g, ((Number(invoice.totalGross) || 0) - (Number(invoice.paidAmount) || 0)).toFixed(2) + ' PLN')
      // Notes
      .replace(/\{\{notes\}\}/g, invoice.notes || '')
      // Payment status
      .replace(/\{\{paymentStatus\}\}/g, getPaymentStatusLabel(invoice.paymentStatus))
      // Items placeholder (simplified)
      .replace(/\{\{items\}\}/g, 'Pozycje faktury');
  };

  // Generate print HTML from template
  const generateTemplateHtml = (template: PrintTemplate): string => {
    const mmToPx = 3.7795275591;

    const elementsHtml = template.elements.map(el => {
      const style = el.style || {};
      const x = el.x * mmToPx;
      const y = el.y * mmToPx;
      const width = el.width * mmToPx;
      const height = el.height * mmToPx;

      const baseStyles = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${width}px;
        height: ${height}px;
        font-size: ${style.fontSize || 10}px;
        font-weight: ${style.fontWeight || 'normal'};
        text-align: ${style.textAlign || 'left'};
        color: ${style.color || '#000000'};
        background-color: ${style.backgroundColor || 'transparent'};
        border-width: ${style.borderWidth || 0}px;
        border-color: ${style.borderColor || '#000000'};
        border-style: solid;
        border-radius: ${style.borderRadius || 0}px;
        box-sizing: border-box;
        overflow: hidden;
        white-space: pre-wrap;
      `;

      const content = replacePlaceholders(el.content || '');

      switch (el.type) {
        case 'text':
          return '<div style="' + baseStyles + ' display: flex; align-items: flex-start; padding: 2px;">' + content + '</div>';
        case 'rectangle':
          return '<div style="' + baseStyles + '"></div>';
        case 'line':
          return '<div style="' + baseStyles + ' height: ' + (style.borderWidth || 1) + 'px; background-color: ' + (style.borderColor || '#000') + '; border: none;"></div>';
        default:
          return '';
      }
    }).join('');

    return '<div class="page" style="width: ' + (template.paperWidth * mmToPx) + 'px; height: ' + (template.paperHeight * mmToPx) + 'px; position: relative; background: white; box-sizing: border-box; page-break-after: always;">' + elementsHtml + '</div>';
  };

  // Generate full HTML for printing
  const generatePrintHtml = (): string => {
    if (!selectedTemplate) return '';

    const pageHtml = generateTemplateHtml(selectedTemplate);

    return '<!DOCTYPE html><html><head><title>Faktura ' + invoice.invoiceNumber + '</title>' +
      '<style>' +
      '@page { size: ' + selectedTemplate.paperWidth + 'mm ' + selectedTemplate.paperHeight + 'mm; margin: 0; }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { font-family: Arial, sans-serif; margin: 0; padding: 0; }' +
      '.page { margin: 0 auto; }' +
      '@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }' +
      '</style></head><body>' + pageHtml + '</body></html>';
  };

  const handlePrintWithTemplate = async () => {
    if (!selectedTemplate) {
      alert('Wybierz szablon faktury');
      return;
    }

    setPrintStatus(null);
    const htmlContent = generatePrintHtml();

    await printInvoice(htmlContent, {
      title: 'Faktura ' + invoice.invoiceNumber,
      invoiceId: invoice.id,
    });

    setShowTemplateSelector(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Faktura {invoice.invoiceNumber}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Wystawiono: {formatDate(invoice.issueDate)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Print status notification */}
          {printStatus && (
            <div className={'mb-4 px-4 py-3 rounded-lg text-sm ' + (
              printStatus.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
              printStatus.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
              'bg-blue-100 text-blue-800 border border-blue-200'
            )}>
              {printStatus.message}
            </div>
          )}

          {/* Printer status indicator */}
          <div className="mb-4 flex items-center gap-2 text-sm">
            <div className={'w-2 h-2 rounded-full ' + (hasPrinterConfigured ? 'bg-green-500' : 'bg-gray-400')}></div>
            <span className={hasPrinterConfigured ? 'text-green-700' : 'text-gray-600'}>
              {hasPrinterConfigured
                ? 'Drukarka faktur skonfigurowana - automatyczny wydruk'
                : 'Brak skonfigurowanej drukarki - wydruk przez przeglądarkę'}
            </span>
          </div>

          {/* Customer Info */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Dane nabywcy</h3>
            <div className="text-sm text-gray-700">
              <p><strong>Nazwa:</strong> {invoice.customerName || 'Brak danych'}</p>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Szczegóły faktury</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <p><strong>Data sprzedaży:</strong> {formatDate(invoice.saleDate)}</p>
                {invoice.paymentDeadline && (
                  <p><strong>Termin płatności:</strong> {formatDate(invoice.paymentDeadline)}</p>
                )}
                <div className="flex items-center gap-2">
                  <strong>Metoda płatności:</strong>
                  {isEditingPaymentMethod ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedPaymentMethod}
                        onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethod)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                        disabled={isUpdatingPaymentMethod}
                      >
                        <option value="cash">Gotówka</option>
                        <option value="card">Karta</option>
                        <option value="transfer">Przelew</option>
                      </select>
                      <button
                        onClick={handleUpdatePaymentMethod}
                        disabled={isUpdatingPaymentMethod}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {isUpdatingPaymentMethod ? '...' : 'Zapisz'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingPaymentMethod(false);
                          setSelectedPaymentMethod(currentInvoice.paymentMethod || PaymentMethod.TRANSFER);
                        }}
                        disabled={isUpdatingPaymentMethod}
                        className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                      >
                        Anuluj
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => setIsEditingPaymentMethod(true)}
                      className="cursor-pointer hover:text-primary-600 hover:underline"
                      title="Kliknij aby zmienić"
                    >
                      {getPaymentMethodLabel(currentInvoice.paymentMethod)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Powiązania</h3>
              <div className="text-sm text-gray-700 space-y-1">
                {invoice.orderId && (
                  <p><strong>Zamówienie:</strong> #{invoice.orderId}</p>
                )}
                {invoice.customerId && (
                  <p><strong>ID Klienta:</strong> {invoice.customerId}</p>
                )}
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="card p-4 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Status płatności</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Status:</span>
                <span className={'px-3 py-1 rounded-full text-xs font-semibold ' + getPaymentStatusColor(invoice.paymentStatus)}>
                  {getPaymentStatusLabel(invoice.paymentStatus)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Zapłacono:</span>
                <span className="font-semibold text-gray-900">{(Number(invoice.paidAmount) || 0).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-sm text-gray-600">Pozostało do zapłaty:</span>
                <span className="font-bold text-primary-600">
                  {((Number(invoice.totalGross) || 0) - (Number(invoice.paidAmount) || 0)).toFixed(2)} PLN
                </span>
              </div>
            </div>
          </div>

          {/* Invoice Items */}
          {invoice.items && invoice.items.length > 0 && (
            <div className="card p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Pozycje faktury</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2">Opis</th>
                      <th className="text-right py-2 px-2">Ilość</th>
                      <th className="text-right py-2 px-2">Cena netto</th>
                      <th className="text-right py-2 px-2">VAT</th>
                      <th className="text-right py-2 px-2">Wartość netto</th>
                      <th className="text-right py-2 px-2">Wartość brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item, index) => (
                      <tr key={item.id || index} className="border-b border-gray-100">
                        <td className="py-2 px-2">{item.description}</td>
                        <td className="text-right py-2 px-2">{item.quantity}</td>
                        <td className="text-right py-2 px-2">{(Number(item.unitPriceNet) || 0).toFixed(2)} PLN</td>
                        <td className="text-right py-2 px-2">{Number(item.vatRate) || 0}%</td>
                        <td className="text-right py-2 px-2">{(Number(item.totalNet) || (Number(item.unitPriceNet) * item.quantity)).toFixed(2)} PLN</td>
                        <td className="text-right py-2 px-2 font-medium">{(Number(item.totalGross) || ((Number(item.unitPriceNet) * item.quantity) * (1 + (Number(item.vatRate) || 0) / 100))).toFixed(2)} PLN</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* Summary */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Suma netto:</span>
                <span className="font-medium">{(Number(invoice.subtotalNet) || 0).toFixed(2)} PLN</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">VAT:</span>
                <span className="font-medium">{(Number(invoice.totalVat) || 0).toFixed(2)} PLN</span>
              </div>
              <div className="border-t border-gray-300 pt-2 flex justify-between text-xl font-bold">
                <span>Suma brutto:</span>
                <span className="text-primary-600">{(Number(invoice.totalGross) || 0).toFixed(2)} PLN</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="card p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Notatki</h3>
              <p className="text-sm text-gray-700">{invoice.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => window.open('/print/invoice/' + invoice.id, '_blank')}
              className="btn btn-outline"
            >
              Drukuj fakturę
            </button>
            <button
              onClick={() => onUpdatePayment(invoice)}
              className="btn btn-primary"
            >
              Aktualizuj płatność
            </button>
            {invoice.pdfUrl && (
              <a
                href={invoice.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                Pobierz PDF
              </a>
            )}
            <button onClick={onClose} className="btn btn-secondary flex-1">
              Zamknij
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
