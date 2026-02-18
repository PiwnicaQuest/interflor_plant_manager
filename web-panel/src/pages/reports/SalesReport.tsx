import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { SalesReport as SalesReportType } from '../../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface DateRange {
  startDate: string;
  endDate: string;
}

interface OrderStatusStats {
  byStatus: Array<{
    status: string;
    label: string;
    ordersCount: number;
    totalNet: number;
    totalGross: number;
  }>;
  summary: {
    open: { ordersCount: number; totalNet: number; totalGross: number };
    closed: { ordersCount: number; totalNet: number; totalGross: number };
    all: { ordersCount: number; totalNet: number; totalGross: number };
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value);
}

function getDefaultDateRange(): DateRange {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

const statusColors: Record<string, string> = {
  pending: '#f59e0b',
  ready_for_pickup: '#8b5cf6',
  completed: '#10b981',
  cancelled: '#ef4444',
};

const statusOptions = [
  { value: 'all', label: 'Wszystkie zamówienia' },
  { value: 'open', label: 'Otwarte (oczekujące, w realizacji, do odbióru)' },
  { value: 'closed', label: 'Zamknięte (zrealizowane, anulowane)' },
  { value: 'pending', label: 'Oczekujące' },
  { value: 'ready_for_pickup', label: 'Gotowe do odbióru' },
  { value: 'completed', label: 'Zrealizowane' },
  { value: 'cancelled', label: 'Anulowane' },
];

export function SalesReport() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [orderStatus, setOrderStatus] = useState<string>('all');
  const [salesData, setSalesData] = useState<SalesReportType | null>(null);
  const [statusStats, setStatusStats] = useState<OrderStatusStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [salesResponse, statsResponse] = await Promise.all([
          api.getSalesReport(dateRange.startDate, dateRange.endDate, orderStatus),
          api.getOrderStatusStats(dateRange.startDate, dateRange.endDate),
        ]);
        setSalesData(salesResponse);
        setStatusStats(statsResponse);
      } catch (err) {
        console.error('Error fetching sales data:', err);
        setError('Nie udało się pobrać danych sprzedaży');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange, orderStatus]);

  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const setQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setDateRange({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const pieData = statusStats?.byStatus.map(s => ({
    name: s.label,
    value: s.ordersCount,
    color: statusColors[s.status] || '#6b7280',
  })) || [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Od:</label>
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Do:</label>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setQuickRange(7)} className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">7 dni</button>
          <button onClick={() => setQuickRange(30)} className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">30 dni</button>
          <button onClick={() => setQuickRange(90)} className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">90 dni</button>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Filtruj po statusie:</label>
        <select
          value={orderStatus}
          onChange={(e) => setOrderStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[280px]"
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Order Status Summary Cards */}
      {statusStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">Otwarte zamówienia</p>
            <p className="text-2xl font-bold text-blue-900">{statusStats.summary.open.ordersCount}</p>
            <p className="text-sm text-blue-600">{formatCurrency(statusStats.summary.open.totalGross)}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-primary-700">Zamknięte zamówienia</p>
            <p className="text-2xl font-bold text-primary-900">{statusStats.summary.closed.ordersCount}</p>
            <p className="text-sm text-primary-600">{formatCurrency(statusStats.summary.closed.totalGross)}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">Wszystkie zamówienia</p>
            <p className="text-2xl font-bold text-gray-900">{statusStats.summary.all.ordersCount}</p>
            <p className="text-sm text-gray-600">{formatCurrency(statusStats.summary.all.totalGross)}</p>
          </div>
        </div>
      )}

      {salesData && (
        <>
          {/* Sales Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Przychód brutto</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.totalGross)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Przychód netto</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.totalNet)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Liczba zamówień</p>
              <p className="text-2xl font-bold text-gray-900">{salesData.orderCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Śr. wartość zamówienia</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.averageOrderValue)}</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Sales Chart */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Sprzedaż dzienna</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesData.dailySales}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getDate()}.${date.getMonth() + 1}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Przychód']}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('pl-PL')}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalGross"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ fill: '#059669', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Order Status Pie Chart */}
            {statusStats && pieData.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Rozkład zamówień wg statusu</h3>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Order Status Table */}
      {statusStats && statusStats.byStatus.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 p-4 border-b">Szczegóły zamówień wg statusu</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Liczba zamówień</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Wartość netto</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Wartość brutto</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Śr. wartość</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {statusStats.byStatus.map((stat) => (
                <tr key={stat.status} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: statusColors[stat.status] || '#6b7280' }}
                      />
                      <span className="text-sm font-medium text-gray-900">{stat.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{stat.ordersCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(stat.totalNet)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(stat.totalGross)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {formatCurrency(stat.ordersCount > 0 ? stat.totalGross / stat.ordersCount : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900">Razem</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{statusStats.summary.all.ordersCount}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatCurrency(statusStats.summary.all.totalNet)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatCurrency(statusStats.summary.all.totalGross)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                  {formatCurrency(statusStats.summary.all.ordersCount > 0 ? statusStats.summary.all.totalGross / statusStats.summary.all.ordersCount : 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
