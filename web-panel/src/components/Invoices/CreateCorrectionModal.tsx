import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Invoice } from '../../types';

interface CreateCorrectionModalProps {
  onClose: () => void;
  onSuccess: () => void;
  preselectedInvoiceId?: number;
}

interface CorrectionItem {
  originalItemId?: number;
  description: string;
  originalQuantity: number;
  originalUnitPriceNet: number;
  originalUnitPriceGross: number;
  originalVatRate: number;
  originalTotalNet: number;
  originalTotalVat: number;
  originalTotalGross: number;
  correctedQuantity: number;
  correctedUnitPriceGross: number;
  correctedVatRate: number;
}

// Helper to round to 2 decimal places
const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

export function CreateCorrectionModal({ onClose, onSuccess, preselectedInvoiceId }: CreateCorrectionModalProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(preselectedInvoiceId || null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [items, setItems] = useState<CorrectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch invoices for selection
  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const data = await api.getInvoices({});
        setInvoices(data.invoices || []);
      } catch (err) {
        console.error('Error fetching invoices:', err);
      }
    };
    fetchInvoices();
  }, []);

  // Load invoice details when selected
  useEffect(() => {
    if (!selectedInvoiceId) {
      setSelectedInvoice(null);
      setItems([]);
      return;
    }

    const loadInvoice = async () => {
      setLoadingInvoice(true);
      try {
        const data = await api.getInvoice(selectedInvoiceId);
        const invoice = data.invoice;
        setSelectedInvoice(invoice);

        // Convert invoice items to correction items - using GROSS prices
        const correctionItems: CorrectionItem[] = (invoice.items || []).map((item: any) => ({
          originalItemId: item.id,
          description: item.description,
          originalQuantity: item.quantity,
          originalUnitPriceNet: item.unitPriceNet,
          originalUnitPriceGross: item.unitPriceGross,
          originalVatRate: item.vatRate,
          originalTotalNet: item.totalNet,
          originalTotalVat: item.totalVat,
          originalTotalGross: item.totalGross,
          // Corrected values start as copies of original
          correctedQuantity: item.quantity,
          correctedUnitPriceGross: item.unitPriceGross,
          correctedVatRate: item.vatRate
        }));
        setItems(correctionItems);
      } catch (err) {
        console.error('Error loading invoice:', err);
        alert('Błąd podczas ładowania faktury');
      } finally {
        setLoadingInvoice(false);
      }
    };

    loadInvoice();
  }, [selectedInvoiceId]);

  const handleItemChange = (index: number, field: keyof CorrectionItem, value: number) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  // Calculate totals FROM GROSS (same as invoices and database)
  const calculateItemTotals = (item: CorrectionItem) => {
    const gross = item.correctedQuantity * item.correctedUnitPriceGross;
    const net = round2(gross / (1 + item.correctedVatRate / 100));
    const vat = round2(gross - net);
    return { net, vat, gross };
  };

  const calculateTotals = () => {
    let originalNet = 0, originalVat = 0, originalGross = 0;
    let correctedNet = 0, correctedVat = 0, correctedGross = 0;

    items.forEach(item => {
      originalNet += item.originalTotalNet;
      originalVat += item.originalTotalVat;
      originalGross += item.originalTotalGross;

      const corrected = calculateItemTotals(item);
      correctedNet += corrected.net;
      correctedVat += corrected.vat;
      correctedGross += corrected.gross;
    });

    return {
      originalNet: round2(originalNet),
      originalVat: round2(originalVat),
      originalGross: round2(originalGross),
      correctedNet: round2(correctedNet),
      correctedVat: round2(correctedVat),
      correctedGross: round2(correctedGross),
      diffNet: round2(correctedNet - originalNet),
      diffVat: round2(correctedVat - originalVat),
      diffGross: round2(correctedGross - originalGross)
    };
  };

  const handleSubmit = async () => {
    if (!selectedInvoiceId) {
      alert('Wybierz fakturę do skorygowania');
      return;
    }
    if (!correctionReason.trim()) {
      alert('Podaj przyczynę korekty');
      return;
    }

    setLoading(true);
    try {
      const result = await api.createInvoiceCorrection({
        originalInvoiceId: selectedInvoiceId,
        correctionReason: correctionReason.trim(),
        items: items.map(item => ({
          originalItemId: item.originalItemId,
          description: item.description,
          originalQuantity: item.originalQuantity,
          originalUnitPriceNet: item.originalUnitPriceNet,
          originalUnitPriceGross: item.originalUnitPriceGross,
          originalVatRate: item.originalVatRate,
          originalTotalNet: item.originalTotalNet,
          originalTotalVat: item.originalTotalVat,
          originalTotalGross: item.originalTotalGross,
          correctedQuantity: item.correctedQuantity,
          correctedUnitPriceGross: item.correctedUnitPriceGross,
          correctedVatRate: item.correctedVatRate
        }))
      });

      alert(`Korekta ${result.correctionNumber} została wystawiona`);
      onSuccess();
    } catch (err: any) {
      alert('Błąd podczas tworzenia korekty: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const totals = calculateTotals();

  const formatMoney = (amount: number) => amount.toFixed(2).replace('.', ',') + ' zł';
  const formatDiff = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return sign + amount.toFixed(2).replace('.', ',') + ' zł';
  };

  const filteredInvoices = invoices.filter(inv =>
    inv.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.buyerSnapshot?.companyName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-red-600 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Nowa faktura korygująca</h2>
          <button onClick={onClose} className="text-white hover:text-red-200 text-2xl">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Invoice Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wybierz fakturę do skorygowania
            </label>
            <input
              type="text"
              placeholder="Szukaj po numerze faktury lub nazwie klienta..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-2"
            />
            <select
              value={selectedInvoiceId || ''}
              onChange={(e) => setSelectedInvoiceId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              disabled={!!preselectedInvoiceId}
            >
              <option value="">-- Wybierz fakturę --</option>
              {filteredInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} - {inv.buyerSnapshot?.companyName || 'Brak nazwy'} ({formatMoney(inv.totalGross)})
                </option>
              ))}
            </select>
          </div>

          {loadingInvoice && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Ładowanie faktury...</p>
            </div>
          )}

          {selectedInvoice && !loadingInvoice && (
            <>
              {/* Invoice info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Numer faktury:</span>
                    <span className="ml-2 font-medium">{selectedInvoice.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Data wystawienia:</span>
                    <span className="ml-2">{new Date(selectedInvoice.issueDate).toLocaleDateString('pl-PL')}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Nabywca:</span>
                    <span className="ml-2">{selectedInvoice.buyerSnapshot?.companyName || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Correction reason */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Przyczyna korekty *
                </label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="np. Błędna ilość towaru, zmiana ceny, zwrot części towaru..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 h-20"
                  required
                />
              </div>

              {/* Items table */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">Pozycje do skorygowania</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Opis</th>
                        <th className="px-3 py-2 text-center" colSpan={2}>Ilość</th>
                        <th className="px-3 py-2 text-center" colSpan={2}>Cena brutto</th>
                        <th className="px-3 py-2 text-center">VAT</th>
                        <th className="px-3 py-2 text-right">Było brutto</th>
                        <th className="px-3 py-2 text-right">Jest brutto</th>
                        <th className="px-3 py-2 text-right">Różnica</th>
                      </tr>
                      <tr className="bg-gray-50 text-xs text-gray-500">
                        <th></th>
                        <th className="px-3 py-1">Było</th>
                        <th className="px-3 py-1">Jest</th>
                        <th className="px-3 py-1">Była</th>
                        <th className="px-3 py-1">Jest</th>
                        <th></th>
                        <th></th>
                        <th></th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => {
                        const corrected = calculateItemTotals(item);
                        const diff = round2(corrected.gross - item.originalTotalGross);
                        return (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2">{item.description}</td>
                            <td className="px-3 py-2 text-center text-gray-500">{item.originalQuantity}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                value={item.correctedQuantity}
                                onChange={(e) => handleItemChange(index, 'correctedQuantity', parseInt(e.target.value) || 0)}
                                className="w-16 border border-gray-300 rounded px-2 py-1 text-center"
                              />
                            </td>
                            <td className="px-3 py-2 text-center text-gray-500">{item.originalUnitPriceGross.toFixed(2)}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.correctedUnitPriceGross}
                                onChange={(e) => handleItemChange(index, 'correctedUnitPriceGross', parseFloat(e.target.value) || 0)}
                                className="w-20 border border-gray-300 rounded px-2 py-1 text-center"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">{item.correctedVatRate}%</td>
                            <td className="px-3 py-2 text-right text-gray-500">{item.originalTotalGross.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right font-medium">{corrected.gross.toFixed(2)}</td>
                            <td className={`px-3 py-2 text-right font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatDiff(diff)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-100 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-500 mb-1">PRZED KOREKTĄ</div>
                  <div className="text-xl font-bold">{formatMoney(totals.originalGross)}</div>
                  <div className="text-xs text-gray-500">
                    Netto: {formatMoney(totals.originalNet)} | VAT: {formatMoney(totals.originalVat)}
                  </div>
                </div>
                <div className="bg-green-100 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-500 mb-1">PO KOREKCIE</div>
                  <div className="text-xl font-bold text-green-700">{formatMoney(totals.correctedGross)}</div>
                  <div className="text-xs text-gray-500">
                    Netto: {formatMoney(totals.correctedNet)} | VAT: {formatMoney(totals.correctedVat)}
                  </div>
                </div>
                <div className="bg-red-100 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-500 mb-1">RÓŻNICA</div>
                  <div className={`text-xl font-bold ${totals.diffGross >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatDiff(totals.diffGross)}
                  </div>
                  <div className="text-xs text-gray-500">
                    Netto: {formatDiff(totals.diffNet)} | VAT: {formatDiff(totals.diffVat)}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Anuluj
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedInvoiceId || !correctionReason.trim()}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Wystawianie...' : 'Wystaw korektę'}
          </button>
        </div>
      </div>
    </div>
  );
}
