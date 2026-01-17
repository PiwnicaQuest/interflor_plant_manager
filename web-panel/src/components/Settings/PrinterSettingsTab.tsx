import { useState, useEffect } from 'react';
import { getBrokerPrinters } from '../../hooks/usePrint';
import { api } from '../../services/api';

// Document types that can be printed
export type DocumentType =
  | 'barcode_labels'
  | 'orders'
  | 'invoices'
  | 'receipts'
  | 'inventory_reports'
  | 'delivery_notes';

interface PrintAgent {
  id: number;
  agentId: string;
  name: string;
  lastSeen: string;
  isOnline: boolean;
  availablePrinters: string[];
}

interface PrinterConfig {
  id: number;
  documentType: DocumentType;
  agentId: string | null;
  printerName: string | null;
  paperSize: string;
  copies: number;
  orientation: string;
  colorMode: string;
  isActive: boolean;
  agentName?: string;
  agentOnline?: boolean;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  todayCompleted: number;
}

const DOCUMENT_TYPES: { type: DocumentType; displayName: string; description: string; defaultPaper: string }[] = [
  {
    type: 'barcode_labels',
    displayName: 'Etykiety z kodami',
    description: 'Drukarka termiczna do etykiet z kodami kreskowymi',
    defaultPaper: '100x50mm'
  },
  {
    type: 'orders',
    displayName: 'Zamówienia',
    description: 'Wydruki zamówień dla magazynu',
    defaultPaper: 'A4'
  },
  {
    type: 'invoices',
    displayName: 'Faktury',
    description: 'Faktury VAT i dokumenty księgowe',
    defaultPaper: 'A4'
  },
  {
    type: 'receipts',
    displayName: 'Paragony',
    description: 'Paragony fiskalne i potwierdzenia',
    defaultPaper: '80mm'
  },
  {
    type: 'inventory_reports',
    displayName: 'Raporty magazynowe',
    description: 'Raporty stanów i inwentaryzacji',
    defaultPaper: 'A4'
  },
  {
    type: 'delivery_notes',
    displayName: 'Listy dostawy',
    description: 'Dokumenty wydania towaru',
    defaultPaper: 'A4'
  },
];

const PAPER_SIZES = [
  'A4',
  'A5',
  'Letter',
  '80mm',
  '100x50mm',
  '100x150mm',
  '57mm',
];

