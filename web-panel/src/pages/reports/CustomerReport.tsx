import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { CustomerSales, CustomerStats } from '../../types/reports';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface DateRange {
  startDate: string;
  endDate: string;
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function CustomerReport() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [topCustomers, setTopCustomers] = useState<CustomerSales[]>([]);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [customersResponse, statsResponse] = await Promise.all([
          api.getTopCustomers(dateRange.startDate, dateRange.endDate, limit),
          api.getCustomerStats(dateRange.startDate, dateRange.endDate),
        ]);
        setTopCustomers(customersResponse.customers);
        setCustomerStats(statsResponse);
      } catch (err) {
        console.error('Error fetching customer data:', err);
        setError('Nie udało się pobrać danych klientów');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange, limit]);

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

  const totalRevenue = topCustomers.reduce((sum, c) => sum + c.totalGross, 0);
  const totalOrders = topCustomers.reduce((sum, c) => sum + c.ordersCount, 0);

  // Prepare data for pie chart (customer type)
  const customerTypeData = customerStats ? [
    { name: 'Nowi klienci', value: customerStats.newCustomers, color: '#10b981' },
    { name: 'Powracający klienci', value: customerStats.returningCustomers, color: '#3b82f6' },
  ] : [];

  // Prepare data for top customers chart
  const top10Customers = topCustomers.slice(0, 10).map(c => ({
    name: c.companyName || `${c.firstName} ${c.lastName}`.trim() || '-',
    value: c.totalGross,
  }));

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
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
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm font-medium text-gray-700">Limit:</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {customerStats && (
          <>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <p className="text-sm text-purple-700">Aktywni klienci</p>
              <p className="text-2xl font-bold text-purple-900">{customerStats.totalCustomers}</p>
            </div>
            <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-primary-700">Nowi klienci</p>
              <p className="text-2xl font-bold text-primary-900">{customerStats.newCustomers}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-700">Powracający klienci</p>
              <p className="text-2xl font-bold text-blue-900">{customerStats.returningCustomers}</p>
            </div>
          </>
        )}
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
          <p className="text-sm text-orange-700">Łączny przychód (Top {limit})</p>
          <p className="text-2xl font-bold text-orange-900">{formatCurrency(totalRevenue)}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Type Pie Chart */}
        {customerStats && customerStats.totalCustomers > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Struktura klientów</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {customerTypeData.map((entry, index) => (
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

        {/* Top Customers Bar Chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 klientów wg przychodu</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10Customers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  width={120}
                />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <h3 className="text-lg font-semibold text-gray-900 p-4 border-b">Lista klientów</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Klient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Miasto</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Zamówienia</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Przychód brutto</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Śr. zamówienie</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ostatnie zamówienie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {topCustomers.map((customer, index) => (
                <tr key={customer.customerId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {customer.companyName || '-'}
                      </p>
                      {(customer.firstName || customer.lastName) && (
                        <p className="text-xs text-gray-500">
                          {`${customer.firstName || ''} ${customer.lastName || ''}`.trim()}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{customer.city || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{customer.ordersCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                    {formatCurrency(customer.totalGross)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {formatCurrency(customer.avgOrderValue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString('pl-PL') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
