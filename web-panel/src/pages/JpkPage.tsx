import { useState } from 'react';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface VatRow { rate: number; net: number; vat: number; gross: number; }
interface Preview {
  invoiceCount: number;
  correctionCount: number;
  totalGross: number;
  vatSummary: VatRow[];
}

const MONTHS = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

export default function JpkPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // prev month by default
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token');

  const handlePreview = async () => {
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const res = await fetch(`${API_URL}/jpk/preview?year=${year}&month=${month + 1}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Blad'); }
      setPreview(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/jpk/generate?year=${year}&month=${month + 1}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Blad generowania'); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JPK_V7M_${year}_${String(month + 1).padStart(2, '0')}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">JPK_V7M(3)</h1>
      <p className="text-sm text-gray-500 mb-6">Jednolity Plik Kontrolny — deklaracja VAT miesięczna</p>

      {/* Month selector */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Wybierz okres rozliczeniowy</h2>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Rok</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm">
              {[2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Miesiąc</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <button onClick={handlePreview} disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Ladowanie...' : 'Podglad'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Preview */}
      {preview && (
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            Podglad: {MONTHS[month]} {year}
          </h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-700">{preview.invoiceCount}</div>
              <div className="text-xs text-gray-600">Faktur</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-700">{preview.correctionCount}</div>
              <div className="text-xs text-gray-600">Korekt</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{preview.totalGross.toFixed(2)}</div>
              <div className="text-xs text-gray-600">Brutto PLN</div>
            </div>
          </div>

          {preview.vatSummary.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Podsumowanie VAT</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Stawka</th>
                    <th className="px-4 py-2 text-right">Netto</th>
                    <th className="px-4 py-2 text-right">VAT</th>
                    <th className="px-4 py-2 text-right">Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.vatSummary.map(v => (
                    <tr key={v.rate} className="border-t">
                      <td className="px-4 py-2 font-medium">{v.rate}%</td>
                      <td className="px-4 py-2 text-right font-mono">{v.net.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-mono">{v.vat.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-mono">{v.gross.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-bold">
                  <tr>
                    <td className="px-4 py-2">RAZEM</td>
                    <td className="px-4 py-2 text-right font-mono">{preview.vatSummary.reduce((s,v) => s + v.net, 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-mono">{preview.vatSummary.reduce((s,v) => s + v.vat, 0).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-mono">{preview.vatSummary.reduce((s,v) => s + v.gross, 0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <button onClick={handleGenerate} disabled={generating || preview.invoiceCount === 0}
            className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {generating ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {generating ? 'Generowanie...' : `Pobierz JPK_V7M(3) — ${MONTHS[month]} ${year}`}
          </button>
        </div>
      )}
    </div>
  );
}
