import { useState, useRef } from 'react';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

interface ParsedItem {
  index: number;
  rawName: string;
  potSize?: string;
  plantHeight?: string;
  quantity: number;
  unitPriceNet: number;
  totalNet: number;
  vatRate: number;
  growerPassport?: string;
  barcode?: string;
  matchedProductId?: number;
  matchedProductName?: string;
  matchStatus?: 'matched' | 'candidates' | 'not_found' | 'barcode_match';
  barcodeMatchInfo?: { id: number; plantName: string; potSize: string; totalUnits: number; isArchived: boolean };
  candidates?: Array<{ id: number; plantName: string; potSize: string; totalUnits: number; isArchived?: boolean; similarity: number }>;
  // Local state
  skip?: boolean;
  createNew?: boolean;
}

interface ParsedInvoice {
  supplier?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  currency?: string;
  conversionRate?: number;
  totalNet?: number;
  totalGross?: number;
  items: ParsedItem[];
  detectedCountry?: string;
  extractedPassports?: string[];
  pricingSettings?: { costPercentage: number; marginPercentage: number; eurToPlnRate: number };
  debug?: { model: string; tokensUsed: number };
}

interface AiImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AiImportModal({ isOpen, onClose, onSuccess }: AiImportModalProps) {
  const [step, setStep] = useState<'upload' | 'parsing' | 'verify' | 'confirming' | 'done'>('upload');
  const [error, setError] = useState('');
  const [parsedInvoice, setParsedInvoice] = useState<ParsedInvoice | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [result, setResult] = useState<{ createdProducts: number; updatedStock: number } | null>(null);
  const [costPct, setCostPct] = useState(0);
  const [marginPct, setMarginPct] = useState(100);
  const [eurRate, setEurRate] = useState(4.30);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    setError('');
    setStep('parsing');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/inventory/import-pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Błąd parsowania PDF');
      }
      setParsedInvoice(data);
      // Set pricing defaults from server settings
      if (data.pricingSettings) {
        setCostPct(data.pricingSettings.costPercentage ?? 0);
        setMarginPct(data.pricingSettings.marginPercentage ?? 100);
        setEurRate(data.pricingSettings.eurToPlnRate ?? 4.30);
      }
      setItems(data.items.map((i: ParsedItem) => ({
        ...i,
        vatRate: i.vatRate || 8,
        createNew: i.matchStatus !== 'barcode_match',
        matchedProductId: i.matchStatus === 'barcode_match' ? i.matchedProductId : undefined,
      })));
      setStep('verify');
    } catch (e: any) {
      setError(e.message);
      setStep('upload');
    }
  };

  const handleConfirm = async () => {
    setStep('confirming');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/inventory/import-pdf/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: items.filter((i) => !i.skip),
          costPercentage: costPct,
          marginPercentage: marginPct,
          eurToPlnRate: eurRate,
          invoiceMeta: parsedInvoice ? {
            supplier: parsedInvoice.supplier,
            invoiceNumber: parsedInvoice.invoiceNumber,
            invoiceDate: parsedInvoice.invoiceDate,
            currency: parsedInvoice.currency || 'EUR',
            conversionRate: parsedInvoice.conversionRate || 1,
            totalNetOriginal: parsedInvoice.totalNet && parsedInvoice.conversionRate ? parsedInvoice.totalNet / parsedInvoice.conversionRate : parsedInvoice.totalNet,
            totalGrossOriginal: parsedInvoice.totalGross && parsedInvoice.conversionRate ? parsedInvoice.totalGross / parsedInvoice.conversionRate : parsedInvoice.totalGross,
            totalNetPln: parsedInvoice.totalNet,
            detectedCountry: parsedInvoice.detectedCountry,
          } : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Błąd zatwierdzania');
      setResult({ createdProducts: data.createdProducts, updatedStock: data.updatedStock });
      setStep('done');
      onSuccess();
    } catch (e: any) {
      setError(e.message);
      setStep('verify');
    }
  };

  const updateItem = (idx: number, patch: Partial<ParsedItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleClose = () => {
    setStep('upload');
    setItems([]);
    setParsedInvoice(null);
    setError('');
    setResult(null);
    setCostPct(0);
    setMarginPct(100);
    setEurRate(4.30);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: 'calc(100vw - 32px)', maxWidth: '1400px', height: 'calc(100vh - 32px)' }}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Import faktury PDF (AI)</h2>
            {parsedInvoice && step !== 'upload' && (
              <p className="text-xs text-gray-600 mt-0.5">
                {parsedInvoice.supplier && <span>Dostawca: <strong>{parsedInvoice.supplier}</strong></span>}
                {parsedInvoice.invoiceNumber && <span> | Faktura: <strong>{parsedInvoice.invoiceNumber}</strong></span>}
                {parsedInvoice.invoiceDate && <span> | Data: <strong>{parsedInvoice.invoiceDate}</strong></span>}
                {parsedInvoice.totalGross && <span> | Brutto: <strong>{parsedInvoice.totalGross.toFixed(2)} zł</strong></span>}
              </p>
            )}
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center h-full">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-purple-500'); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('border-purple-500'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-purple-500');
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileSelect(file);
                }}
                className="border-4 border-dashed border-gray-300 rounded-2xl p-16 text-center cursor-pointer hover:border-purple-500 transition-colors"
              >
                <svg className="w-20 h-20 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-lg font-medium text-gray-700">Przeciągnij PDF tutaj</p>
                <p className="text-sm text-gray-500 mt-1">lub kliknij aby wybrać plik</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>
              {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}
            </div>
          )}

          {step === 'parsing' && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-lg font-medium text-gray-700">Analiza faktury przez AI...</p>
              <p className="text-sm text-gray-500 mt-1">To może zająć kilka sekund</p>
            </div>
          )}

          {step === 'verify' && parsedInvoice && (
            <div className="space-y-4">
              {/* Pricing controls */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-4 text-sm flex-wrap">
                <span className="font-medium text-amber-800">Kalkulacja cen:</span>
                <label className="flex items-center gap-1">
                  <span className="text-gray-600 text-xs">% kosztow:</span>
                  <input type="number" step="0.1" value={costPct} onChange={e => setCostPct(Number(e.target.value))}
                    className="w-16 px-1.5 py-1 border border-amber-300 rounded text-xs text-center bg-white" />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-gray-600 text-xs">% marzy:</span>
                  <input type="number" step="0.1" value={marginPct} onChange={e => setMarginPct(Number(e.target.value))}
                    className="w-16 px-1.5 py-1 border border-amber-300 rounded text-xs text-center bg-white" />
                </label>
                {parsedInvoice?.currency === 'EUR' && (
                  <label className="flex items-center gap-1">
                    <span className="text-gray-600 text-xs">Kurs EUR:</span>
                    <input type="number" step="0.01" value={eurRate} onChange={e => setEurRate(Number(e.target.value))}
                      className="w-20 px-1.5 py-1 border border-amber-300 rounded text-xs text-center bg-white" />
                  </label>
                )}
                {parsedInvoice?.detectedCountry && (
                  <span className="text-xs text-gray-500 ml-2">Kraj: <strong>{parsedInvoice.detectedCountry}</strong></span>
                )}
                {parsedInvoice?.extractedPassports && parsedInvoice.extractedPassports.length > 0 && (
                  <span className="text-xs text-green-700 ml-2">Paszporty z PDF: {parsedInvoice.extractedPassports.length}</span>
                )}
              </div>

              {/* Summary bar */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Wykryto:</span>{' '}
                  <strong>{items.length}</strong> pozycji
                </div>
                <div>
                  <span className="text-gray-500">EAN:</span>{' '}
                  <strong className="text-blue-700">{items.filter((i) => i.matchStatus === 'barcode_match').length}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Dopasowane:</span>{' '}
                  <strong className="text-green-700">{items.filter((i) => i.matchStatus === 'matched').length}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Do wyboru:</span>{' '}
                  <strong className="text-yellow-700">{items.filter((i) => i.matchStatus === 'candidates').length}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Nowe:</span>{' '}
                  <strong className="text-purple-700">{items.filter((i) => i.matchStatus === 'not_found').length}</strong>
                </div>
              </div>

              {/* Items table */}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left">Status</th>
                    <th className="px-2 py-2 text-left">Nazwa z faktury</th>
                    <th className="px-2 py-2 text-left">Doniczka / Wysokość</th>
                    <th className="px-2 py-2 text-left">Dopasowanie / Akcja</th>
                    <th className="px-2 py-2 text-center">Ilość</th>
                    <th className="px-2 py-2 text-right">Cena netto</th>
                    <th className="px-2 py-2 text-center">VAT</th>
                    <th className="px-2 py-2 text-left">Paszport</th>
                    <th className="px-2 py-2 text-left">Kod kreskowy</th>
                    <th className="px-2 py-2 text-center">Pomiń</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className={`border-t ${item.skip ? 'opacity-40' : ''}`}>
                      <td className="px-2 py-2">
                        {item.matchStatus === 'barcode_match' && <span title="Znaleziono produkt po kodzie kreskowym" className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">EAN ✓</span>}
                        {item.matchStatus === 'matched' && <span title="Dopasowano do produktu w bazie" className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">✓ Znaleziono</span>}
                        {item.matchStatus === 'candidates' && <span title="Znaleziono kilku kandydatow - wybierz wlasciwego" className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">? Wybierz</span>}
                        {item.matchStatus === 'not_found' && <span title="Brak w bazie - zostanie utworzony nowy produkt" className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">+ Nowy</span>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{item.rawName}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            value={item.potSize || ''}
                            onChange={(e) => updateItem(idx, { potSize: e.target.value })}
                            placeholder="np. p12"
                            className="w-20 px-1.5 py-1 border border-gray-300 rounded text-xs"
                          />
                          <input
                            type="text"
                            value={item.plantHeight || ''}
                            onChange={(e) => updateItem(idx, { plantHeight: e.target.value })}
                            placeholder="np. 30-40cm"
                            className="w-20 px-1.5 py-1 border border-gray-300 rounded text-xs"
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-1">
                          <select
                            value={item.createNew ? '__NEW__' : (item.matchedProductId || '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__NEW__') {
                                updateItem(idx, { createNew: true, matchedProductId: undefined });
                              } else if (val === '') {
                                updateItem(idx, { createNew: false, matchedProductId: undefined });
                              } else {
                                updateItem(idx, { matchedProductId: Number(val), createNew: false, matchStatus: 'matched' });
                              }
                            }}
                            className={`w-full px-2 py-1 border rounded text-xs ${item.createNew ? 'border-purple-300 bg-purple-50 text-purple-700' : item.matchStatus === 'matched' ? 'border-green-300 bg-green-50' : item.matchStatus === 'candidates' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-300'}`}
                          >
                            <option value="">-- Wybierz akcję --</option>
                            <option value="__NEW__">+ Utwórz nowy produkt</option>
                            {item.candidates && item.candidates.length > 0 && (
                              <optgroup label="Dopasowania w bazie">
                                {item.candidates.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.plantName} {c.potSize} (stan: {c.totalUnits}{c.isArchived ? ', ARCHIWUM' : ''}{c.similarity ? `, ${Math.round(c.similarity * 100)}%` : ''})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          {item.createNew && (
                            <span className="text-xs text-purple-600 font-medium">→ Zostanie utworzony nowy produkt</span>
                          )}
                          {item.matchedProductId && !item.createNew && (
                            <span className="text-xs text-green-600">→ Doda ilosc + zaktualizuje date i cene</span>
                          )}
                          {item.barcodeMatchInfo && (
                            <span className={`text-xs ${item.barcodeMatchInfo.isArchived ? 'text-orange-600' : 'text-blue-600'}`}>
                              EAN w bazie: {item.barcodeMatchInfo.plantName} {item.barcodeMatchInfo.potSize} (stan: {item.barcodeMatchInfo.totalUnits}){item.barcodeMatchInfo.isArchived ? ' [ARCHIWUM]' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="w-16 px-1 py-1 border border-gray-300 rounded text-xs text-center"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPriceNet}
                          onChange={(e) => updateItem(idx, { unitPriceNet: Number(e.target.value) })}
                          className="w-20 px-1 py-1 border border-gray-300 rounded text-xs text-right"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <select
                          value={item.vatRate}
                          onChange={(e) => updateItem(idx, { vatRate: Number(e.target.value) })}
                          className="px-1 py-1 border border-gray-300 rounded text-xs"
                        >
                          <option value={8}>8%</option>
                          <option value={23}>23%</option>
                          <option value={5}>5%</option>
                          <option value={0}>0%</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={item.growerPassport || ''}
                          onChange={(e) => updateItem(idx, { growerPassport: e.target.value })}
                          placeholder="-"
                          className="w-32 px-1 py-1 border border-gray-300 rounded text-xs"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          value={item.barcode || ''}
                          onChange={(e) => updateItem(idx, { barcode: e.target.value })}
                          placeholder="-"
                          className="w-28 px-1 py-1 border border-gray-300 rounded text-xs font-mono"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.skip || false}
                          onChange={(e) => updateItem(idx, { skip: e.target.checked })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {error && <div className="mt-2 text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>}
            </div>
          )}

          {step === 'confirming' && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-lg font-medium text-gray-700">Zatwierdzanie importu...</p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Import zakończony!</h3>
              <p className="text-gray-600">Utworzono nowych produktów: <strong>{result.createdProducts}</strong></p>
              <p className="text-gray-600">Zaktualizowano stan: <strong>{result.updatedStock}</strong></p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex justify-between items-center">
          {step === 'verify' && (
            <>
              <button onClick={handleClose} className="px-4 py-2 text-gray-600 hover:text-gray-900">
                Anuluj
              </button>
              <button
                onClick={handleConfirm}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                Zatwierdź import ({items.filter((i) => !i.skip).length} pozycji)
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={handleClose} className="ml-auto px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
              Zamknij
            </button>
          )}
          {(step === 'upload' || step === 'parsing' || step === 'confirming') && (
            <button onClick={handleClose} className="ml-auto px-4 py-2 text-gray-600 hover:text-gray-900">
              Anuluj
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
