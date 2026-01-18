import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

interface GrowerPassport {
  id: number;
  growerName: string;
  passportNumber: string;
  floricode?: string;
  createdAt: string;
  updatedAt: string;
}

export function GrowerPassportsTab() {
  const [passports, setPassports] = useState<GrowerPassport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New entry form
  const [newGrowerName, setNewGrowerName] = useState('');
  const [newPassportNumber, setNewPassportNumber] = useState('');
  const [newFloricode, setNewFloricode] = useState('');

  // Edit mode
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editGrowerName, setEditGrowerName] = useState('');
  const [editPassportNumber, setEditPassportNumber] = useState('');
  const [editFloricode, setEditFloricode] = useState('');

  // Search/filter
  const [searchTerm, setSearchTerm] = useState('');

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Updating products state
  const [updatingProducts, setUpdatingProducts] = useState(false);

  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

  useEffect(() => {
    fetchPassports();
  }, []);

  const fetchPassports = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/grower-passports`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch passports');
      const data = await response.json();
      setPassports(data.passports || []);
    } catch (err: any) {
      setError('Nie udało się załadować paszportów');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPassport = async () => {
    if (!newGrowerName.trim()) {
      setError('Nazwa ogrodnika jest wymagana');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`${API_URL}/grower-passports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          growerName: newGrowerName.trim(),
          passportNumber: newPassportNumber.trim(),
          floricode: newFloricode.trim() || undefined
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add passport');
      }

      setNewGrowerName('');
      setNewPassportNumber('');
      setNewFloricode('');
      setSuccess('Paszport został dodany');
      setTimeout(() => setSuccess(null), 3000);
      fetchPassports();
    } catch (err: any) {
      setError(err.message || 'Nie udało się dodać paszportu');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (passport: GrowerPassport) => {
    setEditingId(passport.id);
    setEditGrowerName(passport.growerName);
    setEditPassportNumber(passport.passportNumber);
    setEditFloricode(passport.floricode || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditGrowerName('');
    setEditPassportNumber('');
    setEditFloricode('');
  };

  const handleSaveEdit = async () => {
    if (!editGrowerName.trim()) {
      setError('Nazwa ogrodnika jest wymagana');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`${API_URL}/grower-passports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          growerName: editGrowerName.trim(),
          passportNumber: editPassportNumber.trim(),
          floricode: editFloricode.trim() || undefined
        })
      });

      if (!response.ok) throw new Error('Failed to update passport');

      setEditingId(null);
      setSuccess('Paszport został zaktualizowany');
      setTimeout(() => setSuccess(null), 3000);
      fetchPassports();
    } catch (err: any) {
      setError('Nie udało się zaktualizować paszportu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Czy na pewno chcesz usunąć ten paszport?')) return;

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`${API_URL}/grower-passports/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to delete passport');

      setSuccess('Paszport został usunięty');
      setTimeout(() => setSuccess(null), 3000);
      fetchPassports();
    } catch (err: any) {
      setError('Nie udało się usunąć paszportu');
    } finally {
      setSaving(false);
    }
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSaving(true);
      setError(null);

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      // Map columns - expecting 'Floricode', 'Ogrodnik', 'Paszport'
      const passportsToImport: { growerName: string; passportNumber: string; floricode?: string }[] = [];

      for (const row of jsonData) {
        const floricode = row['Floricode'] || row['floricode'] || row['FLORICODE'];
        const growerName = row['Ogrodnik'] || row['Grower'] || row['grower'] || row['ogrodnik'] || row['growerName'];
        const passportNumber = row['Paszport'] || row['Passport'] || row['passport'] || row['paszport'] || row['passportNumber'] || '';

        if (growerName) {
          passportsToImport.push({
            growerName: String(growerName).trim(),
            passportNumber: String(passportNumber || '').trim(),
            floricode: floricode ? String(floricode).trim() : undefined
          });
        }
      }

      if (passportsToImport.length === 0) {
        setError('Nie znaleziono poprawnych danych w pliku. Upewnij się, że plik zawiera kolumnę "Ogrodnik".');
        return;
      }

      // Ask user if they want to replace all or just add
      const replaceAll = confirm(
        `Znaleziono ${passportsToImport.length} rekordow.\n\n` +
        `Kliknij OK, aby ZASTAPIC cala baze (usunąć wszystkie i zaimportowac nowe).\n\n` +
        `Kliknij Anuluj, aby DODAC/ZAKTUALIZOWAC istniejace rekordy.`
      );

      let response;
      if (replaceAll) {
        // Full import - delete all and insert new
        response = await fetch(`${API_URL}/grower-passports/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ passports: passportsToImport })
        });
      } else {
        // Bulk upsert - add/update
        response = await fetch(`${API_URL}/grower-passports/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ passports: passportsToImport })
        });
      }

      if (!response.ok) throw new Error('Failed to import passports');

      const result = await response.json();
      const count = result.imported || result.passports?.length || passportsToImport.length;
      setSuccess(`Zaimportowano ${count} paszportów`);
      setTimeout(() => setSuccess(null), 5000);
      fetchPassports();
    } catch (err: any) {
      console.error('Import error:', err);
      setError('Błąd podczas importu pliku');
    } finally {
      setSaving(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Floricode', 'Ogrodnik', 'Paszport'],
      ['12345', 'Przykladowy Ogrodnik 1', 'PL-12345'],
      ['67890', 'Przykladowy Ogrodnik 2', 'NL-67890'],
      ['', 'Ogrodnik bez Floricode', 'DE-11111']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Paszporty');
    XLSX.writeFile(wb, 'szablon_paszporty_ogrodników.xlsx');
  };

  const handleUpdateProducts = async () => {
    if (!confirm(
      'Ta operacja zaktualizuje nazwy ogrodników we wszystkich produktach.\n\n' +
      'Produkty, ktore maja Floricode jako ogrodnika, zostana zaktualizowane do prawidłowej nazwy ogrodnika.\n\n' +
      'Czy kontynuować?'
    )) return;

    try {
      setUpdatingProducts(true);
      setError(null);
      const response = await fetch(`${API_URL}/grower-passports/update-products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to update products');

      const result = await response.json();
      setSuccess(`Zaktualizowano ${result.updated} produktów`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError('Nie udało się zaktualizować produktów');
    } finally {
      setUpdatingProducts(false);
    }
  };

  const filteredPassports = passports.filter(p =>
    p.growerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.passportNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.floricode && p.floricode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Ogrodnicy i paszporty</h2>
          <p className="text-sm text-gray-500 mt-1">
            Zarządzaj bazą danych paszportów ogrodników. Floricode pozwala powiązać numery z plików EDI z nazwami ogrodników.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={handleDownloadTemplate}
            className="btn btn-secondary text-sm"
          >
            Pobierz szablon
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className="btn btn-secondary text-sm"
          >
            Import Excel/CSV
          </button>
          <button
            onClick={handleUpdateProducts}
            disabled={updatingProducts || passports.length === 0}
            className="btn btn-primary text-sm"
            title="Zaktualizuj produkty - zamien Floricode na nazwy ogrodników"
          >
            {updatingProducts ? 'Aktualizowanie...' : 'Aktualizuj produkty'}
          </button>
        </div>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {/* Add new passport form */}
      <div className="card p-4">
        <h3 className="text-md font-medium text-gray-900 mb-4">Dodaj nowy paszport</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Floricode
            </label>
            <input
              type="text"
              className="input"
              placeholder="np. 12345"
              value={newFloricode}
              onChange={(e) => setNewFloricode(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nazwa ogrodnika *
            </label>
            <input
              type="text"
              className="input"
              placeholder="np. Breugem Plants BV"
              value={newGrowerName}
              onChange={(e) => setNewGrowerName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Numer paszportu
            </label>
            <input
              type="text"
              className="input"
              placeholder="np. NL-12345678"
              value={newPassportNumber}
              onChange={(e) => setNewPassportNumber(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAddPassport}
              disabled={saving || !newGrowerName.trim()}
              className="btn btn-primary w-full"
            >
              {saving ? 'Dodawanie...' : 'Dodaj paszport'}
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          className="input pl-10"
          placeholder="Szukaj ogrodnika, paszportu lub Floricode..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
      </div>

      {/* Passports table */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Ładowanie paszportów...</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="bg-gray-50">Floricode</th>
                  <th className="bg-gray-50">Ogrodnik</th>
                  <th className="bg-gray-50">Paszport</th>
                  <th className="bg-gray-50 text-center">Data dodania</th>
                  <th className="bg-gray-50 text-center">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {filteredPassports.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-500">
                      {searchTerm ? 'Nie znaleziono paszportów' : 'Brak paszportów w bazie'}
                    </td>
                  </tr>
                ) : (
                  filteredPassports.map((passport) => (
                    <tr key={passport.id}>
                      <td className="font-mono text-sm text-gray-600">
                        {editingId === passport.id ? (
                          <input
                            type="text"
                            className="input py-1 w-24"
                            value={editFloricode}
                            onChange={(e) => setEditFloricode(e.target.value)}
                          />
                        ) : (
                          passport.floricode || '-'
                        )}
                      </td>
                      <td className="font-medium">
                        {editingId === passport.id ? (
                          <input
                            type="text"
                            className="input py-1"
                            value={editGrowerName}
                            onChange={(e) => setEditGrowerName(e.target.value)}
                          />
                        ) : (
                          passport.growerName
                        )}
                      </td>
                      <td className="text-teal-700 font-mono">
                        {editingId === passport.id ? (
                          <input
                            type="text"
                            className="input py-1"
                            value={editPassportNumber}
                            onChange={(e) => setEditPassportNumber(e.target.value)}
                          />
                        ) : (
                          passport.passportNumber || '-'
                        )}
                      </td>
                      <td className="text-center text-sm text-gray-500">
                        {new Date(passport.createdAt).toLocaleDateString('pl-PL')}
                      </td>
                      <td className="text-center">
                        {editingId === passport.id ? (
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className="text-green-600 hover:text-green-800 text-sm font-medium"
                            >
                              Zapisz
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="text-gray-600 hover:text-gray-800 text-sm font-medium"
                            >
                              Anuluj
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleStartEdit(passport)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Edytuj
                            </button>
                            <button
                              onClick={() => handleDelete(passport.id)}
                              disabled={saving}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Usuń
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredPassports.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t text-sm text-gray-500">
              Łącznie: {filteredPassports.length} {filteredPassports.length === 1 ? 'paszport' : (filteredPassports.length < 5 ? 'paszporty' : 'paszportów')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
