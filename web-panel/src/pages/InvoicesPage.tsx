import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Invoice } from '../types';
import { InvoicesTable } from '../components/Invoices/InvoicesTable';
import { InvoiceDetails } from '../components/Invoices/InvoiceDetails';
import { PaymentStatusModal } from '../components/Invoices/PaymentStatusModal';

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [invoiceToUpdatePayment, setInvoiceToUpdatePayment] = useState<Invoice | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const filters: { startDate?: string; endDate?: string } = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

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

  const handleFilter = () => {
    fetchInvoices();
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setTimeout(() => fetchInvoices(), 0);
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
    if (selectedInvoices.length === invoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(invoices.map(inv => inv.id));
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Faktury</h1>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              Zaznaczono <strong>{selectedInvoices.length}</strong> z {invoices.length} faktur
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
          <p className="text-gray-500">Ładowanie...</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center text-sm text-gray-600">
            <p>Znaleziono: {invoices.length} faktur</p>
            <div className="space-x-4">
              <span>
                <strong>Suma netto:</strong>{' '}
                {(invoices.reduce((sum, inv) => sum + (Number(inv.subtotalNet) || 0), 0)).toFixed(2)} PLN
              </span>
              <span>
                <strong>Suma brutto:</strong>{' '}
                {(invoices.reduce((sum, inv) => sum + (Number(inv.totalGross) || 0), 0)).toFixed(2)} PLN
              </span>
            </div>
          </div>
          <InvoicesTable
            invoices={invoices}
            onViewDetails={handleViewDetails}
            onUpdatePayment={handleUpdatePayment}
            selectedInvoices={selectedInvoices}
            onSelectInvoice={handleSelectInvoice}
            onSelectAll={handleSelectAll}
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
