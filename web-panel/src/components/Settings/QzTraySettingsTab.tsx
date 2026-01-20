import { useState, useEffect, useCallback } from 'react';
import { printerService, DocumentType, DOCUMENT_TYPE_LABELS, PrinterMapping } from '../../services/printerService';

const DOCUMENT_TYPES: DocumentType[] = [
  'order',
  'invoice',
  'receipt',
  'receipt-a4',
  'proforma',
  'correction',
  'label',
];

export function QzTraySettingsTab() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [mappings, setMappings] = useState<PrinterMapping[]>([]);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [qzInstalled, setQzInstalled] = useState<boolean | null>(null);

  // Załaduj konfigurację
  const loadConfig = useCallback(() => {
    const config = printerService.getConfig();
    setMappings(config.mappings);
    setDefaultPrinter(config.defaultPrinter);
    setConnected(printerService.isConnected());
    setPrinters(printerService.getAvailablePrinters());
  }, []);

  useEffect(() => {
    loadConfig();

    // Subskrybuj zmiany
    const unsubscribe = printerService.subscribe(() => {
      loadConfig();
    });

    return () => unsubscribe();
  }, [loadConfig]);

  // Sprawdź czy QZ Tray jest zainstalowany
  useEffect(() => {
    const checkQz = async () => {
      const installed = await printerService.isQzInstalled();
      setQzInstalled(installed);
      if (installed) {
        setConnected(printerService.isConnected());
        setPrinters(printerService.getAvailablePrinters());
      }
    };
    checkQz();
  }, []);

  // Połącz z QZ Tray
  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await printerService.connect();
      const printerList = await printerService.refreshPrinters();
      setPrinters(printerList);
      setConnected(true);
      setSuccess('Połączono z QZ Tray');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Nie można połączyć z QZ Tray. Upewnij się, że aplikacja jest uruchomiona.');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  };

  // Rozłącz
  const handleDisconnect = async () => {
    await printerService.disconnect();
    setConnected(false);
    setPrinters([]);
  };

  // Odśwież listę drukarek
  const handleRefreshPrinters = async () => {
    try {
      const printerList = await printerService.refreshPrinters();
      setPrinters(printerList);
      setSuccess('Lista drukarek odświeżona');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Błąd podczas odświeżania listy drukarek');
    }
  };

  // Zmień mapowanie drukarki
  const handleMappingChange = (documentType: DocumentType, printerName: string) => {
    if (printerName === '') {
      printerService.removeMapping(documentType);
    } else {
      printerService.setMapping(documentType, printerName, true);
    }
    loadConfig();
  };

  // Zmień domyślną drukarkę
  const handleDefaultPrinterChange = (printerName: string) => {
    printerService.setDefaultPrinter(printerName === '' ? null : printerName);
    loadConfig();
  };

  // Pobierz aktualną drukarkę dla typu dokumentu
  const getPrinterForType = (documentType: DocumentType): string => {
    const mapping = mappings.find(m => m.documentType === documentType);
    return mapping?.printerName || '';
  };

  // Test drukowania
  const handleTestPrint = async (documentType: DocumentType) => {
    const printerName = printerService.getPrinterForDocument(documentType);
    if (!printerName) {
      setError(`Brak skonfigurowanej drukarki dla: ${DOCUMENT_TYPE_LABELS[documentType]}`);
      return;
    }

    try {
      const testHtml = `
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #2e7d32; }
            .info { margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1>Test drukowania - POLFLOR</h1>
          <div class="info"><strong>Typ dokumentu:</strong> ${DOCUMENT_TYPE_LABELS[documentType]}</div>
          <div class="info"><strong>Drukarka:</strong> ${printerName}</div>
          <div class="info"><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</div>
          <p>Jeśli widzisz ten wydruk, konfiguracja QZ Tray działa poprawnie!</p>
        </body>
        </html>
      `;

      const result = await printerService.printHtml(testHtml, documentType);
      if (result) {
        setSuccess(`Wysłano test do drukarki: ${printerName}`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError('Nie udało się wydrukować testu');
      }
    } catch (err: any) {
      setError(`Błąd drukowania: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status QZ Tray */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">QZ Tray - Lokalne drukowanie</h2>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-gray-700">
              {connected ? 'Połączono z QZ Tray' : 'Brak połączenia'}
            </span>
            {printers.length > 0 && (
              <span className="text-sm text-gray-500">
                ({printers.length} drukarek dostępnych)
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {connected ? (
              <>
                <button
                  onClick={handleRefreshPrinters}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md"
                >
                  Odśwież drukarki
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md"
                >
                  Rozłącz
                </button>
              </>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50"
              >
                {connecting ? 'Łączenie...' : 'Połącz z QZ Tray'}
              </button>
            )}
          </div>
        </div>

        {qzInstalled === false && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">QZ Tray nie jest zainstalowany</h4>
            <p className="text-sm text-yellow-700 mb-3">
              Aby korzystać z automatycznego drukowania na wybranych drukarkach, musisz zainstalować QZ Tray.
            </p>
            <a
              href="https://qz.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Pobierz QZ Tray
            </a>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={() => setError(null)} className="float-right font-bold">×</button>
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}
      </div>

      {/* Domyślna drukarka */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Domyślna drukarka</h3>
        <p className="text-sm text-gray-500 mb-4">
          Drukarka używana gdy nie ma specyficznego mapowania dla danego typu dokumentu.
        </p>

        <select
          value={defaultPrinter || ''}
          onChange={(e) => handleDefaultPrinterChange(e.target.value)}
          disabled={!connected || printers.length === 0}
          className="w-full max-w-md border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
        >
          <option value="">-- Brak (użyj systemowej domyślnej) --</option>
          {printers.map(printer => (
            <option key={printer} value={printer}>{printer}</option>
          ))}
        </select>
      </div>

      {/* Mapowanie drukarek */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Mapowanie drukarek do dokumentów</h3>
        <p className="text-sm text-gray-500 mb-6">
          Przypisz konkretne drukarki do typów dokumentów. Wydruki będą automatycznie wysyłane na odpowiednie drukarki.
        </p>

        <div className="space-y-4">
          {DOCUMENT_TYPES.map(docType => (
            <div key={docType} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{DOCUMENT_TYPE_LABELS[docType]}</h4>
              </div>

              <div className="flex-1">
                <select
                  value={getPrinterForType(docType)}
                  onChange={(e) => handleMappingChange(docType, e.target.value)}
                  disabled={!connected || printers.length === 0}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                >
                  <option value="">-- Użyj domyślnej --</option>
                  {printers.map(printer => (
                    <option key={printer} value={printer}>{printer}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => handleTestPrint(docType)}
                disabled={!connected || !printerService.getPrinterForDocument(docType)}
                className="px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Test
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Dostępne drukarki */}
      {connected && printers.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Dostępne drukarki</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {printers.map(printer => (
              <div
                key={printer}
                className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span className="text-sm text-gray-700 truncate">{printer}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certyfikat */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Instalacja certyfikatu (jednorazowo)</h3>
        <p className="text-sm text-gray-600 mb-4">
          Aby drukowanie działało bez okien z pytaniami o zaufanie, pobierz i zainstaluj certyfikat w QZ Tray:
        </p>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
            <li>Pobierz certyfikat klikając przycisk poniżej</li>
            <li>W QZ Tray (ikona w zasobniku systemowym) kliknij prawym przyciskiem myszy</li>
            <li>Wybierz <strong>Advanced</strong> &rarr; <strong>Site Manager</strong></li>
            <li>Kliknij <strong>+</strong> (Add), wpisz domenę: <code className="bg-blue-100 px-1 rounded">pm.polflor.wroclaw.pl</code></li>
            <li>Zaznacz <strong>Trusted</strong> i kliknij przycisk <strong>Browse</strong> przy Certificate</li>
            <li>Wybierz pobrany plik certyfikatu i zapisz zmiany</li>
          </ol>
        </div>

        <a
          href="/polflor-qz-certificate.crt"
          download="polflor-qz-certificate.crt"
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Pobierz certyfikat POLFLOR
        </a>
      </div>

      {/* Instrukcja */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Jak to działa?</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-blue-600">1</span>
            </div>
            <h4 className="font-medium mb-2">Zainstaluj QZ Tray</h4>
            <p className="text-sm text-gray-600">
              Pobierz i zainstaluj QZ Tray na komputerze z drukarkami.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-blue-600">2</span>
            </div>
            <h4 className="font-medium mb-2">Połącz się</h4>
            <p className="text-sm text-gray-600">
              Kliknij "Połącz z QZ Tray" - aplikacja wykryje drukarki.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-blue-600">3</span>
            </div>
            <h4 className="font-medium mb-2">Skonfiguruj</h4>
            <p className="text-sm text-gray-600">
              Przypisz drukarki do typów dokumentów powyżej.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-blue-600">4</span>
            </div>
            <h4 className="font-medium mb-2">Drukuj</h4>
            <p className="text-sm text-gray-600">
              Wydruki będą automatycznie wysyłane na odpowiednie drukarki.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
