import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { DocumentTypeStats, DocumentDailyStats } from '../../types/reports';
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

const documentTypeLabels: Record<string, string> = {
  invoice: 'Faktury',
  proforma: 'Pro Forma',
  receipt: 'Paragony',
  correction: 'Korekty',
};

const documentTypeColors: Record<string, string> = {
  invoice: '#3b82f6',
  proforma: '#f59e0b',
  receipt: '#10b981',
  correction: '#ef4444',
};

export function DocumentReport() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [documentStats, setDocumentStats] = useState<DocumentTypeStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DocumentDailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'daily'>('summary');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [docResponse, dailyResponse] = await Promise.all([
          api.getDocumentTypeStats(dateRange.startDate, dateRange.endDate),
          api.getDocumentTypeDailyStats(dateRange.startDate, dateRange.endDate),
        ]);
        setDocumentStats(docResponse.documents);
        setDailyStats(dailyResponse.dailyStats);
      } catch (err) {
        console.error('Error fetching document data:', err);
        setError('Nie udało się pobrać danych dokumentów');
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

  const totalDocuments = documentStats.reduce((sum, d) => sum + d.count, 0);
  const totalGross = documentStats.reduce((sum, d) => sum + d.totalGross, 0);

  // Prepare pie chart data
  const pieData = documentStats.map(d => ({
    name: documentTypeLabels[d.documentType] || d.documentType,
    value: d.count,
    color: documentTypeColors[d.documentType] || '#6b7280',
  }));

  // Prepare bar chart data
  const barData = documentStats.map(d => ({
    name: documentTypeLabels[d.documentType] || d.documentType,
    count: d.count,
    totalGross: d.totalGross,
    color: documentTypeColors[d.documentType] || '#6b7280',
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Łączna liczba dokumentów</p>
          <p className="text-2xl font-bold text-gray-900">{totalDocuments}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Łączna wartość brutto</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalGross)}</p>
        </div>
        {documentStats.find(d => d.documentType === 'invoice') && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">Faktury</p>
            <p className="text-2xl font-bold text-blue-900">
              {documentStats.find(d => d.documentType === 'invoice')?.count || 0}
            </p>
          </div>
        )}
        {documentStats.find(d => d.documentType === 'receipt') && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700">Paragony</p>
            <p className="text-2xl font-bold text-green-900">
              {documentStats.find(d => d.documentType === 'receipt')?.count || 0}
            </p>
          </div>
        )}
      </div>

      {viewMode === 'summary' ? (
        <>
          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart - Document Distribution */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Rozkład dokumentów</h3>
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

            {/* Bar Chart - Revenue by Document Type */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Wartość wg typu dokumentu</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === 'totalGross' ? formatCurrency(value) : value,
                        name === 'totalGross' ? 'Wartość brutto' : 'Ilość'
                      ]}
                    />
                    <Bar
                      dataKey="totalGross"
                      radius={[4, 4, 0, 0]}
                    >
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Document Type Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <h3 className="text-lg font-semibold text-gray-900 p-4 border-b">Szczegóły dokumentów</h3>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Typ dokumentu</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ilość</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Netto</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">VAT</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brutto</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Śr. wartość</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {documentStats.map((doc) => (
                  <tr key={doc.documentType} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: documentTypeColors[doc.documentType] || '#6b7280' }}
                        />
                        <span className="text-sm font-medium text-gray-900">
                          {documentTypeLabels[doc.documentType] || doc.documentType}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{doc.count}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(doc.totalNet)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(doc.totalVat)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">{formatCurrency(doc.totalGross)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatCurrency(doc.count > 0 ? doc.totalGross / doc.count : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">Razem</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{totalDocuments}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(documentStats.reduce((sum, d) => sum + d.totalNet, 0))}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(documentStats.reduce((sum, d) => sum + d.totalVat, 0))}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatCurrency(totalGross)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    {formatCurrency(totalDocuments > 0 ? totalGross / totalDocuments : 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        /* Daily View */
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Dzienna liczba dokumentów</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getDate()}.${date.getMonth() + 1}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(label) => new Date(label).toLocaleDateString('pl-PL')}
                />
                <Legend />
                <Line type="monotone" dataKey="invoices" name="Faktury" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="proformas" name="Pro Forma" stroke="#f59e0b" strokeWidth={2} />
                <Line type="monotone" dataKey="receipts" name="Paragony" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
