import { useState, useEffect, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { api } from '../services/api';
import { Invoice } from '../types';
import { InvoicesTable } from '../components/Invoices/InvoicesTable';
import { InvoiceDetails } from '../components/Invoices/InvoiceDetails';
import { PaymentStatusModal } from '../components/Invoices/PaymentStatusModal';
import { CreateCorrectionModal } from '../components/Invoices/CreateCorrectionModal';
import { EditInvoiceModal } from '../components/Invoices/EditInvoiceModal';
import { EmailInputModal } from '../components/Invoices/EmailInputModal';
import { CreateInvoiceModal } from '../components/Invoices/CreateInvoiceModal';

export type SortField = 'invoiceNumber' | 'customerCode' | 'customerName' | 'issueDate' | 'paymentDeadline' | 'paymentStatus' | 'totalGross';
export type SortOrder = 'asc' | 'desc';

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [invoiceToUpdatePayment, setInvoiceToUpdatePayment] = useState<Invoice | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('');
  const [ksefStatusFilter, setKsefStatusFilter] = useState<string>('');
  const [isSendingKsef, setIsSendingKsef] = useState(false);
  const [correctionInvoice, setCorrectionInvoice] = useState<Invoice | null>(null);
  const [editInvoiceId, setEditInvoiceId] = useState<number | null>(null);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);

  // New: Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('issueDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);
  const [emailModalInvoice, setEmailModalInvoice] = useState<Invoice | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const filters: { startDate?: string; endDate?: string; paymentStatus?: string; paymentMethod?: string } = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (paymentStatusFilter) filters.paymentStatus = paymentStatusFilter;
      if (paymentMethodFilter) filters.paymentMethod = paymentMethodFilter;

      const data = await api.getInvoices(filters);
      setInvoices(data.invoices);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Filter and sort invoices
  const filteredAndSortedInvoices = useMemo(() => {
    let result = [...invoices];

    // Filter by KSeF status
    if (ksefStatusFilter) {
      if (ksefStatusFilter === 'none') {
        result = result.filter(invoice => !invoice.ksefStatus || invoice.ksefStatus === 'none');
      } else if (ksefStatusFilter === 'error') {
        result = result.filter(invoice => invoice.ksefStatus === 'error' || invoice.ksefStatus === 'rejected');
      } else {
        result = result.filter(invoice => invoice.ksefStatus === ksefStatusFilter);
      }
    }

    // Filter by search query (customer name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(invoice =>
        (invoice.customerName || '').toLowerCase().includes(query) ||
        (invoice.invoiceNumber || '').toLowerCase().includes(query) ||
        String(invoice.buyerSnapshot?.customerCode || '').toLowerCase().includes(query) ||
        String(invoice.buyerSnapshot?.nip || '').includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'invoiceNumber':
          comparison = (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '', 'pl');
          break;
        case 'customerName':
          comparison = (a.customerName || '').localeCompare(b.customerName || '', 'pl');
          break;
        case 'issueDate':
          comparison = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
          break;
        case 'paymentDeadline':
          const dateA = a.paymentDeadline ? new Date(a.paymentDeadline).getTime() : 0;
          const dateB = b.paymentDeadline ? new Date(b.paymentDeadline).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'paymentStatus':
          // Sort by priority: OVERDUE > UNPAID > PARTIALLY_PAID > PAID
          const statusOrder: Record<string, number> = {
            'overdue': 0,
            'unpaid': 1,
            'partially_paid': 2,
            'paid': 3,
          };
          comparison = (statusOrder[a.paymentStatus] || 99) - (statusOrder[b.paymentStatus] || 99);
          break;
        case 'totalGross':
          comparison = (Number(a.totalGross) || 0) - (Number(b.totalGross) || 0);
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [invoices, searchQuery, sortField, sortOrder, ksefStatusFilter]);

  const handleFilter = () => {
    fetchInvoices();
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setPaymentStatusFilter('');
    setPaymentMethodFilter('');
    setKsefStatusFilter('');
    setTimeout(() => fetchInvoices(), 0);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle order if same field
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New field - default to desc for dates/amounts, asc for text
      setSortField(field);
      setSortOrder(['issueDate', 'paymentDeadline', 'totalGross'].includes(field) ? 'desc' : 'asc');
    }
  };

  const handleViewDetails = async (invoice: Invoice) => {
    try {
      const fullInvoice = await api.getInvoice(invoice.id);
      setSelectedInvoice(fullInvoice.invoice);
    } catch (error) {
      console.error("Error loading invoice details:", error);
      setSelectedInvoice(invoice);
    }
  };

  const handleCloseDetails = () => {
    setSelectedInvoice(null);
  };

  const handleUpdatePayment = (invoice: Invoice) => {
    setInvoiceToUpdatePayment(invoice);
  };

  const handleClosePaymentModal = () => {
    setInvoiceToUpdatePayment(null);
  };

  const handlePaymentSuccess = () => {
    fetchInvoices();
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedInvoices.length === filteredAndSortedInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(filteredAndSortedInvoices.map(inv => inv.id));
    }
  };

  const handleSelectInvoice = (id: number) => {
    setSelectedInvoices(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Print selected invoices
  const handlePrintSelected = () => {
    if (selectedInvoices.length === 0) {
      alert('Wybierz faktury do wydruku');
      return;
    }

    // Open each selected invoice in print view
    selectedInvoices.forEach((id, index) => {
      setTimeout(() => {
        window.open('/print/invoice/' + id, '_blank');
      }, index * 300);
    });
  };

  // Export selected invoices to Excel
  const handleExportToExcel = async () => {
    if (selectedInvoices.length === 0) {
      alert('Wybierz faktury do eksportu');
      return;
    }

    setIsExporting(true);

    try {
      // Get selected invoices data
      const invoicesToExport = filteredAndSortedInvoices.filter(inv =>
        selectedInvoices.includes(inv.id)
      );

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PlantManager';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Faktury', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });

      // Define columns
      worksheet.columns = [
        { header: 'Nazwa kontrahenta', key: 'customerName', width: 40 },
        { header: 'NIP', key: 'nip', width: 15 },
        { header: 'Data wystawienia', key: 'issueDate', width: 15 },
        { header: 'Data sprzedaży', key: 'saleDate', width: 15 },
        { header: 'Numer dokumentu', key: 'invoiceNumber', width: 20 },
        { header: 'Kwota netto', key: 'subtotalNet', width: 15 },
        { header: 'VAT', key: 'totalVat', width: 12 },
        { header: 'Kwota brutto', key: 'totalGross', width: 15 },
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF2563EB' }
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows
      invoicesToExport.forEach((invoice, index) => {
        // Get customer name from buyerSnapshot or customerName
        const customerName = invoice.buyerSnapshot?.companyName ||
          (invoice.buyerSnapshot?.firstName && invoice.buyerSnapshot?.lastName
            ? `${invoice.buyerSnapshot.firstName} ${invoice.buyerSnapshot.lastName}`
            : invoice.customerName) || '';

        // Get NIP
        const nip = invoice.buyerSnapshot?.nip || '';

        // Format dates
        const formatDate = (dateStr: string) => {
          if (!dateStr) return '';
          const date = new Date(dateStr);
          return date.toLocaleDateString('pl-PL');
        };

        const row = worksheet.addRow({
          customerName,
          nip,
          issueDate: formatDate(invoice.issueDate),
          saleDate: formatDate(invoice.saleDate),
          invoiceNumber: invoice.invoiceNumber || '',
          subtotalNet: Number(invoice.subtotalNet) || 0,
          totalVat: Number(invoice.totalVat) || 0,
          totalGross: Number(invoice.totalGross) || 0,
        });

        row.eachCell((cell, colNumber) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber <= 5 ? 'left' : 'right'
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };

          // Format currency columns
          if (colNumber >= 6) {
            cell.numFmt = '#,##0.00 "zł"';
          }
        });

        // Alternate row colors
        if (index % 2 === 1) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' }
            };
          });
        }
      });

      // Add summary row
      const summaryRow = worksheet.addRow({
        customerName: 'RAZEM:',
        nip: '',
        issueDate: '',
        saleDate: '',
        invoiceNumber: `${invoicesToExport.length} faktur`,
        subtotalNet: invoicesToExport.reduce((sum, inv) => sum + (Number(inv.subtotalNet) || 0), 0),
        totalVat: invoicesToExport.reduce((sum, inv) => sum + (Number(inv.totalVat) || 0), 0),
        totalGross: invoicesToExport.reduce((sum, inv) => sum + (Number(inv.totalGross) || 0), 0),
      });

      summaryRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8F4FD' }
        };
        cell.border = {
          top: { style: 'medium' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if (colNumber >= 6) {
          cell.numFmt = '#,##0.00 "zł"';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });

      // Enable autofilter
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: invoicesToExport.length + 1, column: 8 }
      };

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `faktury_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export error:', error);
      alert('Wystąpił błąd podczas eksportu: ' + (error as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  // Send invoice by email
  const handleSendEmail = (invoice: Invoice) => {
    setEmailModalInvoice(invoice);
  };

  // KSeF bulk send handler
  const handleBulkSendKsef = async () => {
    if (selectedInvoices.length === 0) {
      alert('Wybierz faktury do wysłania do KSeF');
      return;
    }
    if (!confirm(`Czy na pewno chcesz wysłać ${selectedInvoices.length} faktur do KSeF?`)) return;
    setIsSendingKsef(true);
    try {
      await api.sendBulkToKsef(selectedInvoices);
      alert(`Wysłano ${selectedInvoices.length} faktur do KSeF`);
      setSelectedInvoices([]);
      fetchInvoices();
    } catch (error: any) {
      console.error('Error sending to KSeF:', error);
      alert('Błąd wysyłania do KSeF: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsSendingKsef(false);
    }
  };

  const handleSendEmailConfirm = async (email: string, saveToCustomer: boolean) => {
    if (!emailModalInvoice) return;

    setIsSendingEmail(true);
    try {
      // Send the invoice
      const result = await api.sendInvoiceEmail(emailModalInvoice.id, { email });

      if (result.success) {
        // Save email to customer if requested and customer exists
        if (saveToCustomer && emailModalInvoice.customerId && !emailModalInvoice.buyerSnapshot?.email) {
          try {
            await api.updateCustomer(emailModalInvoice.customerId, { email });
          } catch (e) {
            console.error('Error saving email to customer:', e);
          }
        }

        alert('Faktura została wysłana na adres ' + email);
        setEmailModalInvoice(null);
        fetchInvoices(); // Refresh to update buyerSnapshot
      } else {
        alert('Błąd wysyłania: ' + result.message);
      }
    } catch (error) {
      console.error('Error sending invoice email:', error);
      alert('Wystąpił błąd podczas wysyłania faktury');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="space-y-6 px-3 py-2">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Faktury</h1>
        <button onClick={() => setShowCreateInvoice(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 shadow-sm">
          + Nowa faktura
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-8 gap-4">
          {/* Search by customer name */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Szukaj kontrahenta
            </label>
            <div className="relative">
              <input
                type="text"
                className="input pl-10"
                placeholder="Nazwa, numer faktury lub kod klienta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data od
            </label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data do
            </label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status płatności
            </label>
            <select
              className="input"
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
            >
              <option value="">Wszystkie</option>
              <option value="not_paid">Niezapłacone</option>
              <option value="unpaid">Nieopłacone</option>
              <option value="partially_paid">Częściowo</option>
              <option value="overdue">Po terminie</option>
              <option value="paid">Zapłacone</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Metoda płatności
            </label>
            <select
              className="input"
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
            >
              <option value="">Wszystkie</option>
              <option value="cash">Gotówka</option>
              <option value="card">Karta</option>
              <option value="transfer">Przelew</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status KSeF
            </label>
            <select
              className="input"
              value={ksefStatusFilter}
              onChange={(e) => setKsefStatusFilter(e.target.value)}
            >
              <option value="">Wszystkie</option>
              <option value="accepted">Przyjęta do KSeF</option>
              <option value="sending">Wysyłanie</option>
              <option value="error">Błąd / Odrzucona</option>
              <option value="none">Nie wysłana</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={handleFilter} className="btn btn-primary">
              Filtruj
            </button>
            <button onClick={handleClearFilter} className="btn btn-secondary">
              Wyczyść
            </button>
          </div>
        </div>
      </div>

      {/* Selection toolbar */}
      {selectedInvoices.length > 0 && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="text-sm text-blue-800">
              Zaznaczono <strong>{selectedInvoices.length}</strong> z {filteredAndSortedInvoices.length} faktur
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportToExcel}
                disabled={isExporting}
                className="btn btn-success btn-sm flex items-center gap-2"
              >
                {isExporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Eksportowanie...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Eksportuj do Excel ({selectedInvoices.length})
                  </>
                )}
              </button>
              <button
                onClick={handlePrintSelected}
                className="btn btn-primary btn-sm"
              >
                Drukuj ({selectedInvoices.length})
              </button>
              <button
                onClick={handleBulkSendKsef}
                disabled={isSendingKsef}
                className="btn btn-primary btn-sm flex items-center gap-2"
              >
                {isSendingKsef ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Wysyłanie...
                  </>
                ) : (
                  <>KSeF ({selectedInvoices.length})</>
                )}
              </button>
              <button
                onClick={() => setSelectedInvoices([])}
                className="btn btn-secondary btn-sm"
              >
                Odznacz wszystko
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Ładowanie...</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center text-sm text-gray-600">
            <p>
              Znaleziono: {filteredAndSortedInvoices.length} faktur
              {searchQuery && ` (filtrowane z ${invoices.length})`}
            </p>
            <div className="space-x-4">
              <span>
                <strong>Suma netto:</strong>{' '}
                {(filteredAndSortedInvoices.reduce((sum, inv) => sum + (Number(inv.subtotalNet) || 0), 0)).toFixed(2)} PLN
              </span>
              <span>
                <strong>Suma brutto:</strong>{' '}
                {(filteredAndSortedInvoices.reduce((sum, inv) => sum + (Number(inv.totalGross) || 0), 0)).toFixed(2)} PLN
              </span>
            </div>
          </div>
          <InvoicesTable
            invoices={filteredAndSortedInvoices}
            onViewDetails={handleViewDetails}
            onUpdatePayment={handleUpdatePayment}
            onSendEmail={handleSendEmail}
            onEdit={(invoice) => setEditInvoiceId(invoice.id)}
            onCreateCorrection={(invoice) => setCorrectionInvoice(invoice)}
            selectedInvoices={selectedInvoices}
            onSelectInvoice={handleSelectInvoice}
            onSelectAll={handleSelectAll}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </>
      )}

      {/* Details Modal */}
      {selectedInvoice && (
        <InvoiceDetails
          invoice={selectedInvoice}
          onClose={handleCloseDetails}
          onUpdatePayment={handleUpdatePayment}
          onRefresh={fetchInvoices}
        />
      )}

      {/* Payment Status Modal */}
      {invoiceToUpdatePayment && (
        <PaymentStatusModal
          invoice={invoiceToUpdatePayment}
          onClose={handleClosePaymentModal}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Email Input Modal */}
      {emailModalInvoice && (
        <EmailInputModal
          invoice={emailModalInvoice}
          onClose={() => setEmailModalInvoice(null)}
          onSend={handleSendEmailConfirm}
          isSending={isSendingEmail}
        />
      )}

      {/* Correction Modal */}
      {correctionInvoice && (
        <CreateCorrectionModal
          onClose={() => setCorrectionInvoice(null)}
          onSuccess={() => { setCorrectionInvoice(null); fetchInvoices(); }}
          preselectedInvoiceId={correctionInvoice.id}
        />
      )}

      {/* Edit Invoice Modal */}
      {editInvoiceId && (
        <EditInvoiceModal
          invoiceId={editInvoiceId}
          isOpen={true}
          onClose={() => setEditInvoiceId(null)}
          onSaved={() => { setEditInvoiceId(null); fetchInvoices(); }}
        />
      )}

      {/* Create Invoice Modal */}
      <CreateInvoiceModal
        isOpen={showCreateInvoice}
        onClose={() => setShowCreateInvoice(false)}
        onSuccess={fetchInvoices}
      />
    </div>
  );
}
