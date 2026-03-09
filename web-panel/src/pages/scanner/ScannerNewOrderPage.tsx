import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../../services/api';
import type { Customer } from '../../types';
import { QuickCustomerModal } from '../../components/Scanner/QuickCustomerModal';

export function ScannerNewOrderPage() {
  const navigate = useNavigate();

  // Customer selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setCustomerLoading(true);
    try {
      const result = await API.getCustomers();
      setCustomers(result.customers || []);
    } catch (err) {
      setError('Nie udało się pobrać klientów');
    } finally {
      setCustomerLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const search = customerSearch.toLowerCase();
    const companyName = (c.companyName || '').toLowerCase();
    const firstName = (c.firstName || '').toLowerCase();
    const lastName = (c.lastName || '').toLowerCase();
    const nip = String(c.nip || '');
    const customerCode = String(c.customerCode || '').toLowerCase();
    return companyName.includes(search) ||
           firstName.includes(search) ||
           lastName.includes(search) ||
           nip.includes(customerSearch) ||
           customerCode.includes(search);
  });

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setError(null);
  };

  const handleNewCustomerCreated = (customer: Customer) => {
    setCustomers(prev => [customer, ...prev]);
    setShowNewCustomerModal(false);
    selectCustomer(customer);
  };

  const handleCustomerUpdated = (customer: Customer) => {
    setCustomers(prev => prev.map(c => c.id === customer.id ? customer : c));
    setSelectedCustomer(customer);
    setShowEditCustomerModal(false);
  };

  const handleCreateOrder = async () => {
    if (!selectedCustomer) {
      setError('Wybierz klienta');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create empty order with just customer
      const orderData = {
        customerId: selectedCustomer.id,
        items: [], // Empty items - products will be added on order detail page
        source: 'scanner' as const,
      };

      const result = await API.createOrder(orderData);
      // Redirect to order detail page where user can add products
      navigate(`/scanner/orders/${result.orderId}`, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nie udało się utworzyć zamówienia');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-3 py-3">
        <h1 className="text-lg font-bold text-gray-900">Nowe zamówienie</h1>
        <p className="text-sm text-gray-500">Wybierz klienta i utworz zamówienie</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 font-bold">x</button>
        </div>
      )}

      {/* Selected Customer Banner */}
      {selectedCustomer && (
        <div className="mx-3 mt-3 p-3 bg-green-50 border-2 border-primary-500 rounded-lg">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-primary-600 font-medium">Wybrany klient:</div>
              <div className="font-bold text-green-800">
                {selectedCustomer.customerCode ? `[${selectedCustomer.customerCode}] ` : ''}
                {selectedCustomer.companyName}
              </div>
              {selectedCustomer.firstName && (
                <div className="text-sm text-primary-700">{selectedCustomer.firstName} {selectedCustomer.lastName || ''}</div>
              )}
              {selectedCustomer.nip && (
                <div className="text-xs text-primary-600">NIP: {selectedCustomer.nip}</div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-primary-600 hover:text-primary-800 text-sm font-medium"
              >
                Zmien
              </button>
              <button
                onClick={() => setShowEditCustomerModal(true)}
                className="text-gray-500 hover:text-gray-700 text-xs"
              >
                Edytuj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Search */}
      {!selectedCustomer && (
        <div className="flex-1 overflow-auto p-3">
          <div className="mb-3 flex gap-2">
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Szukaj klienta..."
              className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoFocus
            />
            <button
              onClick={() => setShowNewCustomerModal(true)}
              className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              + Nowy
            </button>
          </div>

          {customerLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              {customerSearch ? 'Brak wynikow' : 'Brak klientów w bazie'}
              <button
                onClick={() => setShowNewCustomerModal(true)}
                className="block mx-auto mt-3 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                + Dodaj kontrahenta
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => selectCustomer(customer)}
                  className="w-full bg-white rounded-lg p-3 shadow-sm border border-gray-100 text-left active:bg-gray-50 transition-colors hover:border-green-300"
                >
                  <div className="font-semibold text-gray-900 text-sm">
                    {customer.customerCode ? `[${customer.customerCode}] ` : ''}
                    {customer.companyName}
                  </div>
                  {customer.firstName && (
                    <div className="text-xs text-gray-500 mt-0.5">{customer.firstName} {customer.lastName || ''}</div>
                  )}
                  {customer.nip && (
                    <div className="text-xs text-gray-400 mt-0.5">NIP: {customer.nip}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spacer when customer is selected */}
      {selectedCustomer && <div className="flex-1" />}

      {/* Create Order Button */}
      {selectedCustomer && (
        <div className="p-3 bg-white border-t border-gray-200 safe-area-bottom">
          <button
            onClick={handleCreateOrder}
            disabled={submitting}
            className="w-full py-4 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white text-lg font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Tworzenie...</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Utwórz zamówienie</span>
              </>
            )}
          </button>
          <p className="text-center text-xs text-gray-500 mt-2">
            Po utworzeniu zamówienia będziesz mogl dodawac produkty
          </p>
        </div>
      )}

      {/* Quick Customer Modal */}
      {showNewCustomerModal && (
        <QuickCustomerModal
          onClose={() => setShowNewCustomerModal(false)}
          onCustomerCreated={handleNewCustomerCreated}
        />
      )}

      {showEditCustomerModal && selectedCustomer && (
        <QuickCustomerModal
          onClose={() => setShowEditCustomerModal(false)}
          onCustomerCreated={handleCustomerUpdated}
          editCustomer={selectedCustomer}
        />
      )}
    </div>
  );
}
