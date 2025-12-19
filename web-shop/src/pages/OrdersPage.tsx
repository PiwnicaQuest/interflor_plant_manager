import { useState, useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { api } from '../services/api';
import type { Order } from '../types';
import { useAuth } from '../contexts/AuthContext';

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Oczekuje', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'W realizacji', color: 'bg-blue-100 text-blue-800' },
  ready_for_pickup: { label: 'Gotowe do odbioru', color: 'bg-purple-100 text-purple-800' },
  completed: { label: 'Zrealizowane', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Anulowane', color: 'bg-red-100 text-red-800' },
};

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const successState = location.state as { success?: boolean; orderNumber?: string; totalAmount?: number } | null;

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const result = await api.getMyOrders();
      setOrders(result.orders);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Błąd ładowania zamówień');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN'
    }).format(price);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (authLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: '/orders' }} replace />;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Moje zamówienia</h1>

      {/* Success message */}
      {successState?.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800">
            Zamówienie <span className="font-semibold">{successState.orderNumber}</span> zostało złożone pomyślnie!
            Wartość zamówienia: {formatPrice(successState.totalAmount || 0)}
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Ładowanie zamówień...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📦</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Brak zamówień</h2>
          <p className="text-gray-600">Nie masz jeszcze żadnych zamówień</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const status = statusLabels[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-800' };
            const isExpanded = expandedOrder === order.id;

            return (
              <div key={order.id} className="card">
                {/* Header */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{order.orderNumber}</h3>
                      <p className="text-sm text-gray-500">{formatDate(order.createdAt)}</p>
                    </div>
                    <span className={'px-3 py-1 rounded-full text-sm font-medium ' + status.color}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-bold text-green-600">
                      {formatPrice(order.totalAmount)}
                    </span>
                    <span className="text-gray-400">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Details */}
                {isExpanded && (
                  <div className="border-t px-4 py-4">
                    {/* Items */}
                    <div className="space-y-3 mb-4">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                              {item.productSnapshot?.imageUrl ? (
                                <img
                                  src={item.productSnapshot.imageUrl}
                                  alt={item.productSnapshot?.plantName}
                                  className="w-full h-full object-cover rounded-lg"
                                />
                              ) : (
                                '🌿'
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {item.productSnapshot?.plantName || 'Produkt'}
                              </p>
                              <p className="text-sm text-gray-500">
                                {item.quantity} szt. × {formatPrice(item.unitPriceGross)}
                              </p>
                            </div>
                          </div>
                          <span className="font-semibold text-gray-900">
                            {formatPrice(item.totalPrice)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Notes */}
                    {order.customerNotes && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Twoje uwagi:</span> {order.customerNotes}
                        </p>
                      </div>
                    )}

                    {order.notes && (
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-sm text-blue-800">
                          <span className="font-medium">Informacja od sprzedawcy:</span> {order.notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
