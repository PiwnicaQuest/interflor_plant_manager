import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { PaymentStats, AgingBucket, PaymentMethodStats, OverdueInvoice } from '../../types/reports';
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

const statusLabels: Record<string, string> = {
  paid: 'Opłacone',
  unpaid: 'Nieopłacone',
  partially_paid: 'Częściowo opłacone',
  overdue: 'Przeterminowane',
};

const statusColors: Record<string, string> = {
  paid: '#10b981',
  unpaid: '#f59e0b',
  partially_paid: '#3b82f6',
  overdue: '#ef4444',
};

const methodLabels: Record<string, string> = {
  cash: 'Gotówka',
  card: 'Karta',
  transfer: 'Przelew',
  unknown: 'Nieznana',
};

const methodColors: Record<string, string> = {
  cash: '#10b981',
  card: '#3b82f6',
  transfer: '#8b5cf6',
  unknown: '#6b7280',
};

const agingLabels: Record<string, string> = {
  current: 'Bieżące',
  '1-30': '1-30 dni',
  '31-60': '31-60 dni',
  '61-90': '61-90 dni',
  '90+': 'Ponad 90 dni',
};

const agingColors: Record<string, string> = {
  current: '#10b981',
  '1-30': '#f59e0b',
  '31-60': '#f97316',
  '61-90': '#ef4444',
  '90+': '#dc2626',
};

export function PaymentReport() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [paymentStats, setPaymentStats] = useState<PaymentStats[]>([]);
  const [agingReport, setAgingReport] = useState<AgingBucket[]>([]);
  const [methodStats, setMethodStats] = useState<PaymentMethodStats[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'methods' | 'aging' | 'overdue'>('status');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [statusResponse, agingResponse, methodsResponse, overdueResponse] = await Promise.all([
          api.getPaymentStats(dateRange.startDate, dateRange.endDate),
          api.getAgingReport(),
          api.getPaymentMethodStats(dateRange.startDate, dateRange.endDate),
          api.getOverdueInvoices(50),
        ]);
        setPaymentStats(statusResponse.payments);
        setAgingReport(agingResponse.aging);
        setMethodStats(methodsResponse.methods);
        setOverdueInvoices(overdueResponse.invoices);
      } catch (err) {
        console.error('Error fetching payment data:', err);
        setError('Nie udało się pobrać danych płatności');
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

  const totalOverdue = agingReport
    .filter(a => a.bucket !== 'current')
    .reduce((sum, a) => sum + a.totalAmount, 0);

  const totalOverdueCount = agingReport
    .filter(a => a.bucket !== 'current')
    .reduce((sum, a) => sum + a.count, 0);

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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Łączna wartość faktur</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(paymentStats.reduce((sum, p) => sum + p.totalAmount, 0))}
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700">Opłacone</p>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(paymentStats.find(p => p.status === 'paid')?.totalAmount || 0)}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">Przeterminowane należności</p>
          <p className="text-2xl font-bold text-red-900">{formatCurrency(totalOverdue)}</p>
          <p className="text-xs text-red-600 mt-1">{totalOverdueCount} faktur</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-orange-700">Do opłacenia</p>
          <p className="text-2xl font-bold text-orange-900">
            {formatCurrency(paymentStats.find(p => p.status === 'unpaid')?.totalAmount || 0)}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4">
          {[
            { id: 'status', label: 'Statusy płatności' },
            { id: 'methods', label: 'Metody płatności' },
            { id: 'aging', label: 'Wiekowanie należności' },
            { id: 'overdue', label: 'Przeterminowane faktury' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-4 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'status' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Rozkład statusów płatności</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentStats.map(p => ({
                      name: statusLabels[p.status] || p.status,
                      value: p.totalAmount,
                      color: statusColors[p.status] || '#6b7280',
                    }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {paymentStats.map((p, index) => (
                      <Cell key={`cell-${index}`} fill={statusColors[p.status] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Szczegóły statusów</h3>
            <div className="space-y-4">
              {paymentStats.map((p) => (
                <div key={p.status} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: statusColors[p.status] || '#6b7280' }}
                    />
                    <span className="font-medium">{statusLabels[p.status] || p.status}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(p.totalAmount)}</p>
                    <p className="text-sm text-gray-500">{p.count} faktur</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'methods' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Metody płatności</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={methodStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="method"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => methodLabels[value] || value}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => methodLabels[label] || label}
                  />
                  <Bar dataKey="totalAmount" radius={[4, 4, 0, 0]}>
                    {methodStats.map((m, index) => (
                      <Cell key={`cell-${index}`} fill={methodColors[m.method] || '#6b7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Udział metod płatności</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={methodStats.map(m => ({
                      name: methodLabels[m.method] || m.method,
                      value: m.totalAmount,
                    }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {methodStats.map((m, index) => (
                      <Cell key={`cell-${index}`} fill={methodColors[m.method] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'aging' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Wiekowanie należności</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingReport}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => agingLabels[value] || value}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => agingLabels[label] || label}
                  />
                  <Bar dataKey="totalAmount" radius={[4, 4, 0, 0]}>
                    {agingReport.map((a, index) => (
                      <Cell key={`cell-${index}`} fill={agingColors[a.bucket] || '#6b7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Przedział</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Liczba faktur</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kwota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {agingReport.map((a) => (
                  <tr key={a.bucket} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: agingColors[a.bucket] || '#6b7280' }}
                        />
                        <span className="text-sm font-medium">{agingLabels[a.bucket] || a.bucket}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">{a.count}</td>
                    <td className="px-4 py-3 text-sm font-medium text-right">{formatCurrency(a.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'overdue' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <h3 className="text-lg font-semibold text-gray-900 p-4 border-b">
            Przeterminowane faktury ({overdueInvoices.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nr faktury</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Klient</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Termin płatności</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Dni po terminie</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kwota brutto</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Do zapłaty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {overdueInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-primary-600">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{invoice.customerName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(invoice.paymentDeadline).toLocaleDateString('pl-PL')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        invoice.daysOverdue > 90
                          ? 'bg-red-100 text-red-800'
                          : invoice.daysOverdue > 30
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {invoice.daysOverdue} dni
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(invoice.totalGross)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-red-600 text-right">
                      {formatCurrency(invoice.amountDue)}
                    </td>
                  </tr>
                ))}
                {overdueInvoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Brak przeterminowanych faktur
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
