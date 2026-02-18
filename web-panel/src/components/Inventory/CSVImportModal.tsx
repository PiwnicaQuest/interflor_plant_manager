import { useState, useRef } from 'react';
import { api } from '../../services/api';

interface CSVImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CSVImportModal({ onClose, onSuccess }: CSVImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    failed: number;
    errors: Array<{ row: number; error: string; data?: any }>;
  } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        setError('Proszę wybrać plik CSV');
        return;
      }
      setFile(selectedFile);
      setError('');
      setResult(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await api.downloadCSVTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'import-template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError('Błąd podczas pobierania szablonu');
      console.error(err);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Proszę wybrać plik CSV');
      return;
    }

    setImporting(true);
    setError('');
    setResult(null);

    try {
      const response = await api.importCSV(file);
      setResult(response.result);

      if (response.result.success > 0) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd podczas importu CSV');
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
            Import produktów z CSV
          </h2>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <h3 className="font-semibold text-blue-900 mb-2">Instrukcje:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              <li>Pobierz szablon CSV klikając przycisk poniżej</li>
              <li>Wypełnij szablon danymi produktów</li>
              <li>Zapisz plik w formacie CSV (UTF-8)</li>
              <li>Wgraj plik używając przycisku poniżej</li>
            </ol>
          </div>

          {/* Download Template */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="btn btn-secondary w-full"
            >
              Pobierz szablon CSV
            </button>
          </div>

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wybierz plik CSV
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                cursor-pointer"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Wybrany plik: <span className="font-medium">{file.name}</span>
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
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-green-100 p-3 rounded">
                    <p className="text-green-800 font-medium">Sukces</p>
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
