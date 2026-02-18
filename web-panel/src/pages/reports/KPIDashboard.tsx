import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { KPIData } from '../../types/reports';

interface DateRange {
  startDate: string;
  endDate: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value);
}

function formatPercentage(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
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

export function KPIDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getKPIComparison(dateRange.startDate, dateRange.endDate);
        setKpiData(response);
      } catch (err) {
        console.error('Error fetching KPI data:', err);
        setError('Nie udało się pobrać danych KPI');
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
        <button
          onClick={() => setDateRange(getDefaultDateRange())}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

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

      {kpiData && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Revenue Card */}
            <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-6 border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-primary-700">Przychód</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  kpiData.changes.totalGross >= 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                }`}>
                  {formatPercentage(kpiData.changes.totalGross)}
                </span>
              </div>
              <p className="text-2xl font-bold text-primary-900">{formatCurrency(kpiData.current.totalGross)}</p>
              <p className="text-sm text-primary-600 mt-1">
                Poprzednio: {formatCurrency(kpiData.previous.totalGross)}
              </p>
            </div>

            {/* Orders Card */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-700">Zamówienia</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  kpiData.changes.ordersCount >= 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                }`}>
                  {formatPercentage(kpiData.changes.ordersCount)}
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-900">{kpiData.current.ordersCount}</p>
              <p className="text-sm text-blue-600 mt-1">
                Poprzednio: {kpiData.previous.ordersCount}
              </p>
            </div>

            {/* Customers Card */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-700">Klienci</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  kpiData.changes.customersCount >= 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                }`}>
                  {formatPercentage(kpiData.changes.customersCount)}
                </span>
              </div>
              <p className="text-2xl font-bold text-purple-900">{kpiData.current.customersCount}</p>
              <p className="text-sm text-purple-600 mt-1">
                Poprzednio: {kpiData.previous.customersCount}
              </p>
            </div>

            {/* Average Order Value Card */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-orange-700">Śr. wartość zamówienia</span>
              </div>
              <p className="text-2xl font-bold text-orange-900">{formatCurrency(kpiData.current.avgOrderValue)}</p>
              <p className="text-sm text-orange-600 mt-1">
                Poprzednio: {formatCurrency(kpiData.previous.avgOrderValue)}
              </p>
            </div>
          </div>

          {/* Period Info */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p>
              <strong>Okres bieżący:</strong> {dateRange.startDate} - {dateRange.endDate} ({kpiData.periodDays} dni)
            </p>
            <p>
              <strong>Okres porównawczy:</strong> {kpiData.previousPeriod.start} - {kpiData.previousPeriod.end}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
