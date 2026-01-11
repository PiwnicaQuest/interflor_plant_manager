import { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface LoginHistoryEntry {
  id: number;
  userId: number;
  ipAddress: string | null;
  userAgent: string | null;
  source: 'panel' | 'shop';
  success: boolean;
  errorMessage: string | null;
  loginAt: string;
  userEmail?: string;
  userRole?: string;
  customerName?: string;
}

interface LoginHistoryStats {
  totalLogins: number;
  successfulLogins: number;
  failedLogins: number;
  uniqueUsers: number;
  shopLogins: number;
  panelLogins: number;
}

export function LoginHistoryTab() {
  const [entries, setEntries] = useState<LoginHistoryEntry[]>([]);
  const [stats, setStats] = useState<LoginHistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Filters
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'' | 'panel' | 'shop'>('');
  const [successFilter, setSuccessFilter] = useState<'' | 'true' | 'false'>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [historyRes, statsRes] = await Promise.all([
        api.getLoginHistory({
          search: search || undefined,
          source: sourceFilter || undefined,
          success: successFilter === '' ? undefined : successFilter,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize
        }),
        api.getLoginHistoryStats()
      ]);

      setEntries(historyRes.entries);
      setTotal(historyRes.total);
      setStats(statsRes);
    } catch (error) {
      console.error('Error fetching login history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, search, sourceFilter, successFilter, startDate, endDate]);

  const handleExport = async () => {
    try {
      const blob = await api.exportLoginHistory({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        source: sourceFilter || undefined
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `historia-logowan-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin': return 'Administrator';
      case 'warehouse': return 'Magazynier';
      case 'pos': return 'Kasjer';
      case 'customer': return 'Klient';
      default: return role || '-';
    }
  };

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return '-';
    // Simplify user agent
    if (ua.includes('Mobile')) return 'Telefon';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Przeglądarka';
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-gray-900">{stats.totalLogins}</div>
            <div className="text-sm text-gray-500">Logowania (30 dni)</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-green-600">{stats.successfulLogins}</div>
            <div className="text-sm text-gray-500">Udane</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-red-600">{stats.failedLogins}</div>
            <div className="text-sm text-gray-500">Nieudane</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{stats.uniqueUsers}</div>
            <div className="text-sm text-gray-500">Unikalnych</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-orange-600">{stats.shopLogins}</div>
            <div className="text-sm text-gray-500">Sklep</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-purple-600">{stats.panelLogins}</div>
            <div className="text-sm text-gray-500">Panel</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Szukaj</label>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Email, firma, IP..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zrodlo</label>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value as '' | 'panel' | 'shop'); setPage(1); }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="">Wszystkie</option>
              <option value="shop">Sklep</option>
              <option value="panel">Panel</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={successFilter}
              onChange={(e) => { setSuccessFilter(e.target.value as '' | 'true' | 'false'); setPage(1); }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="">Wszystkie</option>
              <option value="true">Udane</option>
              <option value="false">Nieudane</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Od</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Do</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleExport}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Eksportuj CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uzytkownik</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kontrahent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rola</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zrodlo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Przegladarka</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Ladowanie...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Brak danych
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className={!entry.success ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {formatDate(entry.loginAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {entry.userEmail || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {entry.customerName || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        entry.userRole === 'admin' ? 'bg-purple-100 text-purple-800' :
                        entry.userRole === 'warehouse' ? 'bg-blue-100 text-blue-800' :
                        entry.userRole === 'pos' ? 'bg-green-100 text-green-800' :
                        entry.userRole === 'customer' ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {getRoleLabel(entry.userRole)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        entry.source === 'shop' ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {entry.source === 'shop' ? 'Sklep' : 'Panel'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                      {entry.ipAddress || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600" title={entry.userAgent || ''}>
                      {parseUserAgent(entry.userAgent)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {entry.success ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Sukces
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600" title={entry.errorMessage || ''}>
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Blad
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Pokazano {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} z {total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Poprzednia
              </button>
              <span className="px-3 py-1">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Nastepna
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
