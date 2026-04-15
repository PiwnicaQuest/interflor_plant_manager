import { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
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
  const [ksefSending, setKsefSending] = useState<number | null>(null);
    const [selectedCorrections, setSelectedCorrections] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleSendToKsef = async (correction: any) => {
    if (!confirm('Wyslac korekte ' + correction.correctionNumber + ' do KSeF?')) return;
    setKsefSending(correction.id);
    try {
      const token = localStorage.getItem('token');
      const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
      const res = await fetch(API_URL + '/ksef/corrections/' + correction.id + '/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Blad wysylania');
      alert('Korekta wyslana do KSeF: ' + (data.ksefReferenceNumber || 'OK'));
      // Refresh list
      window.location.reload();
    } catch (err: any) {
      alert('Blad: ' + (err.message || 'Nieznany blad'));
    } finally {
      setKsefSending(null);
    }
  };

  const handleViewDetails = async (correction: InvoiceCorrection) => {
    try {
      const fullCorrection = await api.getInvoiceCorrection(correction.id);
      setSelectedCorrection(fullCorrection);
    } catch (err: any) {
      alert('Błąd podczas pobierania szczegółów: ' + err.message);
    }
  };

  const handlePrint = (correction: InvoiceCorrection) => {
    const token = localStorage.getItem("token");
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
    window.open(apiUrl + "/invoice-corrections/" + correction.id + "/html?token=" + token, "_blank");
  };

  const handleDownloadPdf = (correction: InvoiceCorrection) => {
    const token = localStorage.getItem("token");
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
    window.open(`${apiUrl}/invoice-corrections/${correction.id}/html?token=${token}`, "_blank");
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

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedCorrections.length === corrections.length) {
      setSelectedCorrections([]);
    } else {
      setSelectedCorrections(corrections.map(c => c.id));
    }
  };

  const handleSelectCorrection = (id: number) => {
    setSelectedCorrections(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Export selected corrections to Excel
  const handleExportToExcel = async () => {
    if (selectedCorrections.length === 0) {
      alert('Wybierz korekty do eksportu');
      return;
    }

    setIsExporting(true);

    try {
      const correctionsToExport = corrections.filter(c =>
        selectedCorrections.includes(c.id)
      );

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PlantManager';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Korekty', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });

      // Define columns
      worksheet.columns = [
        { header: 'Nazwa kontrahenta', key: 'customerName', width: 40 },
        { header: 'NIP', key: 'nip', width: 15 },
        { header: 'Data wystawienia', key: 'issueDate', width: 15 },
        { header: 'Numer korekty', key: 'correctionNumber', width: 20 },
        { header: 'Faktura źródłowa', key: 'originalInvoiceNumber', width: 20 },
        { header: 'Różnica netto', key: 'differenceNet', width: 15 },
        { header: 'Różnica VAT', key: 'differenceVat', width: 12 },
        { header: 'Różnica brutto', key: 'differenceGross', width: 15 },
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.height = 25;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDC2626' }  // Red color for corrections
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows
      correctionsToExport.forEach((correction, index) => {
        const customerName = getBuyerName(correction);
        const nip = correction.buyerSnapshot?.nip || '';

        const row = worksheet.addRow({
          customerName,
          nip,
          issueDate: formatDate(correction.issueDate),
          correctionNumber: correction.correctionNumber || '',
          originalInvoiceNumber: correction.originalInvoiceNumber || '',
          differenceNet: Number(correction.differenceNet) || 0,
          differenceVat: Number(correction.differenceVat) || 0,
          differenceGross: Number(correction.differenceGross) || 0,
        });

        row.eachCell((cell, colNumber) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNumber <= 5 ? 'left' : 'right'
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
          };

          // Format currency columns
          if (colNumber >= 6) {
            cell.numFmt = '#,##0.00 "zł"';
          }
        });

        // Alternate row colors
        if (index % 2 === 1) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' }
            };
          });
        }
      });

      // Add summary row
      const summaryRow = worksheet.addRow({
        customerName: 'RAZEM:',
        nip: '',
        issueDate: '',
        correctionNumber: `${correctionsToExport.length} korekt`,
        originalInvoiceNumber: '',
        differenceNet: correctionsToExport.reduce((sum, c) => sum + (Number(c.differenceNet) || 0), 0),
        differenceVat: correctionsToExport.reduce((sum, c) => sum + (Number(c.differenceVat) || 0), 0),
        differenceGross: correctionsToExport.reduce((sum, c) => sum + (Number(c.differenceGross) || 0), 0),
      });

      summaryRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' }  // Light red for summary
        };
        cell.border = {
          top: { style: 'medium' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        if (colNumber >= 6) {
          cell.numFmt = '#,##0.00 "zł"';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });

      // Enable autofilter
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: correctionsToExport.length + 1, column: 8 }
      };

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `korekty_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export error:', error);
      alert('Wystąpił błąd podczas eksportu: ' + (error as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  // Print selected corrections
  const handlePrintSelected = () => {
    if (selectedCorrections.length === 0) {
      alert('Wybierz korekty do wydruku');
      return;
    }

    selectedCorrections.forEach((id, index) => {
      setTimeout(() => {
        const token = localStorage.getItem("token");
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
        window.open(`${apiUrl}/invoice-corrections/${id}/html?token=${token}`, "_blank");
      }, index * 300);
    });
  };

  return (
    <div className="px-3 py-2">
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

      {/* Selection toolbar */}
      {selectedCorrections.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="text-sm text-red-800">
              Zaznaczono <strong>{selectedCorrections.length}</strong> z {corrections.length} korekt
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportToExcel}
                disabled={isExporting}
                className="btn btn-success btn-sm flex items-center gap-2"
              >
                {isExporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Eksportowanie...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Eksportuj do Excel ({selectedCorrections.length})
                  </>
                )}
              </button>
              <button
                onClick={handlePrintSelected}
                className="btn btn-primary btn-sm"
              >
                Drukuj ({selectedCorrections.length})
              </button>
              <button
                onClick={() => setSelectedCorrections([])}
                className="btn btn-secondary btn-sm"
              >
                Odznacz wszystko
              </button>
            </div>
          </div>
        </div>
      )}

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
                <th className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedCorrections.length === corrections.length && corrections.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                  />
                </th>
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
                <tr key={correction.id} className={`hover:bg-gray-50 ${selectedCorrections.includes(correction.id) ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedCorrections.includes(correction.id)}
                      onChange={() => handleSelectCorrection(correction.id)}
                      className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                    />
                  </td>
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
                    <span className={correction.differenceGross >= 0 ? 'text-primary-600' : 'text-red-600'}>
                      {formatDiff(correction.differenceGross)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <div className="flex justify-center gap-1">
                      <button
                        onClick={() => handleViewDetails(correction)}
                        className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                      >
                        Szczegóły
                      </button>
                      <button
                        onClick={() => handlePrint(correction)}
                        className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
                      >
                        Drukuj
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(correction)}
                        className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                      >
                        Podgląd
                      </button>
                      {(!correction.ksefStatus || correction.ksefStatus === 'error') && (
                        <button
                          onClick={() => handleSendToKsef(correction)}
                          disabled={ksefSending === correction.id}
                          className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200 transition-colors disabled:opacity-50"
                        >
                          {ksefSending === correction.id ? 'Wysylanie...' : 'KSeF'}
                        </button>
                      )}
                      {correction.ksefStatus === 'accepted' && (
                        <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded border border-green-200">
                          KSeF ✓
                        </span>
                      )}
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
