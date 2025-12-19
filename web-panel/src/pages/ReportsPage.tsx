import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { SalesReport, TopProduct } from '../types';
import { format, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type DateRangePreset = 'week' | 'month' | 'quarter' | 'custom';

export function ReportsPage() {
  console.log('[ReportsPage] Component rendering...');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  // Date filters
  const [datePreset, setDatePreset] = useState<DateRangePreset>('month');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  console.log('[ReportsPage] State initialized:', { loading, error, startDate, endDate });

  const fetchReports = useCallback(async () => {
    try {
      console.log('[ReportsPage] Starting to fetch reports...', { startDate, endDate });
      setLoading(true);
      setError(null);

      const [salesData, topProductsData] = await Promise.all([
        api.getSalesReport(startDate, endDate),
        api.getTopProducts(startDate, endDate, 10),
      ]);

      console.log('[ReportsPage] Reports fetched successfully:', { salesData, topProductsData });
      setSalesReport(salesData);
      setTopProducts(topProductsData.products);
    } catch (err: any) {
      console.error('[ReportsPage] Error fetching reports:', err);
      setError(err.response?.data?.error || 'Nie udało się załadować raportów');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    console.log('[ReportsPage] useEffect triggered', { startDate, endDate });
    fetchReports();
  }, [fetchReports]);

  const handlePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    const today = new Date();

    switch (preset) {
      case 'week':
        setStartDate(format(subDays(today, 7), 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      case 'month':
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
      case 'quarter':
        setStartDate(format(startOfQuarter(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfQuarter(today), 'yyyy-MM-dd'));
        break;
      case 'custom':
        // Keep current dates for custom
        break;
    }
  };

  const exportToCSV = () => {
    if (!salesReport) return;

    const csvRows = [
      ['Data', 'Liczba zamówień', 'Netto (PLN)', 'VAT (PLN)', 'Brutto (PLN)'],
      ...salesReport.dailySales.map(sale => [
        format(new Date(sale.date), 'dd.MM.yyyy'),
        sale.orderCount.toString(),
        (Number(sale.totalNet) || 0).toFixed(2),
        (Number(sale.totalVat) || 0).toFixed(2),
        (Number(sale.totalGross) || 0).toFixed(2),
      ]),
      [],
      ['PODSUMOWANIE'],
      ['Suma brutto', (Number(salesReport.totalGross) || 0).toFixed(2)],
      ['Suma netto', (Number(salesReport.totalNet) || 0).toFixed(2)],
      ['Suma VAT', (Number(salesReport.totalVat) || 0).toFixed(2)],
      ['Liczba zamówień', salesReport.orderCount.toString()],
      ['Średnia wartość zamówienia', (Number(salesReport.averageOrderValue) || 0).toFixed(2)],
    ];

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `raport_sprzedazy_${startDate}_${endDate}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Ładowanie raportów...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800 font-medium">Błąd: {error}</p>
        <button
          onClick={fetchReports}
          className="btn btn-primary mt-4"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Raporty sprzedaży</h1>
          <p className="text-gray-600 mt-1">Analiza wyników i wykres sprzedaży</p>
        </div>
        <button
          onClick={exportToCSV}
          className="btn btn-primary"
        >
          Eksportuj do CSV
        </button>
      </div>

      {/* Date Filters */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filtry dat</h2>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handlePresetChange('week')}
              className={`btn ${datePreset === 'week' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Ostatni tydzień
            </button>
            <button
              onClick={() => handlePresetChange('month')}
              className={`btn ${datePreset === 'month' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Ten miesiąc
            </button>
            <button
              onClick={() => handlePresetChange('quarter')}
              className={`btn ${datePreset === 'quarter' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Ten kwartał
            </button>
            <button
              onClick={() => handlePresetChange('custom')}
              className={`btn ${datePreset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Niestandardowy zakres
            </button>
          </div>

          {datePreset === 'custom' && (
            <div className="flex gap-4 items-center">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data początkowa
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data końcowa
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                />
              </div>
              <div className="pt-6">
                <button onClick={fetchReports} className="btn btn-primary">
                  Zastosuj
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Revenue Summary Cards */}
      {salesReport && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="card p-6">
              <p className="text-sm text-gray-600 mb-1">Suma brutto</p>
              <p className="text-2xl font-bold text-green-600">
                {(Number(salesReport.totalGross) || 0).toFixed(2)} PLN
              </p>
            </div>
            <div className="card p-6">
              <p className="text-sm text-gray-600 mb-1">Suma netto</p>
              <p className="text-2xl font-bold text-blue-600">
                {(Number(salesReport.totalNet) || 0).toFixed(2)} PLN
              </p>
            </div>
            <div className="card p-6">
              <p className="text-sm text-gray-600 mb-1">Suma VAT</p>
              <p className="text-2xl font-bold text-purple-600">
                {(Number(salesReport.totalVat) || 0).toFixed(2)} PLN
              </p>
            </div>
            <div className="card p-6">
              <p className="text-sm text-gray-600 mb-1">Liczba zamówień</p>
              <p className="text-2xl font-bold text-gray-900">
                {salesReport.orderCount}
              </p>
            </div>
            <div className="card p-6">
              <p className="text-sm text-gray-600 mb-1">Średnia wartość</p>
              <p className="text-2xl font-bold text-orange-600">
                {(Number(salesReport.averageOrderValue) || 0).toFixed(2)} PLN
              </p>
            </div>
          </div>

          {/* Daily Sales Chart */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Wykres sprzedaży dziennej
            </h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={salesReport.dailySales}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(new Date(value), 'dd.MM')}
                />
                <YAxis />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(2)} PLN`}
                  labelFormatter={(label) => format(new Date(label), 'dd.MM.yyyy')}
                />
                <Legend />
                <Bar dataKey="totalGross" fill="#10b981" name="Brutto" />
                <Bar dataKey="totalNet" fill="#3b82f6" name="Netto" />
                <Bar dataKey="totalVat" fill="#8b5cf6" name="VAT" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div className="card">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Top 10 produktów
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">Nazwa produktu</th>
                  <th className="text-right">Ilość sprzedana</th>
                  <th className="text-right">Przychód</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, index) => (
                  <tr key={product.productId}>
                    <td className="font-semibold text-gray-500">
                      {index + 1}
                    </td>
                    <td className="font-medium">{product.productName}</td>
                    <td className="text-right font-semibold text-blue-600">
                      {product.quantity} szt.
                    </td>
                    <td className="text-right font-semibold text-green-600">
                      {(Number(product.totalRevenue) || 0).toFixed(2)} PLN
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No data message */}
      {salesReport && salesReport.orderCount === 0 && (
        <div className="card p-12 text-center">
          <p className="text-gray-500 text-lg">
            Brak zamówień w wybranym okresie
          </p>
        </div>
      )}
    </div>
  );
}
