import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Product, InventoryMovement, Order, Customer } from '../../types';
import { api } from '../../services/api';

interface ProductDistributionPanelProps {
  product: Product | null;
  onClose: () => void;
  onAddToOrder: (product: Product, quantity: number, customerId: number) => Promise<void>;
  onAddToExistingOrder: (product: Product, quantity: number, orderId: number) => Promise<void>;
}

interface ProductOrderInfo {
  id: number;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  completedAt: string | null;
  customerName: string | null;
  customerCode: string | null;
  productQuantity: number;
  productUnitPrice: number;
  productTotalPrice: number;
}

export function ProductDistributionPanel({ product, onClose, onAddToOrder, onAddToExistingOrder }: ProductDistributionPanelProps) {
  const navigate = useNavigate();
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productOrders, setProductOrders] = useState<ProductOrderInfo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'movements' | 'orders'>('movements');
  const [orderMode, setOrderMode] = useState<'new' | 'existing'>('new');

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);

  // Existing order search state
  const [orderSearch, setOrderSearch] = useState('');

  useEffect(() => {
    if (product) {
      loadData();
      setSuccessMessage(null);
    }
  }, [product?.id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    if (!product) return;
    setLoading(true);
    try {
      const [movementsRes, ordersRes, customersRes, productOrdersRes] = await Promise.all([
        api.getProductMovements(product.id, 20),
        api.getOrders(),
        api.getCustomers(),
        api.getOrdersByProduct(product.id, 50),
      ]);

      const movementsData = movementsRes.movements || [];
      setMovements(movementsData);
      const allOrders = ordersRes.orders || [];
      setOrders(allOrders);
      setCustomers(customersRes.customers || []);
      setProductOrders(productOrdersRes.orders || []);
    } catch (error) {
      console.error('Error loading distribution data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtered customers based on search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 10); // Show first 10 when empty
    const searchLower = customerSearch.toLowerCase();
    return customers.filter(c => {
      const companyName = (c.companyName || '').toLowerCase();
      const fullName = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
      const code = (c.customerCode || '').toLowerCase();
      return companyName.includes(searchLower) || fullName.includes(searchLower) || code.includes(searchLower);
    }).slice(0, 15); // Limit results
  }, [customers, customerSearch]);

  // Get selected customer display name
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Filter orders that can be edited (not completed/cancelled)
  const editableOrders = useMemo(() => {
    return orders.filter(o =>
      o.status === 'pending' || o.status === 'in_progress' || o.status === 'ready_for_pickup'
    );
  }, [orders]);

  // Filtered editable orders based on search
  const filteredEditableOrders = useMemo(() => {
    if (!orderSearch.trim()) return editableOrders;
    const searchLower = orderSearch.toLowerCase();
    return editableOrders.filter(o => {
      const orderNumber = (o.orderNumber || '').toLowerCase();
      const customerName = (o.customerName || '').toLowerCase();
      const customerCode = (o.customerCode || '').toLowerCase();
      return orderNumber.includes(searchLower) || customerName.includes(searchLower) || customerCode.includes(searchLower);
    });
  }, [editableOrders, orderSearch]);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  };

  const handleClearCustomer = () => {
    setSelectedCustomerId(null);
    setCustomerSearch('');
  };

  const handleAddToNewOrder = async () => {
    if (!product || !selectedCustomerId || quantity <= 0) return;

    setAdding(true);
    setSuccessMessage(null);
    try {
      await onAddToOrder(product, quantity, selectedCustomerId);
      const customer = customers.find(c => c.id === selectedCustomerId);
      setSuccessMessage(`Dodano ${quantity} szt. do nowego zamowienia dla ${customer?.companyName || customer?.firstName || 'klienta'}`);
      setQuantity(1);
      loadData();
    } catch (error) {
      console.error('Error adding to order:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleAddToExisting = async () => {
    if (!product || !selectedOrderId || quantity <= 0) return;

    setAdding(true);
    setSuccessMessage(null);
    try {
      await onAddToExistingOrder(product, quantity, selectedOrderId);
      const order = orders.find(o => o.id === selectedOrderId);
      setSuccessMessage(`Dodano ${quantity} szt. do zamowienia ${order?.orderNumber || '#' + selectedOrderId}`);
      setQuantity(1);
      loadData();
    } catch (error) {
      console.error('Error adding to existing order:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleOrderClick = (orderId: number) => {
    navigate(`/orders?orderId=${orderId}`);
  };

  if (!product) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  const getMovementTypeLabel = (type: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      purchase: { text: 'Zakup', color: 'bg-green-100 text-green-800' },
      sale: { text: 'Sprzedaz', color: 'bg-blue-100 text-blue-800' },
      return: { text: 'Zwrot', color: 'bg-yellow-100 text-yellow-800' },
      correction: { text: 'Korekta', color: 'bg-gray-100 text-gray-800' },
      loss: { text: 'Strata', color: 'bg-red-100 text-red-800' },
      reservation: { text: 'Rezerwacja', color: 'bg-purple-100 text-purple-800' },
    };
    return labels[type] || { text: type, color: 'bg-gray-100 text-gray-800' };
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      pending: { text: 'Oczekuje', color: 'bg-yellow-100 text-yellow-800' },
      in_progress: { text: 'W realizacji', color: 'bg-blue-100 text-blue-800' },
      ready_for_pickup: { text: 'Do odbioru', color: 'bg-purple-100 text-purple-800' },
      completed: { text: 'Zakonczone', color: 'bg-green-100 text-green-800' },
      cancelled: { text: 'Anulowane', color: 'bg-red-100 text-red-800' },
    };
    return labels[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
  };

  // Calculate stats from product orders
  const totalSold = productOrders.reduce((sum, o) => sum + (o.productQuantity || 0), 0);
  const uniqueOrders = productOrders.length;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-primary-500 shadow-lg z-40 transition-all duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-lg">{product.plantName}</span>
          <span className="text-primary-200 text-sm">|</span>
          <span className="text-sm">Stan: <strong>{product.totalUnits}</strong> szt.</span>
          <span className="text-sm">Sprzedano: <strong>{product.totalSold || 0}</strong> szt.</span>
          <span className="text-sm">Cena: <strong>{product.basePriceGross?.toFixed(2) || '-'} zl</strong></span>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
          title="Zamknij panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex" style={{ maxHeight: '300px' }}>
        {/* Left: Add to order */}
        <div className="w-96 border-r bg-gray-50 p-3 flex flex-col">
          <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <span>🛒</span> Dodaj do zamowienia
          </h3>

          {successMessage && (
            <div className="bg-green-100 border border-green-300 text-green-800 px-2 py-1 rounded text-sm mb-2">
              ✓ {successMessage}
            </div>
          )}

          {/* Mode tabs */}
          <div className="flex gap-1 mb-2 bg-gray-200 rounded p-0.5">
            <button
              onClick={() => setOrderMode('new')}
              className={`flex-1 py-1 px-2 text-xs font-medium rounded transition-colors ${
                orderMode === 'new'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              + Nowe zamowienie
            </button>
            <button
              onClick={() => setOrderMode('existing')}
              className={`flex-1 py-1 px-2 text-xs font-medium rounded transition-colors ${
                orderMode === 'existing'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Istniejace ({editableOrders.length})
            </button>
          </div>

          <div className="space-y-2 flex-1 overflow-auto">
            {orderMode === 'new' ? (
              /* New order form */
              <>
                <div ref={customerSearchRef} className="relative">
                  <label className="text-xs text-gray-600 block mb-1">Klient</label>
                  {selectedCustomer ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 border rounded text-sm bg-primary-50 border-primary-200">
                      <span className="flex-1 truncate">
                        {selectedCustomer.customerCode ? `[${selectedCustomer.customerCode}] ` : ''}
                        {selectedCustomer.companyName || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`}
                      </span>
                      <button
                        onClick={handleClearCustomer}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Wyczysc"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        placeholder="Wpisz nazwe lub kod klienta..."
                        className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                      />
                      {showCustomerDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
                          {filteredCustomers.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              {customerSearch ? 'Nie znaleziono klientow' : 'Brak klientow'}
                            </div>
                          ) : (
                            filteredCustomers.map(c => (
                              <div
                                key={c.id}
                                onClick={() => handleSelectCustomer(c)}
                                className="px-3 py-2 cursor-pointer hover:bg-primary-50 transition-colors border-b last:border-b-0"
                              >
                                <div className="text-sm font-medium text-gray-900">
                                  {c.customerCode ? `[${c.customerCode}] ` : ''}
                                  {c.companyName || `${c.firstName} ${c.lastName}`}
                                </div>
                                {c.city && (
                                  <div className="text-xs text-gray-500">{c.city}</div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-600 block mb-1">Ilosc (max: {product.totalUnits})</label>
                  <input
                    type="number"
                    min={1}
                    max={product.totalUnits}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(Math.max(1, Number(e.target.value)), product.totalUnits))}
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div className="text-xs text-gray-500">
                  Wartosc: <strong>{(quantity * (product.basePriceGross || 0)).toFixed(2)} zl</strong>
                </div>

                <button
                  onClick={handleAddToNewOrder}
                  disabled={!selectedCustomerId || quantity <= 0 || adding}
                  className="w-full bg-primary-600 text-white py-2 rounded font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {adding ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Dodawanie...
                    </>
                  ) : (
                    <>Utworz zamowienie</>
                  )}
                </button>
              </>
            ) : (
              /* Existing order selection */
              <>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Szukaj zamowienia</label>
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Nr zamowienia, nazwa lub kod klienta..."
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 mb-2"
                  />
                  {editableOrders.length === 0 ? (
                    <div className="text-sm text-gray-500 py-2 text-center bg-gray-100 rounded">
                      Brak aktywnych zamowien
                    </div>
                  ) : filteredEditableOrders.length === 0 ? (
                    <div className="text-sm text-gray-500 py-2 text-center bg-gray-100 rounded">
                      Nie znaleziono zamowien
                    </div>
                  ) : (
                    <div className="max-h-28 overflow-auto border rounded bg-white">
                      {filteredEditableOrders.map(o => {
                        const statusInfo = getStatusLabel(o.status);
                        return (
                          <div
                            key={o.id}
                            onClick={() => setSelectedOrderId(o.id)}
                            className={`px-2 py-1.5 cursor-pointer border-b last:border-b-0 transition-colors ${
                              selectedOrderId === o.id
                                ? 'bg-primary-50 border-primary-200'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm text-primary-700">{o.orderNumber}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>
                                {statusInfo.text}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>{o.customerCode ? `[${o.customerCode}] ` : ""}{o.customerName || "-"}</span>
                              <span>{formatDateShort(o.createdAt)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {orderSearch && filteredEditableOrders.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Znaleziono: {filteredEditableOrders.length} z {editableOrders.length}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-600 block mb-1">Ilosc (max: {product.totalUnits})</label>
                  <input
                    type="number"
                    min={1}
                    max={product.totalUnits}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(Math.max(1, Number(e.target.value)), product.totalUnits))}
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div className="text-xs text-gray-500">
                  Wartosc: <strong>{(quantity * (product.basePriceGross || 0)).toFixed(2)} zl</strong>
                </div>

                <button
                  onClick={handleAddToExisting}
                  disabled={!selectedOrderId || quantity <= 0 || adding}
                  className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {adding ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Dodawanie...
                    </>
                  ) : (
                    <>Dodaj do zamowienia</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right: History tabs */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b bg-gray-50">
            <button
              onClick={() => setActiveTab('movements')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'movements'
                  ? 'border-b-2 border-primary-500 text-primary-700 bg-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              Historia ruchow ({movements.length})
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'orders'
                  ? 'border-b-2 border-primary-500 text-primary-700 bg-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              Zamowienia z tym produktem ({productOrders.length})
            </button>
            <div className="ml-auto px-4 py-2 text-xs text-gray-500">
              Lacznie sprzedano: <strong className="text-green-700">{totalSold}</strong> szt. w <strong>{uniqueOrders}</strong> zamowieniach
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Ladowanie...
              </div>
            ) : activeTab === 'movements' ? (
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Data</th>
                    <th className="text-left px-2 py-1">Typ</th>
                    <th className="text-left px-2 py-1">Zamowienie</th>
                    <th className="text-left px-2 py-1">Kontrahent</th>
                    <th className="text-right px-2 py-1">Zmiana</th>
                    <th className="text-left px-2 py-1">Powod</th>
                    <th className="text-left px-2 py-1">Uzytkownik</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-gray-500">Brak historii ruchow</td>
                    </tr>
                  ) : (
                    movements.map((m) => {
                      const typeInfo = getMovementTypeLabel(m.movementType);
                      return (
                        <tr key={m.id} className="border-b hover:bg-gray-50">
                          <td className="px-2 py-1 text-gray-600">{formatDate(m.createdAt)}</td>
                          <td className="px-2 py-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${typeInfo.color}`}>
                              {typeInfo.text}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            {m.orderNumber ? (
                              <div className="flex items-center gap-1">
                                <span className="text-primary-700 font-medium">{m.orderNumber}</span>
                                {m.orderStatus && (
                                  <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${getStatusLabel(m.orderStatus).color}`}>
                                    {getStatusLabel(m.orderStatus).text}
                                  </span>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-2 py-1 text-gray-700 truncate max-w-[120px]" title={m.orderCustomerName || ''}>
                            {m.orderCustomerCode ? `[${m.orderCustomerCode}] ` : ''}{m.orderCustomerName || '-'}
                          </td>
                          <td className={`px-2 py-1 text-right font-medium ${m.deltaUnits >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {m.deltaUnits >= 0 ? '+' : ''}{m.deltaUnits}
                          </td>
                          <td className="px-2 py-1 text-gray-700 truncate max-w-[150px]" title={m.reason || ''}>
                            {m.reason || '-'}
                          </td>
                          <td className="px-2 py-1 text-gray-500">{m.userEmail || '-'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Nr zamowienia</th>
                    <th className="text-left px-2 py-1">Klient</th>
                    <th className="text-right px-2 py-1">Ilosc</th>
                    <th className="text-right px-2 py-1">Cena jedn.</th>
                    <th className="text-right px-2 py-1">Wartosc</th>
                    <th className="text-left px-2 py-1">Status</th>
                    <th className="text-left px-2 py-1">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {productOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-gray-500">Ten produkt nie byl jeszcze zamawiany</td>
                    </tr>
                  ) : (
                    productOrders.map((o) => {
                      const statusInfo = getStatusLabel(o.status);
                      return (
                        <tr key={o.id} className="border-b hover:bg-gray-50">
                          <td className="px-2 py-1">
                            <button
                              onClick={() => handleOrderClick(o.id)}
                              className="font-medium text-primary-700 hover:text-primary-900 hover:underline focus:outline-none"
                              title="Przejdz do zamowienia"
                            >
                              {o.orderNumber}
                            </button>
                          </td>
                          <td className="px-2 py-1 text-gray-700 truncate max-w-[150px]" title={o.customerName || ''}>
                            {o.customerCode ? `[${o.customerCode}] ` : ""}{o.customerName || '-'}
                          </td>
                          <td className="px-2 py-1 text-right font-medium text-gray-900">
                            {o.productQuantity} szt.
                          </td>
                          <td className="px-2 py-1 text-right text-gray-600">
                            {Number(o.productUnitPrice).toFixed(2)} zl
                          </td>
                          <td className="px-2 py-1 text-right font-medium text-green-700">
                            {Number(o.productTotalPrice).toFixed(2)} zl
                          </td>
                          <td className="px-2 py-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>
                              {statusInfo.text}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-gray-600">{formatDate(o.createdAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
