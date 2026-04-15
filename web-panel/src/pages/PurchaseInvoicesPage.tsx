import { useState, useEffect, useCallback } from 'react';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface PurchaseInvoice {
  id: number;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  conversionRate: number;
  costPercentage: number;
  marginPercentage: number;
  totalNetOriginal: number;
  totalGrossOriginal: number;
  totalNetPln: number;
  detectedCountry: string;
  itemsCount: number;
  totalQuantity: number;
  importedByName: string;
  createdAt: string;
}

interface PurchaseInvoiceItem {
  id: number;
  position: number;
  rawName: string;
  potSize: string;
  plantHeight: string;
  quantity: number;
  unitPriceNetOriginal: number;
  unitPriceNetPln: number;
  totalNetOriginal: number;
  totalNetPln: number;
  vatRate: number;
  barcode: string;
  growerPassport: string;
  supplierCode: string;
  matchedProductId: number;
  currentProductName: string;
  createdNewProduct: boolean;
  skipped: boolean;
}

interface PurchaseInvoiceDetail extends PurchaseInvoice {
  items: PurchaseInvoiceItem[];
}

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const token = localStorage.getItem('token');

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/purchase-invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Blad pobierania');
      const data = await res.json();
      setInvoices(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_URL}/purchase-invoices/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Blad pobierania szczegulow');
      const data = await res.json();
      setSelectedInvoice(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Na pewno usunac ta fakture zakupowa?')) return;
    try {
      await fetch(`${API_URL}/purchase-invoices/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setInvoices(prev => prev.filter(i => i.id !== id));
      if (selectedInvoice?.id === id) setSelectedInvoice(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('pl-PL');
  };

  const formatMoney = (v: number, currency = 'PLN') => {
    if (v == null) return '-';
    return Number(v).toFixed(2) + (currency === 'EUR' ? ' EUR' : ' zl');
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faktury zakupowe</h1>
          <p className="text-sm text-gray-500 mt-1">Zaimportowane faktury od dostawcow (Import AI)</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}
          <button onClick={() => setError('')} className="ml-2 font-bold">x</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium">Brak zaimportowanych faktur</p>
          <p className="text-sm mt-1">Zaimportuj fakture PDF w Magazyn &rarr; Import AI</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Data faktury</th>
                <th className="px-4 py-3 text-left font-medium">Numer</th>
                <th className="px-4 py-3 text-left font-medium">Dostawca</th>
                <th className="px-4 py-3 text-center font-medium">Kraj</th>
                <th className="px-4 py-3 text-center font-medium">Waluta</th>
                <th className="px-4 py-3 text-right font-medium">Netto (oryg.)</th>
                <th className="px-4 py-3 text-right font-medium">Netto PLN</th>
                <th className="px-4 py-3 text-center font-medium">Pozycje</th>
                <th className="px-4 py-3 text-center font-medium">Szt.</th>
                <th className="px-4 py-3 text-left font-medium">Import</th>
                <th className="px-4 py-3 text-center font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(inv.id)}>
                  <td className="px-4 py-3">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-4 py-3 font-medium">{inv.invoiceNumber || '-'}</td>
                  <td className="px-4 py-3">{inv.supplier || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {inv.detectedCountry && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{inv.detectedCountry}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">{inv.currency}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatMoney(inv.totalNetOriginal, inv.currency)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatMoney(inv.totalNetPln, 'PLN')}</td>
                  <td className="px-4 py-3 text-center">{inv.itemsCount}</td>
                  <td className="px-4 py-3 text-center">{inv.totalQuantity}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {formatDate(inv.createdAt)}<br />{inv.importedByName}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleDelete(inv.id)} className="text-red-500 hover:text-red-700 text-xs" title="Usun">
                      Usun
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedInvoice(null)}>
          <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: 'calc(100vw - 48px)', maxWidth: '1500px', height: 'calc(100vh - 48px)' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Faktura zakupowa: {selectedInvoice.invoiceNumber || '?'}
                </h2>
                <div className="flex gap-4 text-sm text-gray-600 mt-1 flex-wrap">
                  <span>Dostawca: <strong>{selectedInvoice.supplier}</strong></span>
                  <span>Data: <strong>{formatDate(selectedInvoice.invoiceDate)}</strong></span>
                  <span>Waluta: <strong>{selectedInvoice.currency}</strong></span>
                  {selectedInvoice.conversionRate && selectedInvoice.conversionRate !== 1 && (
                    <span>Kurs: <strong>{Number(selectedInvoice.conversionRate).toFixed(4)}</strong></span>
                  )}
                  {selectedInvoice.detectedCountry && (
                    <span>Kraj: <strong>{selectedInvoice.detectedCountry}</strong></span>
                  )}
                  <span>Koszt: <strong>{Number(selectedInvoice.costPercentage).toFixed(1)}%</strong></span>
                  <span>Marza: <strong>{Number(selectedInvoice.marginPercentage).toFixed(1)}%</strong></span>
                </div>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Summary */}
            <div className="px-6 py-3 bg-gray-50 border-b flex gap-6 text-sm">
              <div>Netto oryg.: <strong className="font-mono">{formatMoney(selectedInvoice.totalNetOriginal, selectedInvoice.currency)}</strong></div>
              <div>Brutto oryg.: <strong className="font-mono">{formatMoney(selectedInvoice.totalGrossOriginal, selectedInvoice.currency)}</strong></div>
              <div>Netto PLN: <strong className="font-mono">{formatMoney(selectedInvoice.totalNetPln, 'PLN')}</strong></div>
              <div>Pozycji: <strong>{selectedInvoice.itemsCount}</strong></div>
              <div>Laczna ilosc: <strong>{selectedInvoice.totalQuantity}</strong> szt.</div>
            </div>

            {/* Items table */}
            <div className="flex-1 overflow-auto p-4">
              {detailLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Nazwa z faktury</th>
                      <th className="px-2 py-2 text-left">Doniczka</th>
                      <th className="px-2 py-2 text-left">Wysokosc</th>
                      <th className="px-2 py-2 text-center">Ilosc</th>
                      <th className="px-2 py-2 text-right">Cena {selectedInvoice.currency}</th>
                      <th className="px-2 py-2 text-right">Cena PLN</th>
                      <th className="px-2 py-2 text-right">Wartosc {selectedInvoice.currency}</th>
                      <th className="px-2 py-2 text-right">Wartosc PLN</th>
                      <th className="px-2 py-2 text-center">VAT</th>
                      <th className="px-2 py-2 text-left">EAN</th>
                      <th className="px-2 py-2 text-left">Paszport</th>
                      <th className="px-2 py-2 text-left">Produkt w bazie</th>
                      <th className="px-2 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items?.map((item, idx) => (
                      <tr key={item.id} className={`border-t ${item.skipped ? 'opacity-40 bg-gray-50' : ''}`}>
                        <td className="px-2 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-2 py-2 font-medium max-w-[250px]">
                          <div className="truncate" title={item.rawName}>{item.rawName}</div>
                        </td>
                        <td className="px-2 py-2">{item.potSize || '-'}</td>
                        <td className="px-2 py-2">{item.plantHeight || '-'}</td>
                        <td className="px-2 py-2 text-center font-medium">{item.quantity}</td>
                        <td className="px-2 py-2 text-right font-mono">{Number(item.unitPriceNetOriginal).toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-mono">{Number(item.unitPriceNetPln).toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-mono">{Number(item.totalNetOriginal).toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-mono">{Number(item.totalNetPln).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center">{Number(item.vatRate)}%</td>
                        <td className="px-2 py-2 font-mono text-xs">{item.barcode || '-'}</td>
                        <td className="px-2 py-2">{item.growerPassport || '-'}</td>
                        <td className="px-2 py-2 text-xs">{item.currentProductName || '-'}</td>
                        <td className="px-2 py-2 text-center">
                          {item.skipped ? (
                            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">Pominieto</span>
                          ) : item.createdNewProduct ? (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">Nowy</span>
                          ) : item.matchedProductId ? (
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">Dodano</span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">?</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {selectedInvoice.items && selectedInvoice.items.length > 0 && (
                    <tfoot className="bg-gray-100 font-medium">
                      <tr>
                        <td className="px-2 py-2" colSpan={4}>RAZEM</td>
                        <td className="px-2 py-2 text-center">{selectedInvoice.items.reduce((s, i) => s + (i.skipped ? 0 : Number(i.quantity)), 0)}</td>
                        <td className="px-2 py-2" colSpan={2}></td>
                        <td className="px-2 py-2 text-right font-mono">{selectedInvoice.items.reduce((s, i) => s + (i.skipped ? 0 : Number(i.totalNetOriginal)), 0).toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-mono">{selectedInvoice.items.reduce((s, i) => s + (i.skipped ? 0 : Number(i.totalNetPln)), 0).toFixed(2)}</td>
                        <td className="px-2 py-2" colSpan={5}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t bg-gray-50 rounded-b-xl flex justify-end">
              <button onClick={() => setSelectedInvoice(null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
