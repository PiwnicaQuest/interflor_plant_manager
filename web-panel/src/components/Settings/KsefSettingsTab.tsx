import { useState, useEffect } from 'react';
import { api } from '../../services/api';

interface KsefSettings {
  enabled: boolean;
  environment: string;
  token: string;
  autoSend: boolean;
  nip: string;
}

export function KsefSettingsTab() {
  const [settings, setSettings] = useState<KsefSettings>({
    enabled: false,
    environment: 'test',
    token: '',
    autoSend: false,
    nip: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getKsefSettings();
      setSettings(data);
    } catch (error) {
      console.error('Error loading KSeF settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const result = await api.updateKsefSettings(settings);
      setSaveMessage('Ustawienia zapisane');
      if (result.settings) setSettings(result.settings);
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error: any) {
      setSaveMessage('Blad: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testKsefConnection();
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="p-4">Ladowanie...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800">Krajowy System e-Faktur (KSeF)</h3>
        <p className="text-sm text-blue-600 mt-1">
          Od 1 kwietnia 2026 wystawianie e-faktur w KSeF jest obowiazkowe dla wszystkich podatnikow VAT.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
          <div>
            <label className="font-medium text-gray-700">Integracja KSeF</label>
            <p className="text-sm text-gray-500">Wlacz wysylanie faktur do KSeF</p>
          </div>
          <button
            onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Environment */}
        <div className="p-4 bg-white rounded-lg border">
          <label className="block font-medium text-gray-700 mb-1">Srodowisko</label>
          <select
            value={settings.environment}
            onChange={(e) => setSettings({ ...settings, environment: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="test">Testowe (api-test.ksef.mf.gov.pl)</option>
            <option value="demo">Demo (api-demo.ksef.mf.gov.pl)</option>
            <option value="production">Produkcyjne (api.ksef.mf.gov.pl)</option>
          </select>
          {settings.environment === 'production' && (
            <p className="text-sm text-red-500 mt-1">Uwaga: srodowisko produkcyjne - faktury beda widoczne w KSeF!</p>
          )}
        </div>

        {/* NIP */}
        <div className="p-4 bg-white rounded-lg border">
          <label className="block font-medium text-gray-700 mb-1">NIP do autoryzacji</label>
          <input
            type="text"
            value={settings.nip}
            onChange={(e) => setSettings({ ...settings, nip: e.target.value })}
            placeholder="NIP firmy (10 cyfr)"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Token */}
        <div className="p-4 bg-white rounded-lg border">
          <label className="block font-medium text-gray-700 mb-1">Token autoryzacyjny KSeF</label>
          <input
            type="password"
            value={settings.token}
            onChange={(e) => setSettings({ ...settings, token: e.target.value })}
            placeholder="Token wygenerowany w MCU (ap-test.ksef.mf.gov.pl)"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-sm text-gray-500 mt-1">
            Token generujesz w Aplikacji Podatnika KSeF w module MCU (Certyfikaty i Uprawnienia)
          </p>
        </div>

        {/* Auto-send */}
        <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
          <div>
            <label className="font-medium text-gray-700">Automatyczna wysylka</label>
            <p className="text-sm text-gray-500">Automatycznie wysylaj faktury do KSeF po wystawieniu</p>
          </div>
          <button
            onClick={() => setSettings({ ...settings, autoSend: !settings.autoSend })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.autoSend ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.autoSend ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
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
        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          {testing ? 'Testowanie...' : 'Testuj polaczenie'}
        </button>
      </div>

      {saveMessage && (
        <div className={`p-3 rounded-md text-sm ${saveMessage.startsWith('Blad') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {saveMessage}
        </div>
      )}

      {testResult && (
        <div className={`p-3 rounded-md text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult.message}
        </div>
      )}
    </div>
  );
}
