import { useState, useEffect } from 'react';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface AiSettings {
  hasApiKey: boolean;
  apiKeyPreview: string;
  model: string;
  defaultMargin: number;
}

export function AiImportSettingsTab() {
  const [settings, setSettings] = useState<AiSettings>({
    hasApiKey: false,
    apiKeyPreview: '',
    model: 'gpt-4o',
    defaultMargin: 50,
  });
  const [newApiKey, setNewApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/settings/ai-import`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (e) {
      console.error('Load AI settings error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const token = localStorage.getItem('token');
      const body: any = {
        model: settings.model,
        defaultMargin: settings.defaultMargin,
      };
      if (newApiKey.trim()) body.apiKey = newApiKey.trim();
      const response = await fetch(`${API_URL}/settings/ai-import`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setMessage('Ustawienia zapisane');
        setNewApiKey('');
        loadSettings();
        setTimeout(() => setMessage(''), 3000);
      } else {
        const err = await response.json();
        setMessage('Błąd: ' + (err.error || 'nieznany'));
      }
    } catch (e: any) {
      setMessage('Błąd: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/settings/ai-import/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setTestResult({ success: data.success, message: data.message || data.error });
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="p-4">Ładowanie...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-purple-800">Import faktur przez sztuczną inteligencję</h3>
        <p className="text-sm text-purple-600 mt-1">
          Automatyczne odczytywanie pozycji z faktur PDF dostawców i dodawanie produktów do magazynu.
          Wymaga klucza OpenAI API.
        </p>
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-purple-700 underline mt-2 inline-block"
        >
          Jak uzyskać klucz OpenAI API →
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* API Key */}
        <div className="p-4 bg-white rounded-lg border">
          <label className="block font-medium text-gray-700 mb-1">Klucz OpenAI API</label>
          {settings.hasApiKey && (
            <div className="text-sm text-green-700 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Klucz wgrany: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{settings.apiKeyPreview}</code>
            </div>
          )}
          <input
            type="password"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            placeholder={settings.hasApiKey ? 'Wpisz nowy klucz aby zmienić' : 'sk-proj-...'}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Klucz jest przechowywany w bezpieczny sposób w bazie danych
          </p>
        </div>

        {/* Model */}
        <div className="p-4 bg-white rounded-lg border">
          <label className="block font-medium text-gray-700 mb-1">Model AI</label>
          <select
            value={settings.model}
            onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="gpt-4o-mini">GPT-4o mini (tańszy, ~$0.005/faktura)</option>
            <option value="gpt-4o">GPT-4o (lepszy, ~$0.03/faktura)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Mini wystarcza dla większości faktur. Pełny dla skomplikowanych.
          </p>
        </div>

        {/* Pricing info */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            <strong>Ceny sprzedaży</strong> są wyliczane na podstawie ustawień z zakładki <strong>Ustawienia cenowe</strong> (% kosztów + % marży + VAT). Kurs <strong>EUR/PLN</strong> również pobierany jest stamtąd.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Zapisywanie...' : 'Zapisz ustawienia'}
        </button>
        {settings.hasApiKey && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            {testing ? 'Testowanie...' : 'Testuj połączenie'}
          </button>
        )}
      </div>

      {message && (
        <div className={`p-3 rounded-md text-sm ${message.startsWith('Błąd') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message}
        </div>
      )}

      {testResult && (
        <div className={`p-3 rounded-md text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult.message}
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600">
        <p className="font-semibold mb-1">Jak to działa:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Wgrywasz PDF faktury w zakładce Magazyn → "Importuj fakturę"</li>
          <li>System wyciąga tekst z PDF i wysyła do OpenAI</li>
          <li>AI rozpoznaje pozycje (nazwa, ilość, cena, paszport)</li>
          <li>System dopasowuje pozycje do produktów w bazie</li>
          <li>Weryfikujesz tabelę i zatwierdzasz import</li>
        </ol>
      </div>
    </div>
  );
}
