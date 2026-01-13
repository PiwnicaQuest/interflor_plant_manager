import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { CategorySales, MonthlySalesTrend } from '../../types/reports';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';

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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

export function ProductReport() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlySalesTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [activeTab, setActiveTab] = useState<'categories' | 'trends'>('categories');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [categoryResponse, trendResponse] = await Promise.all([
          api.getSalesByPotSize(dateRange.startDate, dateRange.endDate),
          api.getMonthlySalesTrend(months),
        ]);
        setCategorySales(categoryResponse.categories);
        setMonthlyTrend(trendResponse.trend);
      } catch (err) {
        console.error('Error fetching product data:', err);
        setError('Nie udało się pobrać danych produktów');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange, months]);

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

  const totalGross = categorySales.reduce((sum, c) => sum + c.totalGross, 0);
  const totalQuantity = categorySales.reduce((sum, c) => sum + c.quantitySold, 0);

  // Prepare pie chart data
  const pieData = categorySales.map((c, index) => ({
    name: c.category,
    value: c.totalGross,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex flex-wrap items-center gap-4">
        {activeTab === 'categories' && (
          <>
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
          </>
        )}
        {activeTab === 'trends' && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Ostatnie miesiące:</label>
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value={6}>6 miesięcy</option>
              <option value={12}>12 miesięcy</option>
              <option value={18}>18 miesięcy</option>
              <option value={24}>24 miesiące</option>
            </select>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3 py-2 text-sm rounded-lg ${activeTab === 'categories' ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            Kategorie (rozmiar)
          </button>
          <button
            onClick={() => setActiveTab('trends')}
            className={`px-3 py-2 text-sm rounded-lg ${activeTab === 'trends' ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            Trendy miesięczne
          </button>
        </div>
      </div>

      {activeTab === 'categories' ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Łączny przychód</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalGross)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Łączna ilość sprzedana</p>
              <p className="text-2xl font-bold text-gray-900">{totalQuantity} szt.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Liczba kategorii</p>
              <p className="text-2xl font-bold text-gray-900">{categorySales.length}</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart - Revenue by Category */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Przychód wg rozmiaru doniczki</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bar Chart - Quantity by Category */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Ilość sprzedana wg kategorii</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categorySales} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="category"
                      tick={{ fontSize: 11 }}
                      width={80}
                    />
                    <Tooltip />
                    <Bar dataKey="quantitySold" name="Ilość sprzedana" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Category Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-900 p-4 border-b">Szczegóły kategorii</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rozmiar doniczki</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Produkty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ilość sprzedana</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Netto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Udział %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {categorySales.map((cat, index) => (
                    <tr key={cat.category} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-sm font-medium text-gray-900">{cat.category}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{cat.productsCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{cat.quantitySold}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(cat.totalNet)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(cat.totalGross)}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {totalGross > 0 ? ((cat.totalGross / totalGross) * 100).toFixed(1) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">Razem</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                      {categorySales.reduce((sum, c) => sum + c.productsCount, 0)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{totalQuantity}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                      {formatCurrency(categorySales.reduce((sum, c) => sum + c.totalNet, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatCurrency(totalGross)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Trends View */
        <div className="space-y-6">
          {/* Monthly Trend Chart */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Trend sprzedaży miesięcznej</h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => {
                      const [year, month] = value.split('-');
                      return `${month}/${year.slice(2)}`;
                    }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === 'ordersCount' ? value : formatCurrency(value),
                      name === 'ordersCount' ? 'Zamówienia' : name === 'totalGross' ? 'Brutto' : 'Netto'
                    ]}
                    labelFormatter={(label) => {
                      const [year, month] = label.split('-');
                      const monthNames = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
                      return `${monthNames[parseInt(month) - 1]} ${year}`;
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="totalGross"
                    name="Przychód brutto"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', strokeWidth: 2 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="ordersCount"
                    name="Liczba zamówień"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Monthly Stats Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-900 p-4 border-b">Dane miesięczne</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Miesiąc</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Zamówienia</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Netto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Śr. zamówienie</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {monthlyTrend.map((month) => {
                    const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
                    const [year, monthNum] = month.month.split('-');
                    const monthName = `${monthNames[parseInt(monthNum) - 1]} ${year}`;
                    return (
                      <tr key={month.month} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{monthName}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">{month.ordersCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(month.totalNet)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(month.totalGross)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {formatCurrency(month.ordersCount > 0 ? month.totalGross / month.ordersCount : 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">Razem</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                      {monthlyTrend.reduce((sum, m) => sum + m.ordersCount, 0)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                      {formatCurrency(monthlyTrend.reduce((sum, m) => sum + m.totalNet, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                      {formatCurrency(monthlyTrend.reduce((sum, m) => sum + m.totalGross, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
