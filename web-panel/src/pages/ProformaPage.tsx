import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { parsePrice } from '../utils/priceUtils';
import { Proforma, PaymentMethod, Customer, Order, Product } from '../types';

// Stats type definition
interface ProformaStats {
  total: number;
  byStatus: {
    draft: number;
    sent: number;
    accepted: number;
    expired: number;
    converted: number;
  };
  conversionRate: number;
  totalValue: number;
  convertedValue: number;
  averageConversionTimeDays: number | null;
  last30Days: {
    total: number;
    converted: number;
    totalValue: number;
    convertedValue: number;
  };
}

interface ProformaItem {
  description: string;
  quantity: number;
  unitPriceNet: number;
  vatRate: number;
}

export function ProformaPage() {
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProforma, setSelectedProforma] = useState<Proforma | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [proformaToConvert, setProformaToConvert] = useState<Proforma | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selection state for mass print
  const [selectedProformas, setSelectedProformas] = useState<number[]>([]);

  // Create proforma modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'standalone' | 'fromOrder'>('standalone');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [proformaItems, setProformaItems] = useState<ProformaItem[]>([]);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Convert modal state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFER);
  const [paymentDeadline, setPaymentDeadline] = useState('');
  const [converting, setConverting] = useState(false);

  // Stats state
  const [stats, setStats] = useState<ProformaStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);

  // Notifications state
  const [expiringProformas, setExpiringProformas] = useState<Proforma[]>([]);
  const [expiredProformas, setExpiredProformas] = useState<Proforma[]>([]);
  const [showExpiringList, setShowExpiringList] = useState(false);
  const [showExpiredList, setShowExpiredList] = useState(false);

  const fetchProformas = async () => {
    try {
      setLoading(true);
      const filters: { startDate?: string; endDate?: string } = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const data = await api.getProformas(filters);
      setProformas(data.proformas || []);
    } catch (error) {
      console.error('Error fetching proformas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const [expiringData, expiredData] = await Promise.all([
        api.getExpiringProformas(7),
        api.getExpiredProformas()
      ]);
      setExpiringProformas(expiringData.proformas || []);
      setExpiredProformas(expiredData.proformas || []);
    } catch (error) {
      console.error('Error fetching proforma notifications:', error);
    }
  };

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const data = await api.getProformaStats();
      setStats(data);
    } catch (error) {
      console.error("Error fetching proforma stats:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await api.getCustomers();
      setCustomers(data.customers || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const data = await api.getOrders();
      // Filter to only show orders that don't have invoices yet
      setOrders(data.orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await api.getInventory();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  useEffect(() => {
    fetchProformas();
    fetchStats();
    fetchNotifications();
  }, []);

  const handleFilter = () => {
    fetchProformas();
    fetchStats();
  };

  const handleClearFilter = () => {
    setStartDate('');
    setEndDate('');
    setTimeout(() => fetchProformas(), 0);
  };

  const handleViewDetails = (proforma: Proforma) => {
    setSelectedProforma(proforma);
  };

  const handleCloseDetails = () => {
    setSelectedProforma(null);
  };

  const handleOpenCreateModal = () => {
    fetchCustomers();
    fetchOrders();
    fetchProducts();
    // Set default validUntil to 14 days from now
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setValidUntil(defaultDate.toISOString().split('T')[0]);
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setCreateMode('standalone');
    setSelectedCustomerId(null);
    setSelectedOrderId(null);
    setProformaItems([]);
    setValidUntil('');
    setNotes('');
  };

  const handleAddItem = () => {
    setProformaItems([...proformaItems, { description: '', quantity: 1, unitPriceNet: 0, vatRate: 8 }]);
  };

  const handleRemoveItem = (index: number) => {
    setProformaItems(proformaItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ProformaItem, value: string | number) => {
    const newItems = [...proformaItems];
    (newItems[index] as any)[field] = value;
    setProformaItems(newItems);
  };

  const handleAddProductAsItem = (product: Product) => {
    setProformaItems([
      ...proformaItems,
      {
        description: `${product.plantName}${product.potSize ? ' ' + product.potSize : ''}`,
        quantity: 1,
        unitPriceNet: product.basePriceGross / 1.08, // Convert from gross to net (assuming 8% VAT)
        vatRate: 8
      }
    ]);
  };

  const handleCreateProforma = async () => {
    try {
      setCreating(true);

      if (createMode === 'fromOrder') {
        if (!selectedOrderId) {
          alert('Wybierz zamówienie');
          return;
        }
        await api.createProformaFromOrder(selectedOrderId, {
          validUntil: validUntil || undefined,
          notes: notes || undefined
        });
      } else {
        if (!selectedCustomerId) {
          alert('Wybierz klienta');
          return;
        }
        if (proformaItems.length === 0) {
          alert('Dodaj przynajmniej jedną pozycję');
          return;
        }
        await api.createProforma({
          customerId: selectedCustomerId,
          items: proformaItems,
          validUntil: validUntil || undefined,
          notes: notes || undefined
        });
      }

      alert('Faktura pro forma została utworzona');
      handleCloseCreateModal();
      fetchProformas();
    fetchStats();
    } catch (error: any) {
      console.error('Create error:', error);
      alert(error.response?.data?.error || 'Błąd podczas tworzenia faktury pro forma');
    } finally {
      setCreating(false);
    }
  };

  const handleConvertClick = (proforma: Proforma) => {
    setProformaToConvert(proforma);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);
    setPaymentDeadline(deadline.toISOString().split('T')[0]);
    setShowConvertModal(true);
  };

  const handleConvert = async () => {
    if (!proformaToConvert || !paymentDeadline) return;

    try {
      setConverting(true);
      await api.convertProformaToInvoice(proformaToConvert.id, {
        paymentMethod,
        paymentDeadline
      });
      alert('Faktura pro forma została przekonwertowana na fakturę VAT');
      setShowConvertModal(false);
      setProformaToConvert(null);
      fetchProformas();
    fetchStats();
    } catch (error: any) {
      console.error('Convert error:', error);
      alert(error.response?.data?.error || 'Błąd podczas konwersji');
    } finally {
      setConverting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Czy na pewno chcesz usunąć tę fakturę pro forma?')) return;

    try {
      await api.deleteProforma(id);
      fetchProformas();
    fetchStats();
    } catch (error: any) {
      console.error('Delete error:', error);
      alert(error.response?.data?.error || 'Błąd podczas usuwania');
    }
  };

  const handleClone = async (id: number) => {
    try {
      const result = await api.cloneProforma(id);
      alert(result.message || "Faktura pro forma zostala sklonowana");
      fetchProformas();
    fetchStats();
    } catch (error: any) {
      console.error("Clone error:", error);
      alert(error.response?.data?.error || "Błąd podczas klonowania");
    }
  };

  // Selection handlers for mass print
  const handleSelectProforma = (id: number) => {
    setSelectedProformas(prev =>
      prev.includes(id)
        ? prev.filter(pid => pid !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedProformas.length === proformas.length) {
      setSelectedProformas([]);
    } else {
      setSelectedProformas(proformas.map(p => p.id));
    }
  };

  const handlePrintSelected = () => {
    if (selectedProformas.length === 0) {
      alert('Wybierz przynajmniej jedną pro formę do druku');
      return;
    }
    // Open each selected proforma in print view
    selectedProformas.forEach((id, index) => {
      setTimeout(() => {
        window.open('/print/proforma/' + id, '_blank');
      }, index * 300); // Stagger opening to avoid browser blocking
    });
  };

  const handlePrintSingle = (id: number) => {
    window.open('/print/proforma/' + id, '_blank');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL');
  };

  const calculateItemTotal = (item: ProformaItem) => {
    const net = item.quantity * item.unitPriceNet;
    const vat = net * (item.vatRate / 100);
    return { net, vat, gross: net + vat };
  };

  const calculateTotals = () => {
    return proformaItems.reduce(
      (acc, item) => {
        const itemTotals = calculateItemTotal(item);
        return {
          net: acc.net + itemTotals.net,
          vat: acc.vat + itemTotals.vat,
          gross: acc.gross + itemTotals.gross
        };
      },
      { net: 0, vat: 0, gross: 0 }
    );
  };

  return (
    <div className="space-y-6 px-3 py-2">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Faktury Pro Forma</h1>
        <button onClick={handleOpenCreateModal} className="btn btn-primary">
          + Nowa Pro Forma
        </button>
      </div>

      {/* Notifications */}
      {(expiringProformas.length > 0 || expiredProformas.length > 0) && (
        <div className="space-y-3">
          {/* Expiring soon banner */}
          {expiringProformas.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-yellow-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-yellow-800 font-medium">
                    {expiringProformas.length} {expiringProformas.length === 1 ? 'proforma wygasa' : 'proform wygasa'} w ciagu 7 dni
                  </span>
                </div>
                <button
                  onClick={() => setShowExpiringList(!showExpiringList)}
                  className="text-yellow-700 hover:text-yellow-900 font-medium text-sm"
                >
                  {showExpiringList ? 'Ukryj' : 'Pokaz'}
                </button>
              </div>
              {showExpiringList && (
                <div className="mt-3 border-t border-yellow-200 pt-3">
                  <ul className="space-y-2">
                    {expiringProformas.map(p => (
                      <li key={p.id} className="flex justify-between items-center text-sm text-yellow-800">
                        <span>{p.invoiceNumber} - {p.customerName || 'Brak klienta'}</span>
                        <span>Wygasa: {p.validUntil ? new Date(p.validUntil).toLocaleDateString('pl-PL') : '-'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Expired banner */}
          {expiredProformas.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-red-800 font-medium">
                    {expiredProformas.length} {expiredProformas.length === 1 ? 'proforma wygasla' : 'proform wygaslo'}
                  </span>
                </div>
                <button
                  onClick={() => setShowExpiredList(!showExpiredList)}
                  className="text-red-700 hover:text-red-900 font-medium text-sm"
                >
                  {showExpiredList ? 'Ukryj' : 'Pokaz'}
                </button>
              </div>
              {showExpiredList && (
                <div className="mt-3 border-t border-red-200 pt-3">
                  <ul className="space-y-2">
                    {expiredProformas.map(p => (
                      <li key={p.id} className="flex justify-between items-center text-sm text-red-800">
                        <span>{p.invoiceNumber} - {p.customerName || 'Brak klienta'}</span>
                        <span>Wygasla: {p.validUntil ? new Date(p.validUntil).toLocaleDateString('pl-PL') : '-'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      
      {/* Statistics Section */}
      {stats && (
        <div className="card mb-6">
          <button
            onClick={() => setShowStats(!showStats)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="font-semibold text-gray-900">Statystyki Konwersji</span>
            </div>
            <svg
              className={`w-5 h-5 text-gray-500 transform transition-transform ${showStats ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showStats && (
            <div className="px-4 pb-4 pt-2 border-t">
              {/* Main metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* Total */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500 p-2 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-blue-600 font-medium">Wszystkie proformy</p>
                      <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
                    </div>
                  </div>
                </div>

                {/* Conversion Rate */}
                <div className="bg-gradient-to-br from-primary-50 to-primary-100 p-4 rounded-xl border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary-500 p-2 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-primary-600 font-medium">Wspolczynnik konwersji</p>
                      <p className="text-2xl font-bold text-primary-900">{stats.conversionRate.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>

                {/* Total Value */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-4 rounded-xl border border-amber-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-500 p-2 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-amber-600 font-medium">Suma wartośći</p>
                      <p className="text-xl font-bold text-amber-900">{stats.totalValue.toFixed(2)} PLN</p>
                    </div>
                  </div>
                </div>

                {/* Converted Value */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-500 p-2 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-purple-600 font-medium">Przekonwertowane</p>
                      <p className="text-xl font-bold text-purple-900">{stats.convertedValue.toFixed(2)} PLN</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="p-3 rounded-lg border-2 bg-gray-100 text-gray-800 border-gray-300 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-75">Szkice</p>
                  <p className="text-2xl font-bold mt-1">{stats.byStatus.draft}</p>
                </div>
                <div className="p-3 rounded-lg border-2 bg-blue-100 text-blue-800 border-blue-300 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-75">Wyslane</p>
                  <p className="text-2xl font-bold mt-1">{stats.byStatus.sent}</p>
                </div>
                <div className="p-3 rounded-lg border-2 bg-green-100 text-green-800 border-green-300 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-75">Zaakceptowane</p>
                  <p className="text-2xl font-bold mt-1">{stats.byStatus.accepted}</p>
                </div>
                <div className="p-3 rounded-lg border-2 bg-red-100 text-red-800 border-red-300 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-75">Wygasle</p>
                  <p className="text-2xl font-bold mt-1">{stats.byStatus.expired}</p>
                </div>
                <div className="p-3 rounded-lg border-2 bg-purple-100 text-purple-800 border-purple-300 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide opacity-75">Przekonwertowane</p>
                  <p className="text-2xl font-bold mt-1">{stats.byStatus.converted}</p>
                </div>
              </div>

              {/* Additional info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <p className="text-sm text-gray-600 font-medium mb-1">Sredni czas konwersji</p>
                  <p className="text-xl font-bold text-gray-900">
                    {stats.averageConversionTimeDays !== null 
                      ? `${stats.averageConversionTimeDays} dni`
                      : 'Brak danych'}
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border">
                  <p className="text-sm text-gray-600 font-medium mb-2">Ostatnie 30 dni</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Proformy:</span>
                      <span className="font-semibold ml-1">{stats.last30Days.total}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Przekonwertowane:</span>
                      <span className="font-semibold ml-1">{stats.last30Days.converted}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Wartość:</span>
                      <span className="font-semibold ml-1">{stats.last30Days.totalValue.toFixed(2)} PLN</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Skonwertowane:</span>
                      <span className="font-semibold ml-1">{stats.last30Days.convertedValue.toFixed(2)} PLN</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Ładowanie...</p>
        </div>
      ) : proformas.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Brak faktur pro forma</p>
          <button onClick={handleOpenCreateModal} className="btn btn-primary mt-4">
            Utwórz pierwszą pro formę
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <p>Znaleziono: {proformas.length} faktur pro forma</p>
              {selectedProformas.length > 0 && (
                <button
                  onClick={handlePrintSelected}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Drukuj wybrane ({selectedProformas.length})
                </button>
              )}
            </div>
            <div className="space-x-4">
              <span>
                <strong>Suma netto:</strong>{' '}
                {proformas.reduce((sum, pf) => sum + (pf.subtotalNet || 0), 0).toFixed(2)} PLN
              </span>
              <span>
                <strong>Suma brutto:</strong>{' '}
                {proformas.reduce((sum, pf) => sum + (pf.totalGross || 0), 0).toFixed(2)} PLN
              </span>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedProformas.length === proformas.length && proformas.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Numer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Klient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data wystawienia
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ważna do
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Netto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Brutto
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {proformas.map((proforma) => (
                  <tr key={proforma.id} className={`hover:bg-gray-50 ${selectedProformas.includes(proforma.id) ? 'bg-primary-50' : ''}`}>
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedProformas.includes(proforma.id)}
                        onChange={() => handleSelectProforma(proforma.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {proforma.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {proforma.customerName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(proforma.issueDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {proforma.validUntil ? formatDate(proforma.validUntil) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {(proforma.subtotalNet || 0).toFixed(2)} PLN
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                      {(proforma.totalGross || 0).toFixed(2)} PLN
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => handlePrintSingle(proforma.id)}
                        className="text-blue-600 hover:text-blue-800 mr-3"
                        title="Drukuj / Podgląd"
                      >
                        Drukuj
                      </button>
                      <button
                        onClick={() => handleViewDetails(proforma)}
                        className="text-primary-600 hover:text-primary-800 mr-3"
                      >
                        Szczegóły
                      </button>
                      <button
                        onClick={() => handleClone(proforma.id)}
                        className="text-emerald-600 hover:text-emerald-800 mr-3"
                        title="Klonuj pro forme"
                      >
                        Klonuj
                      </button>
                      <button
                        onClick={() => handleConvertClick(proforma)}
                        className="text-primary-600 hover:text-primary-800 mr-3"
                        title="Konwertuj na fakturę VAT"
                      >
                        Faktura
                      </button>
                      <button
                        onClick={() => handleDelete(proforma.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Usuń
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create Proforma Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Nowa Faktura Pro Forma</h2>
              <button
                onClick={handleCloseCreateModal}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Mode Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sposób utworzenia
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="standalone"
                    checked={createMode === 'standalone'}
                    onChange={() => setCreateMode('standalone')}
                    className="mr-2"
                  />
                  <span>Samodzielna pro forma</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="fromOrder"
                    checked={createMode === 'fromOrder'}
                    onChange={() => setCreateMode('fromOrder')}
                    className="mr-2"
                  />
                  <span>Z zamówienia</span>
                </label>
              </div>
            </div>

            {createMode === 'fromOrder' ? (
              /* From Order Mode */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wybierz zamówienie
                  </label>
                  <select
                    className="input w-full"
                    value={selectedOrderId || ''}
                    onChange={(e) => setSelectedOrderId(Number(e.target.value) || null)}
                  >
                    <option value="">-- Wybierz zamówienie --</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNumber} - {order.customerName || 'Brak klienta'} - {order.totalAmount.toFixed(2)} PLN
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              /* Standalone Mode */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Klient
                  </label>
                  <select
                    className="input w-full"
                    value={selectedCustomerId || ''}
                    onChange={(e) => setSelectedCustomerId(Number(e.target.value) || null)}
                  >
                    <option value="">-- Wybierz klienta --</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.customerCode ? `[${customer.customerCode}] ` : ""}{customer.companyName || `${customer.firstName} ${customer.lastName}`}
                        {customer.nip ? ` (NIP: ${customer.nip})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Items */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Pozycje
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="input text-sm"
                        onChange={(e) => {
                          const product = products.find(p => p.id === Number(e.target.value));
                          if (product) handleAddProductAsItem(product);
                          e.target.value = '';
                        }}
                        defaultValue=""
                      >
                        <option value="">+ Dodaj z magazynu</option>
                        {products.slice(0, 50).map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.plantName} {product.potSize || ''} - {(Number(product.basePriceGross) || 0).toFixed(2)} PLN
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="btn btn-secondary btn-sm"
                      >
                        + Dodaj ręcznie
                      </button>
                    </div>
                  </div>

                  {proformaItems.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4 text-center border border-dashed rounded">
                      Dodaj pozycje do faktury pro forma
                    </p>
                  ) : (
                    <div className="border rounded overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Opis</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-20">Ilość</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-28">Cena netto</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-20">VAT %</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-28">Wartość</th>
                            <th className="px-3 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {proformaItems.map((item, index) => {
                            const totals = calculateItemTotal(item);
                            return (
                              <tr key={index}>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    className="input w-full text-sm"
                                    placeholder="Opis pozycji"
                                    value={item.description}
                                    onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    className="input w-full text-sm text-center"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    className="input w-full text-sm text-right"
                                    step="0.01"
                                    min="0"
                                    value={item.unitPriceNet}
                                    onChange={(e) => handleItemChange(index, 'unitPriceNet', parsePrice(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <select
                                    className="input w-full text-sm"
                                    value={item.vatRate}
                                    onChange={(e) => handleItemChange(index, 'vatRate', Number(e.target.value))}
                                  >
                                    <option value="0">0%</option>
                                    <option value="5">5%</option>
                                    <option value="8">8%</option>
                                    <option value="23">23%</option>
                                  </select>
                                </td>
                                <td className="px-3 py-2 text-right text-sm font-medium">
                                  {(Number(totals.gross) || 0).toFixed(2)} PLN
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(index)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-right text-sm font-medium">
                              Suma netto:
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium">
                              {calculateTotals().net.toFixed(2)} PLN
                            </td>
                            <td></td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-right text-sm font-medium">
                              VAT:
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-medium">
                              {calculateTotals().vat.toFixed(2)} PLN
                            </td>
                            <td></td>
                          </tr>
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-right text-sm font-bold">
                              Suma brutto:
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-bold text-primary-600">
                              {calculateTotals().gross.toFixed(2)} PLN
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Common fields */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ważna do
                </label>
                <input
                  type="date"
                  className="input w-full"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notatki
                </label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Opcjonalne notatki"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateProforma}
                disabled={creating}
                className="btn btn-primary flex-1"
              >
                {creating ? 'Tworzenie...' : 'Utwórz Pro Formę'}
              </button>
              <button
                onClick={handleCloseCreateModal}
                className="btn btn-secondary"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedProforma && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Faktura Pro Forma {selectedProforma.invoiceNumber}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Wystawiono: {formatDate(selectedProforma.issueDate)}
                </p>
              </div>
              <button
                onClick={handleCloseDetails}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="card p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Dane nabywcy</h3>
                <p className="text-gray-700">{selectedProforma.customerName || 'Brak danych'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Ważność</h3>
                  <p className="text-gray-700">
                    {selectedProforma.validUntil
                      ? formatDate(selectedProforma.validUntil)
                      : 'Nie określono'}
                  </p>
                </div>
                <div className="card p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Powiązania</h3>
                  {selectedProforma.orderId && (
                    <p className="text-gray-700">Zamówienie: #{selectedProforma.orderId}</p>
                  )}
                  {!selectedProforma.orderId && (
                    <p className="text-gray-500">Brak powiązań</p>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Suma netto:</span>
                    <span className="font-medium">{(selectedProforma.subtotalNet || 0).toFixed(2)} PLN</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">VAT:</span>
                    <span className="font-medium">{(selectedProforma.totalVat || 0).toFixed(2)} PLN</span>
                  </div>
                  <div className="border-t border-gray-300 pt-2 flex justify-between text-xl font-bold">
                    <span>Suma brutto:</span>
                    <span className="text-primary-600">{(selectedProforma.totalGross || 0).toFixed(2)} PLN</span>
                  </div>
                </div>
              </div>

              {selectedProforma.notes && (
                <div className="card p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Notatki</h3>
                  <p className="text-gray-700">{selectedProforma.notes}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => handlePrintSingle(selectedProforma.id)}
                  className="btn bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Drukuj
                </button>
                <button
                  onClick={() => {
                    handleCloseDetails();
                    handleConvertClick(selectedProforma);
                  }}
                  className="btn btn-primary"
                >
                  Konwertuj na fakturę VAT
                </button>
                <button onClick={handleCloseDetails} className="btn btn-secondary flex-1">
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Convert Modal */}
      {showConvertModal && proformaToConvert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Konwertuj na fakturę VAT
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Pro forma: <strong>{proformaToConvert.invoiceNumber}</strong>
              <br />
              Klient: <strong>{proformaToConvert.customerName}</strong>
              <br />
              Kwota: <strong>{(proformaToConvert.totalGross || 0).toFixed(2)} PLN</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Metoda płatności
                </label>
                <select
                  className="input w-full"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value={PaymentMethod.TRANSFER}>Przelew</option>
                  <option value={PaymentMethod.CASH}>Gotówka</option>
                  <option value={PaymentMethod.CARD}>Karta</option>
                </select>
              </div>

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
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleConvert}
                disabled={converting || !paymentDeadline}
                className="btn btn-primary flex-1"
              >
                {converting ? 'Konwertowanie...' : 'Utwórz fakturę VAT'}
              </button>
              <button
                onClick={() => {
                  setShowConvertModal(false);
                  setProformaToConvert(null);
                }}
                className="btn btn-secondary"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
