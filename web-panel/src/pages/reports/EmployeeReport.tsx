import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { EmployeeSales, EmployeeDailySales } from '../../types/reports';
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

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  cashier: 'Kasjer',
  warehouse: 'Magazynier',
  salesperson: 'Sprzedawca',
};

export function EmployeeReport() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [employeeSales, setEmployeeSales] = useState<EmployeeSales[]>([]);
  const [dailySales, setDailySales] = useState<EmployeeDailySales[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'daily'>('summary');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [employeesResponse, dailyResponse] = await Promise.all([
          api.getEmployeeSales(dateRange.startDate, dateRange.endDate),
          api.getEmployeeDailySales(dateRange.startDate, dateRange.endDate),
        ]);
        setEmployeeSales(employeesResponse.employees);
        setDailySales(dailyResponse.dailySales);
      } catch (err) {
        console.error('Error fetching employee data:', err);
        setError('Nie udało się pobrać danych pracowników');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange]);

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

  // Prepare data for pie chart
  const pieData = employeeSales.map((emp) => ({
    name: emp.firstName && emp.lastName ? `${emp.firstName} ${emp.lastName}` : emp.email,
    value: emp.totalGross,
    percent: emp.percentShare,
  }));

  // Prepare data for daily chart (group by date)
  const dailyByDate = dailySales.reduce((acc, item) => {
    const existing = acc.find(d => d.date === item.date);
    const employeeName = item.firstName && item.lastName ? `${item.firstName} ${item.lastName}` : `User ${item.userId}`;
    if (existing) {
      existing[employeeName] = (existing[employeeName] || 0) + item.totalGross;
    } else {
      acc.push({ date: item.date, [employeeName]: item.totalGross });
    }
    return acc;
  }, [] as any[]);

  // Get unique employee names for chart
  const employeeNames = [...new Set(dailySales.map(d =>
    d.firstName && d.lastName ? `${d.firstName} ${d.lastName}` : `User ${d.userId}`
  ))];

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

  const totalSales = employeeSales.reduce((sum, emp) => sum + emp.totalGross, 0);
  const totalOrders = employeeSales.reduce((sum, emp) => sum + emp.ordersCount, 0);

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
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setViewMode('summary')}
            className={`px-3 py-2 text-sm rounded-lg ${viewMode === 'summary' ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            Podsumowanie
          </button>
          <button
            onClick={() => setViewMode('daily')}
            className={`px-3 py-2 text-sm rounded-lg ${viewMode === 'daily' ? 'bg-primary-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            Dziennie
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Łączna sprzedaż</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Łączna liczba zamówień</p>
          <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Liczba pracowników</p>
          <p className="text-2xl font-bold text-gray-900">{employeeSales.length}</p>
        </div>
      </div>

      {viewMode === 'summary' ? (
        <>
          {/* Pie Chart - Share Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Udział w sprzedaży</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${percent.toFixed(1)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bar Chart - Employee Comparison */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Porównanie sprzedaży</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={employeeSales}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="firstName"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(_, index) => {
                        const emp = employeeSales[index];
                        return emp?.firstName || emp?.email?.split('@')[0] || '';
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === 'totalGross' ? formatCurrency(value) : value,
                        name === 'totalGross' ? 'Sprzedaż' : 'Zamówienia'
                      ]}
                      labelFormatter={(_: any, payload: any) => {
                        if (payload && payload[0]) {
                          const emp = payload[0].payload;
                          return emp.firstName && emp.lastName
                            ? `${emp.firstName} ${emp.lastName}`
                            : emp.email;
                        }
                        return '';
                      }}
                    />
                    <Bar dataKey="totalGross" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Employee Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-900 p-4 border-b">Szczegóły pracowników</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pracownik</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rola</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Zamówienia</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sprzedaż brutto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sprzedaż netto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Śr. zamówienie</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Udział %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {employeeSales.map((emp) => (
                    <tr key={emp.userId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {emp.firstName && emp.lastName ? `${emp.firstName} ${emp.lastName}` : '-'}
                          </p>
                          <p className="text-xs text-gray-500">{emp.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {roleLabels[emp.role] || emp.role}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{emp.ordersCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">{formatCurrency(emp.totalGross)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(emp.totalNet)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(emp.avgOrderValue)}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {emp.percentShare.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Daily View */
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sprzedaż dzienna wg pracowników</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyByDate}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
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
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('pl-PL')}
                />
                <Legend />
                {employeeNames.map((name, index) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    stackId="a"
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
