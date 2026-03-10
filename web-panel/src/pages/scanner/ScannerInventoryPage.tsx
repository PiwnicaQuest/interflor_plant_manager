import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { useState, useEffect, useRef, useCallback } from 'react';
import { API } from '../../services/api';
import type { Product } from '../../types';

interface InventoryMovement {
  id: number;
  productId: number;
  deltaUnits: number;
  deltaPallets: number;
  movementType: string;
  reason?: string;
  createdAt: string;
  plantName?: string;
  potSize?: string;
  barcode?: string;
}

export function ScannerInventoryPage() {
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserRole(payload.role);
      } catch {
        setUserRole(null);
      }
    }
  }, []);

  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);

  const handleBarcodeScan = useCallback((barcode: string) => {
    setPendingBarcode(barcode);
  }, []);

  useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: userRole === 'admin',
  });

  if (userRole !== 'admin') {
    return (
      <div className="p-4 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Brak dostepu</h2>
        <p className="text-gray-600">Inwentaryzacja dostepna tylko dla administratorow</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-100">
      <InventoryTab pendingBarcode={pendingBarcode} onBarcodeHandled={() => setPendingBarcode(null)} />
    </div>
  );
}

function InventoryTab({ pendingBarcode, onBarcodeHandled }: { pendingBarcode: string | null; onBarcodeHandled: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [realPallets, setRealPallets] = useState<string>('');
  const [realLoose, setRealLoose] = useState<string>('');
  const [realTotal, setRealTotal] = useState<string>('');
  const [useTotal, setUseTotal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle barcode from scanner
  useEffect(() => {
    if (!pendingBarcode) return;
    (async () => {
      setError(null);
      setSuccess(null);
      try {
        const result = await API.scanBarcode(pendingBarcode);
        if (result.product) selectProduct(result.product);
      } catch {
        setError('Nie znaleziono produktu o kodzie: ' + pendingBarcode);
      }
      onBarcodeHandled();
    })();
  }, [pendingBarcode]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => { loadMovements(); }, []);

  const loadMovements = async () => {
    setMovementsLoading(true);
    try {
      const today = new Date();
      const result = await API.getInventoryMovements({ startDate: today.toISOString().split('T')[0], limit: 20 });
      setMovements((result.movements || []).filter((m: any) => m.movementType === 'correction'));
    } catch {} finally { setMovementsLoading(false); }
  };

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const isBarcode = /^\d{8,}$/.test(searchQuery);
    const t = setTimeout(async () => {
      setSearchLoading(true);
      setError(null);
      try {
        if (isBarcode) {
          const result = await API.scanBarcode(searchQuery);
          selectProduct(result.product);
        } else {
          const result = await API.getInventory({ search: searchQuery, isArchived: false });
          setSearchResults(result.products || []);
        }
      } catch { if (isBarcode) setError('Nie znaleziono produktu o tym kodzie'); }
      finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const selectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearchResults([]);
    setSearchQuery('');
    setRealPallets(String(product.palletCount || 0));
    setRealLoose(String(product.looseUnits || 0));
    setRealTotal('');
    setUseTotal(false);
    setError(null);
    setSuccess(null);
    setImageError(false);
    setShowFullImage(false);
  };

  const clearSelection = () => {
    setSelectedProduct(null);
    setRealPallets('');
    setRealLoose('');
    setRealTotal('');
    setUseTotal(false);
    setError(null);
    setSuccess(null);
    inputRef.current?.focus();
  };

  const calculateDifference = () => {
    if (!selectedProduct) return { units: 0, pallets: 0 };
    const systemTotal = selectedProduct.totalUnits || 0;
    const systemPallets = selectedProduct.palletCount || 0;
    const unitsPerPallet = selectedProduct.unitsPerPallet || 1;
    if (useTotal) {
      const r = parseInt(realTotal) || 0;
      return { units: r - systemTotal, pallets: Math.floor(r / unitsPerPallet) - systemPallets };
    } else {
      const rp = parseInt(realPallets) || 0;
      const rl = parseInt(realLoose) || 0;
      return { units: (rp * unitsPerPallet + rl) - systemTotal, pallets: rp - systemPallets };
    }
  };

  const diff = calculateDifference();
  const hasDifference = diff.units !== 0;

  const handleSubmit = async () => {
    if (!selectedProduct || !hasDifference) return;
    setSubmitting(true);
    setError(null);
    try {
      const upp = selectedProduct.unitsPerPallet || 1;
      let np: number, nl: number;
      if (useTotal) {
        const r = parseInt(realTotal) || 0;
        np = Math.floor(r / upp); nl = r % upp;
      } else {
        np = parseInt(realPallets) || 0; nl = parseInt(realLoose) || 0;
      }
      await API.updateProduct(selectedProduct.id, { palletCount: np, looseUnits: nl });
      setSuccess(`Zaktualizowano stan: ${diff.units > 0 ? '+' : ''}${diff.units} szt.`);
      try {
        const result = await API.scanBarcode(selectedProduct.barcode || '');
        if (result.product) {
          setSelectedProduct(result.product);
          setRealPallets(String(result.product.palletCount || 0));
          setRealLoose(String(result.product.looseUnits || 0));
        }
      } catch {}
      loadMovements();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Blad podczas zapisywania korekty');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="p-3 pb-20">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span>📋</span> Inwentaryzacja
        </h2>
        <p className="text-xs text-gray-500">Skanuj lub wyszukaj produkt</p>
      </div>

      {!selectedProduct && (
        <div className="mb-4">
          <div className="relative">
            <input ref={inputRef} type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Skanuj kod lub wpisz nazwe..."
              className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500" autoComplete="off" />
            {searchLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div></div>}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-y-auto">
              {searchResults.map(product => (
                <button key={product.id} onClick={() => selectProduct(product)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                  <div className="font-medium text-gray-900 text-sm">{product.plantName}</div>
                  <div className="text-xs text-gray-500 flex gap-2">
                    {product.potSize && <span>{product.potSize}</span>}
                    {product.barcode && <span>Kod: {product.barcode}</span>}
                    <span>Stan: {product.totalUnits} szt.</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      {selectedProduct && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
          {selectedProduct.imageUrl && !imageError && (
            <div className="relative w-full h-40 bg-gray-100 cursor-pointer" onClick={() => setShowFullImage(true)}>
              <img src={selectedProduct.imageUrl} alt={selectedProduct.plantName} className="w-full h-full object-cover" onError={() => setImageError(true)} />
            </div>
          )}
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">{selectedProduct.plantName}</h3>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                  {selectedProduct.potSize && <span>Doniczka: {selectedProduct.potSize}</span>}
                  {selectedProduct.barcode && <span>Kod: {selectedProduct.barcode}</span>}
                </div>
              </div>
              <button onClick={clearSelection} className="text-gray-400 hover:text-gray-600 text-xl px-2">x</button>
            </div>
          </div>
          <div className="p-4 bg-gray-50 border-b border-gray-100">
            <div className="text-xs font-medium text-gray-500 mb-2">STAN W SYSTEMIE</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg p-2 border">
                <div className="text-lg font-bold text-gray-900">{selectedProduct.palletCount || 0}</div>
                <div className="text-xs text-gray-500">Palety</div>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <div className="text-lg font-bold text-gray-900">{selectedProduct.looseUnits || 0}</div>
                <div className="text-xs text-gray-500">Luzne</div>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <div className="text-lg font-bold text-blue-600">{selectedProduct.totalUnits || 0}</div>
                <div className="text-xs text-gray-500">Razem szt.</div>
              </div>
            </div>
            {selectedProduct.unitsPerPallet && <div className="text-xs text-gray-400 mt-2 text-center">({selectedProduct.unitsPerPallet} szt. na palecie)</div>}
          </div>
          <div className="p-4 border-b border-gray-100">
            <div className="text-xs font-medium text-gray-500 mb-3">RZECZYWISTY STAN</div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setUseTotal(false)}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-colors ${!useTotal ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                Palety + Luzne
              </button>
              <button onClick={() => setUseTotal(true)}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-colors ${useTotal ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                Razem sztuk
              </button>
            </div>
            {!useTotal ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Palety</label>
                  <input type="number" value={realPallets} onChange={e => setRealPallets(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-blue-500" min="0" inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Luzne sztuki</label>
                  <input type="number" value={realLoose} onChange={e => setRealLoose(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-blue-500" min="0" inputMode="numeric" />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Razem sztuk</label>
                <input type="number" value={realTotal} onChange={e => setRealTotal(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-blue-500"
                  min="0" inputMode="numeric" placeholder={String(selectedProduct.totalUnits || 0)} />
              </div>
            )}
          </div>
          {hasDifference && (
            <div className={`p-4 ${diff.units > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-xs font-medium text-gray-500 mb-1">ROZNICA</div>
              <div className={`text-2xl font-bold ${diff.units > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {diff.units > 0 ? '+' : ''}{diff.units} szt.
              </div>
              {diff.pallets !== 0 && <div className="text-sm text-gray-500">({diff.pallets > 0 ? '+' : ''}{diff.pallets} palet)</div>}
            </div>
          )}
          <div className="p-4">
            <button onClick={handleSubmit} disabled={!hasDifference || submitting}
              className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${hasDifference && !submitting ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed'}`}>
              {submitting ? 'Zapisywanie...' : hasDifference ? `Zapisz korekte (${diff.units > 0 ? '+' : ''}${diff.units} szt.)` : 'Brak roznicy'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-3 border-b border-gray-100">
          <h3 className="font-medium text-gray-800 text-sm">Dzisiejsze korekty</h3>
        </div>
        {movementsLoading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Ladowanie...</div>
        ) : movements.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">Brak korekt</div>
        ) : (
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {movements.map(adj => (
              <div key={adj.id} className="p-3 flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium text-gray-900">{adj.plantName}</div>
                  <div className="text-xs text-gray-500">
                    {adj.potSize && <span>{adj.potSize} - </span>}
                    {new Date(adj.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className={`text-sm font-bold ${adj.deltaUnits >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {adj.deltaUnits >= 0 ? '+' : ''}{adj.deltaUnits} szt.
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showFullImage && selectedProduct?.imageUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setShowFullImage(false)}>
          <button className="absolute top-4 right-4 text-white text-3xl font-bold z-10" onClick={() => setShowFullImage(false)}>x</button>
          <img src={selectedProduct.imageUrl} alt={selectedProduct.plantName} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
