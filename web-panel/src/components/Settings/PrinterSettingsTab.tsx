import { useState, useEffect } from "react";

const BROKER_URL = "http://127.0.0.1:19432";

// Document types that can be printed
export type DocumentType =
  | "barcode_labels"
  | "orders"
  | "invoices"
  | "receipts"
  | "inventory_reports"
  | "delivery_notes";

// Map to broker document types
const DOC_TYPE_TO_BROKER: Record<DocumentType, string> = {
  barcode_labels: "label",
  orders: "order",
  invoices: "invoice",
  receipts: "receipt",
  inventory_reports: "report",
  delivery_notes: "delivery_note",
};

interface PrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  category: string;
}

interface BrokerConfig {
  port: number;
  allowedOrigins: string[];
  defaultPrinters: Record<string, string>;
}

const DOCUMENT_TYPES: { type: DocumentType; displayName: string; description: string; defaultPaper: string }[] = [
  {
    type: "barcode_labels",
    displayName: "Etykiety z kodami",
    description: "Drukarka termiczna do etykiet z kodami kreskowymi",
    defaultPaper: "50x30mm"
  },
  {
    type: "orders",
    displayName: "Zamówienia",
    description: "Wydruki zamówień dla magazynu",
    defaultPaper: "A4"
  },
  {
    type: "invoices",
    displayName: "Faktury",
    description: "Faktury VAT i dokumenty księgowe",
    defaultPaper: "A4"
  },
  {
    type: "receipts",
    displayName: "Paragony",
    description: "Paragony fiskalne i potwierdzenia",
    defaultPaper: "80mm"
  },
  {
    type: "inventory_reports",
    displayName: "Raporty magazynowe",
    description: "Raporty stanów i inwentaryzacji",
    defaultPaper: "A4"
  },
  {
    type: "delivery_notes",
    displayName: "Listy dostawy",
    description: "Dokumenty wydania towaru",
    defaultPaper: "A4"
  },
];

