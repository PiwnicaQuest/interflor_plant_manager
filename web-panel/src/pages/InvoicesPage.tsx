import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Invoice } from '../types';
import { InvoicesTable } from '../components/Invoices/InvoicesTable';
import { InvoiceDetails } from '../components/Invoices/InvoiceDetails';
import { PaymentStatusModal } from '../components/Invoices/PaymentStatusModal';

export type SortField = 'invoiceNumber' | 'customerName' | 'issueDate' | 'paymentDeadline' | 'paymentStatus' | 'totalGross';
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

  // New: Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('issueDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);

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

    // Filter by search query (customer name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(invoice =>
        (invoice.customerName || '').toLowerCase().includes(query) ||
        (invoice.invoiceNumber || '').toLowerCase().includes(query) ||
        (invoice.buyerSnapshot?.customerCode || '').toLowerCase().includes(query)
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
  }, [invoices, searchQuery, sortField, sortOrder]);

  const handleFilter = () => {
    fetchInvoices();
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setPaymentStatusFilter('');
    setPaymentMethodFilter('');
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

  // Send invoice by email
  const handleSendEmail = async (invoice: Invoice) => {
    if (!invoice.buyerSnapshot?.email) {
      alert('Brak adresu email klienta');
      return;
    }

    if (!confirm(`Czy na pewno chcesz wyslac fakture ${invoice.invoiceNumber} na adres ${invoice.buyerSnapshot.email}?`)) {
      return;
    }

    setSendingEmailId(invoice.id);
    try {
      const result = await api.sendInvoiceEmail(invoice.id);
      if (result.success) {
        alert('Faktura zostala wyslana na adres ' + invoice.buyerSnapshot.email);
      } else {
        alert('Blad wysylania: ' + result.message);
      }
    } catch (error) {
      console.error('Error sending invoice email:', error);
      alert('Wystapil blad podczas wysylania faktury');
    } finally {
      setSendingEmailId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Faktury</h1>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
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
          <div className="flex items-end gap-2">
            <button onClick={handleFilter} className="btn btn-primary">
              Filtruj
            </button>
            <button onClick={handleClearFilter} className="btn btn-secondary">
              Wyczysc
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
                onClick={handlePrintSelected}
                className="btn btn-primary btn-sm"
              >
                Drukuj ({selectedInvoices.length})
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
          <p className="text-gray-500">Ladowanie...</p>
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
    </div>
  );
}
