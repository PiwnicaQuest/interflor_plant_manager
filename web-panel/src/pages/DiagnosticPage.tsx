import { useState, useEffect } from 'react';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface HealthData {
  status: string;
  timestamp?: string;
  uptime?: number;
  memoryMB?: number;
  heapMB?: number;
  db?: { responseMs: number; total: number; idle: number; waiting: number };
  error?: string;
}

interface ApiError {
  timestamp: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  message: string;
  errorData?: string;
}

export function DiagnosticPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthError, setHealthError] = useState<string>('');
  const [errors, setErrors] = useState<ApiError[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = async () => {
    setHealthLoading(true);
    setHealthError('');
    try {
      const start = Date.now();
      const res = await fetch(`${API_URL}/health`);
      const data = await res.json();
      data.frontendLatencyMs = Date.now() - start;
      setHealth(data);
    } catch (e: any) {
      setHealthError(e.message);
      setHealth({ status: 'unreachable', error: e.message });
    } finally {
      setHealthLoading(false);
    }
  };

  const loadErrors = () => {
    try {
      const log = JSON.parse(localStorage.getItem('apiErrorLog') || '[]');
      setErrors(log.reverse());
    } catch {
      setErrors([]);
    }
  };

  const clearLog = () => {
    if (confirm('Wyczyścić cały dziennik błędów?')) {
      localStorage.removeItem('apiErrorLog');
      setErrors([]);
    }
  };

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(errors, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-errors-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchHealth();
    loadErrors();

    const onError = () => loadErrors();
    window.addEventListener('api-error', onError);

    let interval: any;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchHealth();
        loadErrors();
      }, 5000);
    }

    return () => {
      window.removeEventListener('api-error', onError);
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  // Stats
  const now = Date.now();
  const errorsLast5min = errors.filter(e => now - new Date(e.timestamp).getTime() < 5 * 60 * 1000).length;
  const errorsLast1h = errors.filter(e => now - new Date(e.timestamp).getTime() < 60 * 60 * 1000).length;
  const errorsLast24h = errors.filter(e => now - new Date(e.timestamp).getTime() < 24 * 60 * 60 * 1000).length;

  const isHealthy = health?.status === 'ok';
  const statusColor = isHealthy ? 'green' : healthError || health?.status === 'error' ? 'red' : 'gray';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Diagnostyka systemu</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-odświeżanie (5s)
        </label>
      </div>

      {/* Health status card */}
      <div className={`bg-white rounded-lg shadow border-l-4 p-6 mb-6 ${
        statusColor === 'green' ? 'border-green-500' : statusColor === 'red' ? 'border-red-500' : 'border-gray-400'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${
              statusColor === 'green' ? 'bg-green-500' : statusColor === 'red' ? 'bg-red-500' : 'bg-gray-400'
            } ${healthLoading ? 'animate-pulse' : ''}`}></div>
            <h2 className="text-lg font-semibold">
              Backend: {isHealthy ? 'Działa poprawnie' : healthError || health?.error || 'Niedostępny'}
            </h2>
          </div>
          <button onClick={fetchHealth} disabled={healthLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
            {healthLoading ? 'Sprawdzanie...' : 'Odśwież'}
          </button>
        </div>
        {health && health.status === 'ok' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Uptime</div>
              <div className="font-semibold text-lg">{Math.floor((health.uptime || 0) / 60)}m {(health.uptime || 0) % 60}s</div>
            </div>
            <div>
              <div className="text-gray-500">Pamięć RSS</div>
              <div className="font-semibold text-lg">{health.memoryMB} MB</div>
            </div>
            <div>
              <div className="text-gray-500">Heap</div>
              <div className="font-semibold text-lg">{health.heapMB} MB</div>
            </div>
            <div>
              <div className="text-gray-500">Baza danych</div>
              <div className="font-semibold text-lg">{health.db?.responseMs} ms</div>
            </div>
            <div>
              <div className="text-gray-500">Pool: total / idle</div>
              <div className="font-semibold">{health.db?.total} / {health.db?.idle}</div>
            </div>
            <div>
              <div className="text-gray-500">Pool: oczekujące</div>
              <div className={`font-semibold ${(health.db?.waiting || 0) > 0 ? 'text-red-600' : ''}`}>
                {health.db?.waiting}
              </div>
            </div>
            {(health as any).frontendLatencyMs !== undefined && (
              <div>
                <div className="text-gray-500">Latencja frontend</div>
                <div className="font-semibold">{(health as any).frontendLatencyMs} ms</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Błędy ostatnie 5 min</div>
          <div className={`text-3xl font-bold ${errorsLast5min > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {errorsLast5min}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Błędy ostatnia godzina</div>
          <div className={`text-3xl font-bold ${errorsLast1h > 0 ? 'text-orange-600' : 'text-gray-800'}`}>
            {errorsLast1h}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Błędy ostatnie 24h</div>
          <div className="text-3xl font-bold text-gray-800">{errorsLast24h}</div>
        </div>
      </div>

      {/* Errors table */}
      <div className="bg-white rounded-lg shadow">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">Dziennik błędów API ({errors.length})</h2>
          <div className="flex gap-2">
            <button onClick={exportLog} disabled={errors.length === 0}
              className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 disabled:opacity-50">
              Eksport JSON
            </button>
            <button onClick={clearLog} disabled={errors.length === 0}
              className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
              Wyczyść log
            </button>
          </div>
        </div>
        {errors.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Brak błędów. System działa poprawnie.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Czas</th>
                  <th className="px-3 py-2 text-left">Metoda</th>
                  <th className="px-3 py-2 text-left">URL</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Komunikat</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err, idx) => (
                  <tr key={idx} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(err.timestamp).toLocaleString('pl-PL')}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">{err.method}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{err.url}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        err.status >= 500 ? 'bg-red-100 text-red-800' :
                        err.status >= 400 ? 'bg-orange-100 text-orange-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {err.status || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      <div>{err.statusText}</div>
                      {err.errorData && <div className="text-gray-500 truncate max-w-md">{err.errorData}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Logi są przechowywane lokalnie w przeglądarce (localStorage). Maksymalnie 100 ostatnich wpisów.
      </div>
    </div>
  );
}
