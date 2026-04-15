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

  // Certificate state
  const [certStatus, setCertStatus] = useState<any>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certPem, setCertPem] = useState('');
  const [certKeyPem, setCertKeyPem] = useState('');
  const [certKeyPassword, setCertKeyPassword] = useState('');
  const [certUploading, setCertUploading] = useState(false);
  const [certMessage, setCertMessage] = useState('');
  const [csrGenerating, setCsrGenerating] = useState(false);
  const [csrResult, setCsrResult] = useState<any>(null);

  useEffect(() => {
    loadSettings();
    loadCertStatus();
  }, []);

  const loadCertStatus = async () => {
    setCertLoading(true);
    try {
      const data = await api.getKsefCertificateStatus();
      setCertStatus(data);
    } catch (error) {
      console.error('Error loading certificate status:', error);
    } finally {
      setCertLoading(false);
    }
  };

  const handleUploadCert = async () => {
    if (!certPem.trim() || !certKeyPem.trim()) {
      setCertMessage('Podaj certyfikat PEM i klucz prywatny PEM');
      return;
    }
    setCertUploading(true);
    setCertMessage('');
    try {
      const result = await api.uploadKsefCertificate(certPem.trim(), certKeyPem.trim(), certKeyPassword || undefined);
      setCertMessage('Certyfikat wgrany pomyslnie');
      setCertPem('');
      setCertKeyPem('');
      loadCertStatus();
      setTimeout(() => setCertMessage(''), 5000);
    } catch (error: any) {
      setCertMessage('Blad: ' + (error.response?.data?.error || error.message));
    } finally {
      setCertUploading(false);
    }
  };

  const handleGenerateCsr = async () => {
    setCsrGenerating(true);
    setCsrResult(null);
    try {
      const result = await api.generateKsefCsr();
      setCsrResult(result);
    } catch (error: any) {
      setCsrResult({ error: error.response?.data?.error || error.message });
    } finally {
      setCsrGenerating(false);
    }
  };

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

      {/* Certificate Section */}
      <div className="mt-6 p-4 bg-white rounded-lg border">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Certyfikat KSeF typ 2 (offline)</h3>
        <p className="text-sm text-gray-500 mb-4">
          Certyfikat do podpisywania faktur w trybie offline. Generujesz CSR, wysylasz do MCU, otrzymujesz certyfikat.
        </p>

        {/* Certificate Status */}
        {certLoading ? (
          <div className="text-sm text-gray-500 mb-4">Ladowanie statusu certyfikatu...</div>
        ) : certStatus?.hasCertificate ? (
          <div className={`p-3 rounded-md mb-4 ${certStatus.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block w-2 h-2 rounded-full ${certStatus.isValid ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className={`text-sm font-medium ${certStatus.isValid ? 'text-green-700' : 'text-red-700'}`}>
                {certStatus.isValid ? 'Certyfikat aktywny' : 'Certyfikat nieaktywny/wygasl'}
              </span>
            </div>
            <div className="text-xs text-gray-600 space-y-1 ml-4">
              <div><strong>Numer seryjny:</strong> {certStatus.serial}</div>
              <div><strong>Podmiot:</strong> {certStatus.subject}</div>
              <div><strong>Wazny od:</strong> {certStatus.validFrom}</div>
              <div><strong>Wazny do:</strong> {certStatus.validTo}</div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-md mb-4 bg-yellow-50 border border-yellow-200">
            <span className="text-sm text-yellow-700">Brak wgranego certyfikatu</span>
          </div>
        )}

        {/* Upload certificate */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certyfikat (.crt, .pem, .cer)</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 text-sm">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                {certPem ? 'Zmien plik .crt' : 'Wybierz plik .crt'}
                <input type="file" accept=".crt,.pem,.cer" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setCertPem(ev.target?.result as string || '');
                    reader.readAsText(file);
                  }
                }} />
              </label>
              {certPem && <span className="text-xs text-green-600 font-medium">Zaladowano</span>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Klucz prywatny (.key, .pem)</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 text-sm">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                {certKeyPem ? 'Zmien plik .key' : 'Wybierz plik .key'}
                <input type="file" accept=".key,.pem" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setCertKeyPem(ev.target?.result as string || '');
                    reader.readAsText(file);
                  }
                }} />
              </label>
              {certKeyPem && <span className="text-xs text-green-600 font-medium">Zaladowano</span>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Haslo klucza prywatnego (opcjonalne)</label>
            <input
              type="password"
              value={certKeyPassword}
              onChange={(e) => setCertKeyPassword(e.target.value)}
              placeholder="Zostaw puste jesli klucz nie jest zaszyfrowany"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-3 items-center pt-1">
            <button
              onClick={handleUploadCert}
              disabled={certUploading || !certPem || !certKeyPem}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              {certUploading ? 'Wgrywanie...' : 'Wgraj certyfikat'}
            </button>
            {certPem && certKeyPem && <span className="text-xs text-gray-500">Gotowe do wgrania</span>}
          </div>
        </div>

        {certMessage && (
          <div className={`p-3 rounded-md text-sm mb-4 ${certMessage.startsWith('Blad') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {certMessage}
          </div>
        )}

        {/* Generate CSR */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Generowanie CSR</h4>
          <p className="text-xs text-gray-500 mb-3">
            Wygeneruj zadanie podpisania certyfikatu (CSR) i przeslij je do MCU w Aplikacji Podatnika KSeF.
          </p>
          <button
            onClick={handleGenerateCsr}
            disabled={csrGenerating}
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 text-sm"
          >
            {csrGenerating ? 'Generowanie...' : 'Generuj CSR'}
          </button>
        </div>

        {csrResult && !csrResult.error && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CSR (skopiuj i przeslij do MCU)</label>
              <textarea
                readOnly
                value={csrResult.csr}
                rows={6}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono bg-gray-50"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-red-700 mb-1">Klucz prywatny (ZAPISZ BEZPIECZNIE - nie bedzie pokazany ponownie!)</label>
              <textarea
                readOnly
                value={csrResult.privateKeyPem}
                rows={6}
                className="w-full border border-red-300 rounded-md px-3 py-2 text-xs font-mono bg-red-50"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </div>
            <p className="text-xs text-gray-500">{csrResult.message}</p>
          </div>
        )}

        {csrResult?.error && (
          <div className="mt-3 p-3 rounded-md text-sm bg-red-50 text-red-700">
            Blad: {csrResult.error}
          </div>
        )}
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
