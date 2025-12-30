import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API } from '../../services/api';
import type { Order } from '../../types';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Oczekujace',
  in_progress: 'W realizacji',
  ready_for_pickup: 'Do odbioru',
  completed: 'Zakonczone',
  cancelled: 'Anulowane',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  ready_for_pickup: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function ScannerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter orders by customer name
  const filteredOrders = orders.filter(order =>
    !searchQuery ||
    order.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: { status?: string } = {};
      if (statusFilter && statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      const result = await API.getOrders(filters);
      setOrders(result.orders || []);
    } catch (err: any) {
      setError('Nie udalo sie pobrac zamowien');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter Tabs - Compact */}
      <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex-shrink-0">
        <div className="flex gap-1.5 overflow-x-auto">
          {[
            { value: 'all', label: 'Wszystkie' },
            { value: 'pending', label: 'Oczekujace' },
            { value: 'in_progress', label: 'W realizacji' },
            { value: 'ready_for_pickup', label: 'Do odbioru' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.value
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="mt-2 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Szukaj po nazwie kontrahenta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <div className="text-red-500 mb-3 text-sm">{error}</div>
            <button
              onClick={loadOrders}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              Sprobuj ponownie
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-base font-medium text-gray-900 mb-1">Brak zamowien</h3>
            <p className="text-gray-500 text-sm mb-3">
              {searchQuery
                ? `Nie znaleziono zamowien dla "${searchQuery}"`
                : 'Nie ma zamowien o wybranym statusie'}
            </p>
            <Link
              to="/scanner/orders/new"
              className="inline-flex items-center px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Nowe zamowienie
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredOrders.map((order) => (
              <Link
                key={order.id}
                to={`/scanner/orders/${order.id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-100 px-3 py-2 active:bg-gray-50 transition-colors"
              >
                {/* Row 1: Order number, date, status */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900">#{order.orderNumber}</span>
                    <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>

                {/* Row 2: Customer name */}
                {order.customerName && (
                  <div className="text-sm text-gray-700 mt-0.5 truncate">
                    {order.customerName}
                  </div>
                )}

                {/* Row 3: Items count and total */}
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-500">
                    {order.itemCount || 0} poz.
                  </span>
                  <span className="font-bold text-sm text-green-600">
                    {order.totalAmount?.toFixed(2) || '0.00'} PLN
                  </span>
                </div>

                {/* Notes - only if present, truncated */}
                {order.customerNotes && (
                  <div className="text-xs text-gray-400 mt-1 truncate italic">
                    {order.customerNotes}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
