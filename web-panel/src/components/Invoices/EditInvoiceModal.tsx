import { useState, useEffect, useCallback } from 'react';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface EditItem {
  id?: number;
  productId?: number;
  description: string;
  quantity: number;
  unitPriceNet: number;
  unitPriceGross: number;
  vatRate: number;
  growerPassport?: string;
  discountPercent?: number;
  originalUnitPriceNet?: number;
  originalUnitPriceGross?: number;
  // UI state
  originalQuantity?: number; // quantity before edit (for delta display)
  availableStock?: number;
  plantName?: string;
}

interface EditInvoiceModalProps {
  invoiceId: number;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditInvoiceModal({ invoiceId, isOpen, onClose, onSaved }: EditInvoiceModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState<any>(null);
  const [items, setItems] = useState<EditItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [addProductSearch, setAddProductSearch] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);

  const token = localStorage.getItem('token');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [editRes, productsRes] = await Promise.all([
        fetch(`${API_URL}/invoices/${invoiceId}/edit`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/inventory?limit=9999`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!editRes.ok) throw new Error('Nie udalo sie pobrac danych faktury');
      const editData = await editRes.json();
      setInvoice(editData.invoice);
      setCanEdit(editData.canEdit);

      const editItems: EditItem[] = (editData.items || []).map((i: any) => ({
        id: i.id,
        productId: i.productId,
        description: i.description,
        quantity: Number(i.quantity),
        unitPriceNet: Number(i.unitPriceNet),
        unitPriceGross: Number(i.unitPriceGross),
        vatRate: Number(i.vatRate),
        growerPassport: i.growerPassport,
        discountPercent: Number(i.discountPercent) || 0,
        originalUnitPriceNet: i.originalUnitPriceNet ? Number(i.originalUnitPriceNet) : undefined,
        originalUnitPriceGross: i.originalUnitPriceGross ? Number(i.originalUnitPriceGross) : undefined,
        originalQuantity: Number(i.quantity),
        availableStock: Number(i.availableStock) || 0,
        plantName: i.plantName,
      }));
      setItems(editItems);

      if (productsRes.ok) {
        const prodData = await productsRes.json();
        setProducts(prodData.products || prodData || []);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, token]);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const updateItem = (idx: number, patch: Partial<EditItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addProduct = (product: any) => {
    const vatRate = Number(product.vatRate) || 8;
    const price = Number(product.basePriceGross) || 0;
    const priceNet = round2(price / (1 + vatRate / 100));
    setItems(prev => [...prev, {
      productId: product.id,
      description: product.plantName + (product.potSize ? ' ' + product.potSize : ''),
      quantity: 1,
      unitPriceNet: priceNet,
      unitPriceGross: price,
      vatRate,
      growerPassport: product.growerPassport || '',
      originalQuantity: 0,
      availableStock: Number(product.totalUnits) || 0,
      plantName: product.plantName,
    }]);
    setShowAddProduct(false);
    setAddProductSearch('');
  };

  // Calculations
  const totalNet = items.reduce((s, i) => s + round2(i.unitPriceNet * i.quantity), 0);
  const totalVat = items.reduce((s, i) => s + round2(round2(i.unitPriceNet * i.quantity) * (i.vatRate / 100)), 0);
  const totalGross = round2(totalNet + totalVat);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/invoices/${invoiceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Blad zapisywania');
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p => {
    if (!addProductSearch) return false;
    const q = addProductSearch.toLowerCase();
    return (p.plantName || '').toLowerCase().includes(q) ||
           (p.barcode || '').includes(q) ||
           (p.potSize || '').toLowerCase().includes(q);
  }).slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: 'calc(100vw - 32px)', maxWidth: '1400px', height: 'calc(100vh - 32px)' }}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edycja faktury: {invoice?.invoiceNumber}</h2>
            {invoice && (
              <p className="text-xs text-gray-600 mt-0.5">
                KSeF: <strong>{invoice.ksefStatus || 'nie wyslana'}</strong>
                {!canEdit && <span className="text-red-600 ml-2 font-bold">EDYCJA ZABLOKOWANA (faktura wyslana do KSeF)</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !canEdit ? (
            <div className="text-center py-16 text-red-600">
              <p className="text-lg font-bold">Edycja zablokowana</p>
              <p className="text-sm mt-1">Faktura zostala juz wyslana do KSeF i nie moze byc edytowana.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

              {/* Items table */}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left">Nazwa</th>
                    <th className="px-2 py-2 text-center w-20">Ilosc</th>
                    <th className="px-2 py-2 text-center w-20">Zmiana</th>
                    <th className="px-2 py-2 text-right w-24">Cena netto</th>
                    <th className="px-2 py-2 text-right w-24">Cena brutto</th>
                    <th className="px-2 py-2 text-center w-16">VAT</th>
                    <th className="px-2 py-2 text-right w-24">Wartosc brutto</th>
                    <th className="px-2 py-2 text-left w-28">Paszport</th>
                    <th className="px-2 py-2 text-center w-16">Usun</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const delta = (item.originalQuantity || 0) - item.quantity;
                    const lineGross = round2(item.unitPriceGross * item.quantity);
                    return (
                      <tr key={idx} className="border-t">
                        <td className="px-2 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <div className="font-medium">{item.description}</div>
                          {item.availableStock !== undefined && (
                            <div className="text-xs text-gray-400">Stan: {(item.availableStock || 0) + (item.originalQuantity || 0)} szt</div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min="1" value={item.quantity}
                            onChange={e => updateItem(idx, { quantity: Number(e.target.value) || 0 })}
                            className="w-full px-2 py-1 border rounded text-center text-sm" />
                        </td>
                        <td className="px-2 py-2 text-center">
                          {delta !== 0 && (
                            <span className={`text-xs font-bold ${delta > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                              {delta > 0 ? '+' : ''}{delta} szt
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.01" value={item.unitPriceNet}
                            onChange={e => {
                              const net = Number(e.target.value) || 0;
                              updateItem(idx, { unitPriceNet: net, unitPriceGross: round2(net * (1 + item.vatRate / 100)) });
                            }}
                            className="w-full px-2 py-1 border rounded text-right text-sm" />
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-sm">{item.unitPriceGross.toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <select value={item.vatRate} onChange={e => {
                            const vat = Number(e.target.value);
                            updateItem(idx, { vatRate: vat, unitPriceGross: round2(item.unitPriceNet * (1 + vat / 100)) });
                          }} className="w-full px-1 py-1 border rounded text-sm text-center">
                            <option value={0}>0%</option>
                            <option value={5}>5%</option>
                            <option value={8}>8%</option>
                            <option value={23}>23%</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-bold">{lineGross.toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <input type="text" value={item.growerPassport || ''}
                            onChange={e => updateItem(idx, { growerPassport: e.target.value })}
                            className="w-full px-1 py-1 border rounded text-xs" placeholder="-" />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700 text-lg" title="Usun pozycje">&times;</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={4} className="px-2 py-2 text-right">RAZEM:</td>
                    <td className="px-2 py-2 text-right font-mono">{totalNet.toFixed(2)}</td>
                    <td></td>
                    <td className="px-2 py-2 text-right font-mono text-xs">VAT: {totalVat.toFixed(2)}</td>
                    <td className="px-2 py-2 text-right font-mono text-blue-600 text-base">{totalGross.toFixed(2)} zl</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>

              {/* Add product */}
              <div className="border-t pt-4">
                {!showAddProduct ? (
                  <button onClick={() => setShowAddProduct(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                    + Dodaj pozycje
                  </button>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex gap-2 mb-2">
                      <input type="text" value={addProductSearch}
                        onChange={e => setAddProductSearch(e.target.value)}
                        placeholder="Szukaj produktu po nazwie lub kodzie..."
                        className="flex-1 px-3 py-2 border rounded-lg text-sm"
                        autoFocus />
                      <button onClick={() => { setShowAddProduct(false); setAddProductSearch(''); }}
                        className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm">Anuluj</button>
                    </div>
                    {filteredProducts.length > 0 && (
                      <div className="max-h-48 overflow-y-auto border rounded bg-white">
                        {filteredProducts.map(p => (
                          <button key={p.id} onClick={() => addProduct(p)}
                            className="w-full text-left px-3 py-2 hover:bg-green-50 border-b last:border-b-0 text-sm flex justify-between">
                            <span><strong>{p.plantName}</strong> {p.potSize}</span>
                            <span className="text-gray-500">Stan: {p.totalUnits} | {Number(p.basePriceGross || 0).toFixed(2)} zl</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex justify-between items-center">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-900">Anuluj</button>
          {canEdit && (
            <button onClick={handleSave} disabled={saving || items.length === 0}
              className="px-6 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50">
              {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