export function PrinterSettingsTab() {
  const [configs, setConfigs] = useState<PrinterConfig[]>([]);
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<DocumentType | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [brokerOnline, setBrokerOnline] = useState(false);
  const [brokerPrinters, setBrokerPrinters] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [configsRes, agentsRes, statsRes, brokerPrintersRes] = await Promise.all([
        api.getPrintConfigs(),
        api.getPrintAgents(),
        api.getPrintStats(),
        getBrokerPrinters().catch(() => []),
      ]);

      setConfigs(configsRes.configs || []);
      setAgents(agentsRes.agents || []);
      setStats(statsRes.stats || null);
      setBrokerOnline(brokerPrintersRes.length > 0 || false);
      setBrokerPrinters(brokerPrintersRes.map((p: any) => p.displayName || p.name));
      setError('');
    } catch (err: any) {
      console.error('Error fetching printer data:', err);
      setError('Nie można załadować konfiguracji drukarek');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = async (documentType: DocumentType, field: string, value: any) => {
    // Update local state immediately
    setConfigs(prev =>
      prev.map(config =>
        config.documentType === documentType
          ? { ...config, [field]: value }
          : config
      )
    );
  };

  const handleSaveConfig = async (documentType: DocumentType) => {
    const config = configs.find(c => c.documentType === documentType);
    if (!config) return;

    try {
      setSaving(documentType);
      setError('');

      await api.updatePrintConfig(documentType, {
        agentId: config.agentId,
        printerName: config.printerName,
        paperSize: config.paperSize,
        copies: config.copies,
        orientation: config.orientation,
        colorMode: config.colorMode,
        isActive: config.isActive,
      });

      setSuccess('Konfiguracja zapisana');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error saving config:', err);
      setError('Błąd zapisywania konfiguracji');
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tego agenta?')) return;

    try {
      await api.deletePrintAgent(agentId);
      await fetchData();
    } catch (err: any) {
      setError('Błąd usuwania agenta');
    }
  };

  const getAgentPrinters = (agentId: string | null): string[] => {
    if (!agentId) return [];
    const agent = agents.find(a => a.agentId === agentId);
    return agent?.availablePrinters || [];
  };

  if (loading && configs.length === 0) {
    return <div className="text-gray-500 p-6">Ładowanie...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${agents.some(a => a.isOnline) ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {agents.filter(a => a.isOnline).length} agent(ów) online</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${brokerOnline ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
              <span className="text-sm text-gray-600">
                Print Broker {brokerOnline ? 'online' : 'offline'}
              </span>
            </div>
            {stats && (
              <>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{stats.pending}</span> w kolejce
                </div>
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{stats.todayCompleted}</span> wydrukowano dziś
                </div>
              </>
            )}
          </div>
          <button
            onClick={fetchData}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Odśwież
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">×</button>
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {/* Agents section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Agenty druku (Print Agents)</h2>

        {agents.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">Brak agentów druku</h4>
            <p className="text-sm text-yellow-700 mb-3">
              Aby drukować automatycznie na wybranych drukarkach, musisz uruchomić Print Agent na komputerze z drukarkami.
            </p>
            <div className="text-sm text-yellow-700">
              <strong>Jak zainstalować:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Pobierz instalator (przycisk powyżej)</li>
                <li>Uruchom pobrany plik <code className="bg-yellow-100 px-1 rounded">POLFLOR-PrintAgent-Installer.bat</code></li>
                <li>Gotowe! Agent uruchomi się automatycznie</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map(agent => (
              <div
                key={agent.agentId}
                className={`border rounded-lg p-4 ${agent.isOnline ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${agent.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      <h3 className="font-medium">{agent.name}</h3>
                      <span className="text-xs text-gray-500">({agent.agentId})</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Ostatnio widziany: {new Date(agent.lastSeen).toLocaleString('pl-PL')}
                    </p>
                    {agent.availablePrinters && agent.availablePrinters.length > 0 && (
                      <div className="mt-2">
                        <span className="text-sm text-gray-600">Drukarki: </span>
                        <span className="text-sm font-medium">
                          {agent.availablePrinters.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteAgent(agent.agentId)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Usuń
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Printer Configurations */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Konfiguracja drukarek</h2>
        <p className="text-sm text-gray-500 mb-6">
          Przypisz drukarki do typów dokumentów. Wydruki będą automatycznie wysyłane do odpowiednich drukarek.
        </p>

        <div className="space-y-6">
          {DOCUMENT_TYPES.map(docType => {
            const config = configs.find(c => c.documentType === docType.type);
            const availablePrinters = config?.agentId ? getAgentPrinters(config.agentId) : [];

            return (
              <div key={docType.type} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-medium text-gray-900">{docType.displayName}</h3>
                    <p className="text-sm text-gray-500">{docType.description}</p>
                  </div>
                  <button
                    onClick={() => handleSaveConfig(docType.type)}
                    disabled={saving === docType.type}
                    className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50"
                  >
                    {saving === docType.type ? 'Zapisywanie...' : 'Zapisz'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Agent selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Agent druku
                    </label>
                    <select
                      value={config?.agentId || ''}
                      onChange={(e) => handleConfigChange(docType.type, 'agentId', e.target.value || null)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">-- Wybierz agenta --</option>
                      {agents.map(agent => (
                        <option key={agent.agentId} value={agent.agentId}>
                          {agent.name} {agent.isOnline ? '(online)' : '(offline)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Printer selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Drukarka
                    </label>
                    <select
                      value={config?.printerName || ''}
                      onChange={(e) => handleConfigChange(docType.type, 'printerName', e.target.value || null)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                      disabled={!config?.agentId}
                    >
                      <option value="">-- Domyślna --</option>
                      {availablePrinters.map(printer => (
                        <option key={printer} value={printer}>{printer}</option>
                      ))}
                    </select>
                    {!config?.agentId && (
                      <p className="text-xs text-gray-400 mt-1">Najpierw wybierz agenta</p>
                    )}
                  </div>

                  {/* Paper size */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rozmiar papieru
                    </label>
                    <select
                      value={config?.paperSize || docType.defaultPaper}
                      onChange={(e) => handleConfigChange(docType.type, 'paperSize', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {PAPER_SIZES.map(size => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>

                  {/* Copies */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Liczba kopii
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={config?.copies || 1}
                      onChange={(e) => handleConfigChange(docType.type, 'copies', parseInt(e.target.value) || 1)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                {/* Status indicator */}
                {config?.agentId && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    {agents.find(a => a.agentId === config.agentId)?.isOnline ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span className="text-green-700">Agent online - gotowy do druku</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        <span className="text-red-700">Agent offline - wydruki będą czekać w kolejce</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Jak to działa?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">1</span>
            </div>
            <h4 className="font-medium mb-2">Uruchom Print Agent</h4>
            <p className="text-sm text-gray-600">
              Na komputerze z drukarkami uruchom aplikację Print Agent. Automatycznie wykryje drukarki.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">2</span>
            </div>
            <h4 className="font-medium mb-2">Skonfiguruj drukarki</h4>
            <p className="text-sm text-gray-600">
              Przypisz drukarki do typów dokumentów powyżej. Np. drukarkę termiczną do etykiet.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">3</span>
            </div>
            <h4 className="font-medium mb-2">Drukuj automatycznie</h4>
            <p className="text-sm text-gray-600">
              Wydruki z panelu będą automatycznie wysyłane na odpowiednie drukarki bez okna dialogowego.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export function to send print job
export const sendPrintJob = async (
  documentType: DocumentType,
  htmlContent: string,
  title?: string,
  sourceType?: string,
  sourceId?: number
): Promise<{ success: boolean; jobId?: string; error?: string }> => {
  try {
    const response = await api.createPrintJob({
      documentType,
      contentType: 'html',
      content: htmlContent,
      title,
      sourceType,
      sourceId,
    });

    return {
      success: true,
      jobId: response.job.jobId,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message,
    };
  }
};
