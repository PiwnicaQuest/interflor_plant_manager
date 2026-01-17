import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { InvoiceCorrection, InvoiceCorrectionWithItems } from '../types';
import { CreateCorrectionModal } from '../components/Invoices/CreateCorrectionModal';
import { CorrectionDetailsModal } from '../components/Invoices/CorrectionDetailsModal';

export function InvoiceCorrectionsPage() {
  const [corrections, setCorrections] = useState<InvoiceCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCorrection, setSelectedCorrection] = useState<InvoiceCorrectionWithItems | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchCorrections = async () => {
    setLoading(true);
    try {
      const data = await api.getInvoiceCorrections({
        startDate: dateFrom || undefined,
        endDate: dateTo || undefined
      });
      setCorrections(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Błąd podczas pobierania korekt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCorrections();
  }, [dateFrom, dateTo]);

  const handleViewDetails = async (correction: InvoiceCorrection) => {
    try {
      const fullCorrection = await api.getInvoiceCorrection(correction.id);
      setSelectedCorrection(fullCorrection);
    } catch (err: any) {
      alert('Błąd podczas pobierania szczegółów: ' + err.message);
    }
  };

  const handlePrint = (correction: InvoiceCorrection) => {
    window.open("/print/correction/" + correction.id, "_blank");
  };

  const handleDownloadPdf = (correction: InvoiceCorrection) => {
    window.open("/print/correction/" + correction.id, "_blank");
    return;
    // Old API code below (disabled):
    const token = localStorage.getItem('token');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    window.open(`${apiUrl}/invoice-corrections/${correction.id}/pdf?token=${token}`, '_blank');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pl-PL');
  };

  const formatMoney = (amount: number) => {
    return amount.toFixed(2).replace('.', ',') + ' zł';
  };

  const formatDiff = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return sign + amount.toFixed(2).replace('.', ',') + ' zł';
  };

  const getBuyerName = (correction: InvoiceCorrection) => {
    if (!correction.buyerSnapshot) return "-";
    const buyer = correction.buyerSnapshot;
    return buyer.companyName || `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || '-';
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Faktury korygujące</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Nowa korekta
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Od daty</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Do daty</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Wyczyść filtry
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Ładowanie korekt...</p>
        </div>
      ) : corrections.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">Brak faktur korygujących</h3>
          <p className="text-gray-600 mb-4">Nie wystawiono jeszcze żadnych korekt</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Wystaw pierwszą korektę
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nr korekty</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Faktura źródłowa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nabywca</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data wystawienia</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Przed korektą</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Po korekcie</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Różnica</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {corrections.map((correction) => (
                <tr key={correction.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-medium text-red-600">{correction.correctionNumber}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {correction.originalInvoiceNumber}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {getBuyerName(correction)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatDate(correction.issueDate)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                    {formatMoney(correction.originalTotalGross)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                    {formatMoney(correction.correctedTotalGross)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold">
                    <span className={correction.differenceGross >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {formatDiff(correction.differenceGross)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleViewDetails(correction)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                        title="Szczegóły"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => handlePrint(correction)}
                        className="text-gray-600 hover:text-gray-800 text-sm"
                        title="Drukuj"
                      >
                        🖨️
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(correction)}
                        className="text-red-600 hover:text-red-800 text-sm"
                        title="Pobierz PDF"
                      >
                        📄
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateCorrectionModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchCorrections();
          }}
        />
      )}

      {/* Details Modal */}
      {selectedCorrection && (
        <CorrectionDetailsModal
          correction={selectedCorrection}
          onClose={() => setSelectedCorrection(null)}
          onPrint={() => handlePrint(selectedCorrection)}
        />
      )}
    </div>
  );
}
