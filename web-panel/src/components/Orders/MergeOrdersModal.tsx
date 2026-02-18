import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Order, OrderWithItems } from '../../types';

interface MergeOrdersModalProps {
  masterOrder: OrderWithItems;
  onClose: () => void;
  onSuccess: () => void;
}

export function MergeOrdersModal({ masterOrder, onClose, onSuccess }: MergeOrdersModalProps) {
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mergePreview, setMergePreview] = useState<{
    totalItems: number;
    totalAmount: number;
    ordersToMerge: number;
  } | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        // Pobierz zamówienia tego samego kontrahenta w statusie pending
        const data = await api.getOrders({ customerId: masterOrder.customerId });
        const validOrders = data.orders.filter(
          (order) =>
            order.id !== masterOrder.id &&
            order.status !== 'completed' &&
            order.status !== 'cancelled' &&
            order.customerId === masterOrder.customerId
        );
        setAvailableOrders(validOrders);
      } catch (err) {
        console.error('Error fetching orders:', err);
        setError('Błąd podczas ładowania zamówień');
      }
    };

    fetchOrders();
  }, [masterOrder]);

  // Update preview when selection changes
  useEffect(() => {
    if (selectedOrderIds.length === 0) {
      setMergePreview(null);
      return;
    }

    const selectedOrders = availableOrders.filter(o => selectedOrderIds.includes(o.id));
    const totalAmount = selectedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), masterOrder.totalAmount || 0);
    const totalItems = selectedOrders.reduce((sum, o) => sum + (o.itemCount || 0), masterOrder.items?.length || 0);

    setMergePreview({
      totalItems,
      totalAmount,
      ordersToMerge: selectedOrderIds.length + 1, // +1 for master order
    });
  }, [selectedOrderIds, availableOrders, masterOrder]);

  const toggleOrderSelection = (orderId: number) => {
    setSelectedOrderIds(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const selectAll = () => {
    setSelectedOrderIds(availableOrders.map(o => o.id));
  };

  const deselectAll = () => {
    setSelectedOrderIds([]);
  };

  const handleMerge = async () => {
    if (selectedOrderIds.length === 0) {
      setError('Wybierz przynajmniej jedno zamówienie do połączenia');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Call merge API endpoint
      await api.mergeOrders(masterOrder.id, selectedOrderIds);

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Merge error:', err);
      setError(err.response?.data?.error || err.message || 'Błąd podczas łączenia zamówień');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Połącz zamówienia
          </h2>
          <p className="text-gray-600 mb-6">
            Zamówienie główne: <strong>{masterOrder.orderNumber}</strong>
          </p>

          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {/* Master Order Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Zamówienie główne (docelowe)</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Numer:</span>{' '}
                <strong>{masterOrder.orderNumber}</strong>
              </div>
              <div>
                <span className="text-blue-700">Kontrahent:</span>{' '}
                <strong>{masterOrder.customerName || 'Brak'}</strong>
              </div>
              <div>
                <span className="text-blue-700">Pozycji:</span>{' '}
                <strong>{masterOrder.items?.length || 0}</strong>
              </div>
              <div>
                <span className="text-blue-700">Wartość:</span>{' '}
                <strong>{(masterOrder.totalAmount || 0).toFixed(2)} PLN</strong>
              </div>
            </div>
          </div>

          {/* Available Orders */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Zamowienia do połączenia
              </h3>
              {availableOrders.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Zaznacz wszystkie
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    Odznacz wszystkie
                  </button>
                </div>
              )}
            </div>

            {availableOrders.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-gray-500">
                Brak innych zamówień tego kontrahenta do połączenia.
                <br />
                <span className="text-sm">
                  Tylko zamówienia w statusie "Oczekujące" lub "W realizacji" mogą być łączone.
                </span>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-12"></th>
                      <th>Numer</th>
                      <th>Status</th>
                      <th className="text-center">Pozycji</th>
                      <th className="text-right">Wartość</th>
                      <th>Data utworzenia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableOrders.map((order) => (
                      <tr
                        key={order.id}
                        className={`cursor-pointer hover:bg-gray-50 ${
                          selectedOrderIds.includes(order.id) ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => toggleOrderSelection(order.id)}
                      >
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.includes(order.id)}
                            onChange={() => toggleOrderSelection(order.id)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300"
                          />
                        </td>
                        <td className="font-medium">{order.orderNumber}</td>
                        <td>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            order.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {order.status === 'pending' ? 'Oczekujące' : 'W realizacji'}
                          </span>
                        </td>
                        <td className="text-center">{order.itemCount || 0}</td>
                        <td className="text-right">{(order.totalAmount || 0).toFixed(2)} PLN</td>
                        <td className="text-sm text-gray-500">
                          {new Date(order.createdAt).toLocaleDateString('pl-PL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Merge Preview */}
          {mergePreview && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-primary-900 mb-2">Podsumowanie po polaczeniu</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-primary-700">Zamowienia do połączenia:</span>{' '}
                  <strong>{mergePreview.ordersToMerge}</strong>
                </div>
                <div>
                  <span className="text-primary-700">Łączna liczba pozycji:</span>{' '}
                  <strong>{mergePreview.totalItems}</strong>
                </div>
                <div>
                  <span className="text-primary-700">Łączna wartość:</span>{' '}
                  <strong>{mergePreview.totalAmount.toFixed(2)} PLN</strong>
                </div>
              </div>
            </div>
          )}

          {/* Warning */}
          {selectedOrderIds.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-6 text-sm">
              <strong>Uwaga:</strong> Po polaczeniu wybrane zamówienia zostana anulowane,
              a ich produkty przeniesione do zamówienia głównego ({masterOrder.orderNumber}).
              Tej operacji nie można cofnąć.
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleMerge}
              disabled={loading || selectedOrderIds.length === 0}
              className="btn btn-primary flex-1"
            >
              {loading ? 'Łączenie...' : `Połącz ${selectedOrderIds.length > 0 ? `(${selectedOrderIds.length + 1} zamówień)` : ''}`}
            </button>
            <button onClick={onClose} className="btn btn-secondary flex-1">
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
