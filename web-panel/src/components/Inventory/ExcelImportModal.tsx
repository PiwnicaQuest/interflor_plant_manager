import { useState, useRef } from 'react';
import { api } from '../../services/api';

interface ExcelImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ExcelImportModal({ onClose, onSuccess }: ExcelImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
    skipped?: number;
    errors: Array<{ row: number; error: string; data?: any }>;
  } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validExtensions = ['.xls', '.xlsx'];
      const hasValidExtension = validExtensions.some(ext =>
        selectedFile.name.toLowerCase().endsWith(ext)
      );

      if (!hasValidExtension) {
        setError('Proszę wybrać plik Excel (.xls lub .xlsx)');
        return;
      }
      setFile(selectedFile);
      setError('');
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Proszę wybrać plik Excel');
      return;
    }

    setImporting(true);
    setError('');
    setResult(null);

    try {
      const response = await api.importExcel(file);
      setResult(response.result);

      if (response.result.success > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd podczas importu Excel');
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
            Import produktów z Excel
          </h2>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <h3 className="font-semibold text-blue-900 mb-2">Instrukcje:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              <li>Przygotuj plik Excel (.xls lub .xlsx) z danymi produktów</li>
              <li>Plik powinien być w formacie dostawcy (np. 1PS)</li>
              <li>Importowane będą tylko pozycje z kodem kreskowym (rośliny)</li>
              <li>Ceny EUR zostaną przeliczone na PLN wg kursu z ustawień</li>
            </ol>
            <div className="mt-3 p-2 bg-blue-100 rounded text-xs">
              <strong>Mapowanie kolumn z pliku dostawcy:</strong>
              <ul className="mt-1 space-y-0.5">
                <li><strong>Item</strong> → Nazwa rośliny</li>
                <li><strong>Identifier code</strong> → Rozmiar doniczki i wysokość (np. "14.70" = 14, 70cm)</li>
                <li><strong>Price</strong> → Cena zakupu w EUR (przeliczana na PLN)</li>
                <li><strong>AVE</strong> → Liczba palet</li>
                <li><strong>APE</strong> → Sztuk na paletę</li>
                <li><strong>Barcode.1</strong> → Kod kreskowy (kolumna V)</li>
                <li><strong>Grower</strong> → Ogrodnik</li>
                <li><strong>Photo</strong> → URL zdjęcia (opcjonalne)</li>
              </ul>
              <p className="mt-2 text-amber-700">
                <strong>Uwaga:</strong> Pozycje bez kodu kreskowego (opakowania, tacki) są automatycznie pomijane.
              </p>
            </div>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wybierz plik Excel
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-green-50 file:text-green-700
                hover:file:bg-green-100
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
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-green-100 p-3 rounded">
                    <p className="text-green-800 font-medium">Zaimportowano</p>
                    <p className="text-2xl font-bold text-green-900">{result.success}</p>
                  </div>
                  <div className="bg-amber-100 p-3 rounded">
                    <p className="text-amber-800 font-medium">Pominięto</p>
                    <p className="text-2xl font-bold text-amber-900">{result.skipped || 0}</p>
                    <p className="text-xs text-amber-600 mt-1">bez barcodu</p>
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
