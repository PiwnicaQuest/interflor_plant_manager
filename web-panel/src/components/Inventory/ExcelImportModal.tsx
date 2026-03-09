import { useState, useRef } from 'react';
import { api } from '../../services/api';

interface ExcelImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
  forceCurrency?: 'EUR' | 'PLN';
  format?: 'standard' | 'polflor';
}

export function ExcelImportModal({ onClose, onSuccess, forceCurrency, format = 'standard' }: ExcelImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState<'EUR' | 'PLN'>(forceCurrency || 'EUR');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
    deliveryDate?: string | null;
    errors: Array<{ row: number; error: string; data?: any }>;
  } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validExtensions = ['.xls', '.xlsx', '.ods'];
      const hasValidExtension = validExtensions.some(ext =>
        selectedFile.name.toLowerCase().endsWith(ext)
      );

      if (!hasValidExtension) {
        setError('Proszę wybrać plik Excel (.xls, .xlsx) lub LibreOffice (.ods)');
        return;
      }
      setFile(selectedFile);
      setError('');
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Proszę wybrać plik');
      return;
    }

    setImporting(true);
    setError('');
    setResult(null);

    try {
      const response = await api.importExcel(file, currency, format);
      setResult(response.result);

      if (response.result.success > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd podczas importu');
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (result && result.success > 0) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            {format === 'polflor' ? 'Import Polflor' : `Import produktów z pliku ${forceCurrency ? `(${forceCurrency})` : ''}`}
          </h2>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <h3 className="font-semibold text-blue-900 mb-2">Format pliku — Szablon dostaw:</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>Wiersz 1:</strong> Data dostawy (scalona komórka A1:G1)</p>
              <p><strong>Wiersz 2:</strong> Nagłówki (pomijane)</p>
              <p><strong>Wiersze 3+:</strong> Dane produktów</p>
            </div>
            <div className="mt-3 p-2 bg-blue-100 rounded text-xs">
              <strong>Kolumny:</strong>
              <ul className="mt-1 space-y-0.5">
                <li><strong>A:</strong> Zdjęcie (URL)</li>
                <li><strong>B:</strong> Nazwa rośliny (wymagane)</li>
                <li><strong>C:</strong> Doniczka</li>
                <li><strong>D:</strong> Wysokość (cm)</li>
                <li><strong>E:</strong> Ilość szt./paletę</li>
                <li><strong>F:</strong> Ilość palet</li>
                <li><strong>G:</strong> Cena {format === 'polflor' ? '(PLN)' : '(EUR lub PLN — wybierz poniżej)'}</li>
                {format === 'polflor' && <li><strong>H:</strong> Ogrodnik (floricode)</li>}
                {format === 'polflor' && <li><strong>I:</strong> Kod kreskowy</li>}
              </ul>
            </div>
            <p className="mt-2 text-xs text-blue-700">
              Obsługiwane formaty: .xlsx, .xls, .ods
            </p>
          </div>

          {/* Currency Selector */}
          {!forceCurrency && <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Waluta cen w pliku
            </label>
            <div className="flex gap-4">
              <label className={`flex items-center gap-2 px-4 py-2 rounded border cursor-pointer transition-colors ${
                currency === 'EUR' ? 'bg-primary-50 border-primary-400 text-primary-800' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="currency"
                  value="EUR"
                  checked={currency === 'EUR'}
                  onChange={() => setCurrency('EUR')}
                  className="sr-only"
                />
                <span className="text-lg">€</span>
                <span className="font-medium">EUR</span>
                <span className="text-xs">(przeliczone na PLN wg kursu)</span>
              </label>
              <label className={`flex items-center gap-2 px-4 py-2 rounded border cursor-pointer transition-colors ${
                currency === 'PLN' ? 'bg-primary-50 border-primary-400 text-primary-800' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  name="currency"
                  value="PLN"
                  checked={currency === 'PLN'}
                  onChange={() => setCurrency('PLN')}
                  className="sr-only"
                />
                <span className="text-lg">zł</span>
                <span className="font-medium">PLN</span>
              </label>
            </div>
          </div>}

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wybierz plik
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.ods,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-primary-50 file:text-primary-700
                hover:file:bg-primary-100
                cursor-pointer"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Wybrany plik: <span className="font-medium">{file.name}</span>
                <span className="text-gray-400 ml-2">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Import Results */}
          {result && (
            <div className="mb-6 space-y-4">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded">
                <h3 className="font-semibold text-gray-900 mb-2">Wyniki importu:</h3>
                {result.deliveryDate && (
                  <p className="text-sm text-gray-600 mb-3">
                    Data dostawy: <span className="font-medium">{result.deliveryDate}</span>
                  </p>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-green-100 p-3 rounded">
                    <p className="text-green-800 font-medium">Zaimportowano</p>
                    <p className="text-2xl font-bold text-primary-900">{result.success}</p>
                  </div>
                  <div className="bg-red-100 p-3 rounded">
                    <p className="text-red-800 font-medium">Błędy</p>
                    <p className="text-2xl font-bold text-red-900">{result.failed}</p>
                  </div>
                </div>
              </div>

              {/* Error Details */}
              {result.errors.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded max-h-64 overflow-y-auto">
                  <h4 className="font-semibold text-red-900 mb-2">Szczegóły błędów:</h4>
                  <ul className="space-y-2">
                    {result.errors.map((err, idx) => (
                      <li key={idx} className="text-sm">
                        <span className="font-medium text-red-800">Wiersz {err.row}:</span>{' '}
                        <span className="text-red-700">{err.error}</span>
                        {err.data && (
                          <pre className="mt-1 text-xs bg-red-100 p-2 rounded overflow-x-auto">
                            {JSON.stringify(err.data, null, 2)}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {!result && (
              <>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !file}
                  className="btn btn-primary flex-1"
                >
                  {importing ? 'Importowanie...' : 'Importuj'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary flex-1"
                >
                  Anuluj
                </button>
              </>
            )}
            {result && (
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-primary w-full"
              >
                Zamknij
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