export function PrinterSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<DocumentType | null>(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [brokerOnline, setBrokerOnline] = useState(false);
  const [brokerPrinters, setBrokerPrinters] = useState<PrinterInfo[]>([]);
  const [brokerConfig, setBrokerConfig] = useState<BrokerConfig | null>(null);
  const [selectedPrinters, setSelectedPrinters] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      // Check broker status
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      try {
        const statusRes = await fetch(`${BROKER_URL}/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (statusRes.ok) {
          setBrokerOnline(true);

          // Fetch printers and config in parallel
          const [printersRes, configRes] = await Promise.all([
            fetch(`${BROKER_URL}/printers`),
            fetch(`${BROKER_URL}/config`),
          ]);

          if (printersRes.ok) {
            const printersData = await printersRes.json();
            setBrokerPrinters(printersData.printers || []);
          }

          if (configRes.ok) {
            const configData = await configRes.json();
            setBrokerConfig(configData.config || null);
            setSelectedPrinters(configData.config?.defaultPrinters || {});
          }
        } else {
          setBrokerOnline(false);
        }
      } catch (e) {
        clearTimeout(timeoutId);
        setBrokerOnline(false);
      }
    } catch (err: any) {
      console.error("Error fetching printer data:", err);
      setError("Nie można połączyć z Print Broker");
    } finally {
      setLoading(false);
    }
  };

  const handlePrinterChange = (documentType: DocumentType, printerName: string) => {
    const brokerType = DOC_TYPE_TO_BROKER[documentType];
    setSelectedPrinters(prev => ({
      ...prev,
      [brokerType]: printerName || "",
    }));
  };

  const handleSaveConfig = async (documentType: DocumentType) => {
    if (!brokerOnline) {
      setError("Print Broker nie jest połączony");
      return;
    }

    setSaving(documentType);
    setError("");

    try {
      const brokerType = DOC_TYPE_TO_BROKER[documentType];
      const printerName = selectedPrinters[brokerType] || "";

      const response = await fetch(`${BROKER_URL}/config/printer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: brokerType,
          printer: printerName,
        }),
      });

      if (response.ok) {
        setSuccess(`Zapisano drukarkę dla: ${DOCUMENT_TYPES.find(d => d.type === documentType)?.displayName}`);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await response.json();
        setError(data.error || "Błąd zapisywania konfiguracji");
      }
    } catch (err: any) {
      setError("Nie można połączyć z Print Broker");
    } finally {
      setSaving(null);
    }
  };

  const getSelectedPrinter = (documentType: DocumentType): string => {
    const brokerType = DOC_TYPE_TO_BROKER[documentType];
    return selectedPrinters[brokerType] || "";
  };

  if (loading && !brokerOnline) {
    return <div className="text-gray-500 p-6">Ładowanie...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${brokerOnline ? "bg-green-500" : "bg-red-500"}`}></div>
              <span className="text-sm text-gray-600">
                Print Broker {brokerOnline ? "online" : "offline"}
              </span>
            </div>
            {brokerOnline && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">{brokerPrinters.length}</span> drukarek dostępnych
              </div>
            )}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {loading ? "Sprawdzanie..." : "Odśwież"}
          </button>
        </div>
      </div>

      {/* Print Broker Download */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold mb-2">Print Broker</h2>
            <p className="text-sm text-gray-600 mb-3">
              Aplikacja do drukowania bezpośrednio z przeglądarki. Działa lokalnie na Twoim komputerze.
            </p>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-full ${brokerOnline ? "bg-green-500" : "bg-gray-400"}`}></div>
              <span className="text-sm">
                {brokerOnline ? "Połączono z Print Broker" : "Print Broker nie jest uruchomiony"}
              </span>
            </div>
            {brokerOnline && brokerPrinters.length > 0 && (
              <div className="text-sm text-gray-600">
                <span className="font-medium">Dostępne drukarki:</span>{" "}
                {brokerPrinters.map(p => p.displayName).join(", ")}
              </div>
            )}
          </div>
          <a
            href="https://pm.polflor.wroclaw.pl/api/downloads/print-broker.zip"
            download
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Pobierz Print Broker
          </a>
        </div>
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Instrukcja instalacji:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p className="font-medium text-gray-700">Windows:</p>
              <ol className="list-decimal list-inside mt-1 space-y-1">
                <li>Rozpakuj archiwum</li>
                <li>Zmień nazwę <code className="bg-gray-200 px-1 rounded">start-hidden.vbs.txt</code> na <code className="bg-gray-200 px-1 rounded">start-hidden.vbs</code></li>
                <li>Uruchom <code className="bg-gray-200 px-1 rounded">start-hidden.vbs</code></li>
                <li>Ikona pojawi się w zasobniku systemowym</li>
              </ol>
            </div>
            <div>
              <p className="font-medium text-gray-700">macOS:</p>
              <ol className="list-decimal list-inside mt-1 space-y-1">
                <li>Rozpakuj archiwum</li>
                <li>Uruchom <code className="bg-gray-200 px-1 rounded">./install-macos.sh</code> w terminalu</li>
                <li>Ikona pojawi się w pasku menu</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
          <button onClick={() => setError("")} className="float-right font-bold">×</button>
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {/* Printer Configurations */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Konfiguracja drukarek</h2>
        <p className="text-sm text-gray-500 mb-6">
          Przypisz drukarki do typów dokumentów. Konfiguracja jest zapisywana w Print Broker na Twoim komputerze.
        </p>

        {!brokerOnline && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">Print Broker nie jest uruchomiony</h4>
            <p className="text-sm text-yellow-700">
              Uruchom Print Broker na swoim komputerze, aby móc konfigurować drukarki.
              Pobierz go używając przycisku powyżej.
            </p>
            <p className="text-sm text-yellow-700 mt-2">
              <strong>Safari na macOS:</strong> Użyj Chrome lub Firefox - Safari blokuje połączenia localhost.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {DOCUMENT_TYPES.map(docType => {
            const selectedPrinter = getSelectedPrinter(docType.type);

            return (
              <div key={docType.type} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-medium text-gray-900">{docType.displayName}</h3>
                    <p className="text-sm text-gray-500">{docType.description}</p>
                  </div>
                  <button
                    onClick={() => handleSaveConfig(docType.type)}
                    disabled={saving === docType.type || !brokerOnline}
                    className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50"
                  >
                    {saving === docType.type ? "Zapisywanie..." : "Zapisz"}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Printer selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Drukarka
                    </label>
                    <select
                      value={selectedPrinter}
                      onChange={(e) => handlePrinterChange(docType.type, e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                      disabled={!brokerOnline}
                    >
                      <option value="">-- Domyślna systemowa --</option>
                      {brokerPrinters.map(printer => (
                        <option key={printer.name} value={printer.name}>
                          {printer.displayName} {printer.isDefault ? "(domyślna)" : ""}
                        </option>
                      ))}
                    </select>
                    {!brokerOnline && (
                      <p className="text-xs text-gray-400 mt-1">Uruchom Print Broker, aby wybrać drukarkę</p>
                    )}
                  </div>

                  {/* Paper size info */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Domyślny rozmiar papieru
                    </label>
                    <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50 text-gray-600">
                      {docType.defaultPaper}
                    </div>
                  </div>
                </div>

                {/* Status indicator */}
                {selectedPrinter && brokerOnline && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-green-700">
                      Przypisano: {brokerPrinters.find(p => p.name === selectedPrinter)?.displayName || selectedPrinter}
                    </span>
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
            <h4 className="font-medium mb-2">Pobierz Print Broker</h4>
            <p className="text-sm text-gray-600">
              Pobierz i uruchom Print Broker na komputerze z drukarkami.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">2</span>
            </div>
            <h4 className="font-medium mb-2">Skonfiguruj drukarki</h4>
            <p className="text-sm text-gray-600">
              Przypisz drukarki do typów dokumentów powyżej i kliknij Zapisz.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">3</span>
            </div>
            <h4 className="font-medium mb-2">Drukuj bezpośrednio</h4>
            <p className="text-sm text-gray-600">
              Wydruki będą automatycznie wysyłane na przypisane drukarki.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function getPrinterConfig(documentType: DocumentType): { printerName: string | null } | null {
  return null; // Config is now stored in broker
}
