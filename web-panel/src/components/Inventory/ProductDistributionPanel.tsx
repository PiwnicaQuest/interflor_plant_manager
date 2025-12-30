import { useState, useEffect } from 'react';
import { Product, InventoryMovement, Order, Customer } from '../../types';
import { api } from '../../services/api';

interface ProductDistributionPanelProps {
  product: Product | null;
  onClose: () => void;
  onAddToOrder: (product: Product, quantity: number, customerId: number) => Promise<void>;
  onAddToExistingOrder: (product: Product, quantity: number, orderId: number) => Promise<void>;
}

export function ProductDistributionPanel({ product, onClose, onAddToOrder, onAddToExistingOrder }: ProductDistributionPanelProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productOrders, setProductOrders] = useState<Order[]>([]); // Zamówienia zawierające ten produkt
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'movements' | 'orders'>('movements');
  const [orderMode, setOrderMode] = useState<'new' | 'existing'>('new');

  useEffect(() => {
    if (product) {
      loadData();
      setSuccessMessage(null);
    }
  }, [product?.id]);

  const loadData = async () => {
    if (!product) return;
    setLoading(true);
    try {
      const [movementsRes, ordersRes, customersRes] = await Promise.all([
        api.getProductMovements(product.id, 20),
        api.getOrders(),
        api.getCustomers(),
      ]);

      const movementsData = movementsRes.movements || [];
      setMovements(movementsData);
      const allOrders = ordersRes.orders || [];
      setOrders(allOrders);
      setCustomers(customersRes.customers || []);

      // Znajdź zamówienia zawierające ten produkt na podstawie ruchów typu 'sale'
      const orderIdsWithProduct = new Set(
        movementsData
          .filter((m: InventoryMovement) => m.movementType === 'sale' && m.referenceId)
          .map((m: InventoryMovement) => m.referenceId)
      );
      const ordersWithProduct = allOrders.filter((o: Order) => orderIdsWithProduct.has(o.id));
      setProductOrders(ordersWithProduct);
    } catch (error) {
      console.error('Error loading distribution data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToNewOrder = async () => {
    if (!product || !selectedCustomerId || quantity <= 0) return;

    setAdding(true);
    setSuccessMessage(null);
    try {
      await onAddToOrder(product, quantity, selectedCustomerId);
      const customer = customers.find(c => c.id === selectedCustomerId);
      setSuccessMessage(`Dodano ${quantity} szt. do nowego zamówienia dla ${customer?.companyName || customer?.firstName || 'klienta'}`);
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
      setSuccessMessage(`Dodano ${quantity} szt. do zamówienia ${order?.orderNumber || '#' + selectedOrderId}`);
      setQuantity(1);
      loadData();
    } catch (error) {
      console.error('Error adding to existing order:', error);
    } finally {
      setAdding(false);
    }
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
      sale: { text: 'Sprzedaż', color: 'bg-blue-100 text-blue-800' },
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
      completed: { text: 'Zakończone', color: 'bg-green-100 text-green-800' },
      cancelled: { text: 'Anulowane', color: 'bg-red-100 text-red-800' },
    };
    return labels[status] || { text: status, color: 'bg-gray-100 text-gray-800' };
  };

  // Filter orders that can be edited (not completed/cancelled)
  const editableOrders = orders.filter(o =>
    o.status === 'pending' || o.status === 'in_progress' || o.status === 'ready_for_pickup'
  );

  // Calculate stats from movements
  const salesMovements = movements.filter(m => m.movementType === 'sale');
  const totalSold = salesMovements.reduce((sum, m) => sum + Math.abs(m.deltaUnits), 0);
  const uniqueOrders = new Set(salesMovements.filter(m => m.referenceId).map(m => m.referenceId)).size;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-primary-500 shadow-lg z-40 transition-all duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-lg">{product.plantName}</span>
          <span className="text-primary-200 text-sm">|</span>
          <span className="text-sm">Stan: <strong>{product.totalUnits}</strong> szt.</span>
          <span className="text-sm">Sprzedano: <strong>{product.totalSold || 0}</strong> szt.</span>
          <span className="text-sm">Cena: <strong>{product.basePriceGross?.toFixed(2) || '-'} zł</strong></span>
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
            <span>🛒</span> Dodaj do zamówienia
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
              + Nowe zamówienie
            </button>
            <button
              onClick={() => setOrderMode('existing')}
              className={`flex-1 py-1 px-2 text-xs font-medium rounded transition-colors ${
                orderMode === 'existing'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Istniejące ({editableOrders.length})
            </button>
          </div>

          <div className="space-y-2 flex-1 overflow-auto">
            {orderMode === 'new' ? (
              /* New order form */
              <>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Klient</label>
                  <select
                    value={selectedCustomerId || ''}
                    onChange={(e) => setSelectedCustomerId(Number(e.target.value) || null)}
                    className="w-full px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Wybierz klienta...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.companyName || `${c.firstName} ${c.lastName}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600 block mb-1">Ilość (max: {product.totalUnits})</label>
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
                  Wartość: <strong>{(quantity * (product.basePriceGross || 0)).toFixed(2)} zł</strong>
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
                    <>Utwórz zamówienie</>
                  )}
                </button>
              </>
            ) : (
              /* Existing order selection */
              <>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Wybierz zamówienie</label>
                  {editableOrders.length === 0 ? (
                    <div className="text-sm text-gray-500 py-2 text-center bg-gray-100 rounded">
                      Brak aktywnych zamówień
                    </div>
                  ) : (
                    <div className="max-h-32 overflow-auto border rounded bg-white">
                      {editableOrders.map(o => {
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
                              <span>{o.customerName || '-'}</span>
                              <span>{formatDateShort(o.createdAt)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-gray-600 block mb-1">Ilość (max: {product.totalUnits})</label>
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
                  Wartość: <strong>{(quantity * (product.basePriceGross || 0)).toFixed(2)} zł</strong>
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
                    <>Dodaj do zamówienia</>
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
              Historia ruchów ({movements.length})
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'orders'
                  ? 'border-b-2 border-primary-500 text-primary-700 bg-white'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              Zamówienia z tym produktem ({productOrders.length})
            </button>
            <div className="ml-auto px-4 py-2 text-xs text-gray-500">
              Łącznie sprzedano: <strong className="text-green-700">{totalSold}</strong> szt. w <strong>{uniqueOrders}</strong> zamówieniach
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
                Ładowanie...
              </div>
            ) : activeTab === 'movements' ? (
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Data</th>
                    <th className="text-left px-2 py-1">Typ</th>
                    <th className="text-left px-2 py-1">Zamówienie</th>
                    <th className="text-left px-2 py-1">Kontrahent</th>
                    <th className="text-right px-2 py-1">Zmiana</th>
                    <th className="text-left px-2 py-1">Powód</th>
                    <th className="text-left px-2 py-1">Użytkownik</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-gray-500">Brak historii ruchów</td>
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
                            {m.orderCustomerName || '-'}
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
                    <th className="text-left px-2 py-1">Nr zamówienia</th>
                    <th className="text-left px-2 py-1">Klient</th>
                    <th className="text-left px-2 py-1">Status</th>
                    <th className="text-right px-2 py-1">Wartość</th>
                    <th className="text-left px-2 py-1">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {productOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4 text-gray-500">Ten produkt nie był jeszcze zamawiany</td>
                    </tr>
                  ) : (
                    productOrders.map((o) => {
                      const statusInfo = getStatusLabel(o.status);
                      return (
                        <tr key={o.id} className="border-b hover:bg-gray-50">
                          <td className="px-2 py-1 font-medium text-primary-700">{o.orderNumber}</td>
                          <td className="px-2 py-1 text-gray-700">{o.customerName || '-'}</td>
                          <td className="px-2 py-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.color}`}>
                              {statusInfo.text}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-right font-medium">{Number(o.totalAmount).toFixed(2)} zł</td>
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
