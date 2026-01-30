import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { useState, useEffect, useRef } from 'react';
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
  // User role check
  const [userRole, setUserRole] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Inventory form state
  const [realPallets, setRealPallets] = useState<string>('');
  const [realLoose, setRealLoose] = useState<string>('');
  const [realTotal, setRealTotal] = useState<string>('');
  const [useTotal, setUseTotal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Recent movements
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Barcode scanner handler
  const handleBarcodeScan = async (barcode: string) => {
    setError(null);
    setSuccess(null);
    try {
      const result = await API.scanBarcode(barcode);
      if (result.product) {
        selectProduct(result.product);
      }
    } catch (err: any) {
      setError('Nie znaleziono produktu o kodzie: ' + barcode);
    }
  };

  // Use barcode scanner hook
  useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: userRole === 'admin',
  });

  // Get user role from JWT
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

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load recent movements
  useEffect(() => {
    loadMovements();
  }, []);

  const loadMovements = async () => {
    setMovementsLoading(true);
    try {
      // Get today's corrections/movements
      const today = new Date();
      const startDate = today.toISOString().split('T')[0];
      const result = await API.getInventoryMovements({
        startDate,
        limit: 20,
      });
      // Filter to show only manual corrections
      const filtered = (result.movements || []).filter(
        (m: any) => m.movementType === 'correction'
      );
      setMovements(filtered);
    } catch (err) {
      console.error('Error loading movements:', err);
    } finally {
      setMovementsLoading(false);
    }
  };

  // Search products
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const isBarcode = /^\d{8,}$/.test(searchQuery);
    const timeoutId = setTimeout(async () => {
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
      } catch (err: any) {
        if (isBarcode) {
          setError('Nie znaleziono produktu o tym kodzie');
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
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

  // Calculate difference
  const calculateDifference = () => {
    if (!selectedProduct) return { units: 0, pallets: 0 };

    const systemTotal = selectedProduct.totalUnits || 0;
    const systemPallets = selectedProduct.palletCount || 0;
    const systemLoose = selectedProduct.looseUnits || 0;
    const unitsPerPallet = selectedProduct.unitsPerPallet || 1;

    if (useTotal) {
      const realTotalNum = parseInt(realTotal) || 0;
      const diffUnits = realTotalNum - systemTotal;
      // Calculate pallet difference approximately
      const realPalletsCalc = Math.floor(realTotalNum / unitsPerPallet);
      const diffPallets = realPalletsCalc - systemPallets;
      return { units: diffUnits, pallets: diffPallets };
    } else {
      const realPalletsNum = parseInt(realPallets) || 0;
      const realLooseNum = parseInt(realLoose) || 0;
      const realTotalCalc = realPalletsNum * unitsPerPallet + realLooseNum;
      const diffUnits = realTotalCalc - systemTotal;
      const diffPallets = realPalletsNum - systemPallets;
      return { units: diffUnits, pallets: diffPallets };
    }
  };

  const diff = calculateDifference();
  const hasDifference = diff.units !== 0;

  const handleSubmit = async () => {
    if (!selectedProduct || !hasDifference) return;

    setSubmitting(true);
    setError(null);

    try {
      const unitsPerPallet = selectedProduct.unitsPerPallet || 1;

      let newPallets: number;
      let newLoose: number;

      if (useTotal) {
        const realTotalNum = parseInt(realTotal) || 0;
        newPallets = Math.floor(realTotalNum / unitsPerPallet);
        newLoose = realTotalNum % unitsPerPallet;
      } else {
        newPallets = parseInt(realPallets) || 0;
        newLoose = parseInt(realLoose) || 0;
      }

      // Update product inventory
      await API.updateProduct(selectedProduct.id, {
        palletCount: newPallets,
        looseUnits: newLoose,
      });

      setSuccess(`Zaktualizowano stan: ${diff.units > 0 ? '+' : ''}${diff.units} szt.`);

      // Reload product to get updated data
      const result = await API.scanBarcode(selectedProduct.barcode || '');
      if (result.product) {
        setSelectedProduct(result.product);
        setRealPallets(String(result.product.palletCount || 0));
        setRealLoose(String(result.product.looseUnits || 0));
      }

      loadMovements();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Błąd podczas zapisywania korekty');
    } finally {
      setSubmitting(false);
    }
  };

  // Access control
  if (userRole !== 'admin') {
    return (
      <div className="p-4 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Brak dostępu</h2>
        <p className="text-gray-600">Inwentaryzacja dostępna tylko dla administratorów</p>
      </div>
    );
  }

  return (
    <div className="p-3 pb-20 min-h-full bg-gray-100">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <span>📋</span> Inwentaryzacja
        </h2>
        <p className="text-xs text-gray-500">Skanuj lub wyszukaj produkt</p>
      </div>

      {/* Search */}
      {!selectedProduct && (
        <div className="mb-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Skanuj kod lub wpisz nazwę..."
              className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="off"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-2 bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-y-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onClick={() => selectProduct(product)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
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

      {/* Error / Success */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      {/* Selected Product */}
      {selectedProduct && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
          {/* Product Image */}
          {selectedProduct.imageUrl && !imageError ? (
            <div
              className="relative w-full h-40 bg-gray-100 cursor-pointer"
              onClick={() => setShowFullImage(true)}
            >
              <img
                src={selectedProduct.imageUrl}
                alt={selectedProduct.plantName}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
              <div className="absolute bottom-2 right-2 bg-black/50 text-white p-1.5 rounded">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
            </div>
          ) : null}

          {/* Product Header */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">{selectedProduct.plantName}</h3>
                <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                  {selectedProduct.potSize && <span>Doniczka: {selectedProduct.potSize}</span>}
                  {selectedProduct.barcode && <span>Kod: {selectedProduct.barcode}</span>}
                </div>
              </div>
              <button
                onClick={clearSelection}
                className="text-gray-400 hover:text-gray-600 text-xl px-2"
              >
                ×
              </button>
            </div>
          </div>

          {/* System State */}
          <div className="p-4 bg-gray-50 border-b border-gray-100">
            <div className="text-xs font-medium text-gray-500 mb-2">STAN W SYSTEMIE</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg p-2 border">
                <div className="text-lg font-bold text-gray-900">{selectedProduct.palletCount || 0}</div>
                <div className="text-xs text-gray-500">Palety</div>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <div className="text-lg font-bold text-gray-900">{selectedProduct.looseUnits || 0}</div>
                <div className="text-xs text-gray-500">Luźne</div>
              </div>
              <div className="bg-white rounded-lg p-2 border">
                <div className="text-lg font-bold text-blue-600">{selectedProduct.totalUnits || 0}</div>
                <div className="text-xs text-gray-500">Razem szt.</div>
              </div>
            </div>
            {selectedProduct.unitsPerPallet && (
              <div className="text-xs text-gray-400 mt-2 text-center">
                ({selectedProduct.unitsPerPallet} szt. na palecie)
              </div>
            )}
          </div>

          {/* Real State Input */}
          <div className="p-4 border-b border-gray-100">
            <div className="text-xs font-medium text-gray-500 mb-3">RZECZYWISTY STAN</div>

            {/* Toggle mode */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setUseTotal(false)}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-colors ${
                  !useTotal
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Palety + Luźne
              </button>
              <button
                onClick={() => setUseTotal(true)}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-colors ${
                  useTotal
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Razem sztuk
              </button>
            </div>

            {!useTotal ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Palety</label>
                  <input
                    type="number"
                    value={realPallets}
                    onChange={(e) => setRealPallets(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-blue-500"
                    min="0"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Luźne sztuki</label>
                  <input
                    type="number"
                    value={realLoose}
                    onChange={(e) => setRealLoose(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-blue-500"
                    min="0"
                    inputMode="numeric"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Razem sztuk</label>
                <input
                  type="number"
                  value={realTotal}
                  onChange={(e) => setRealTotal(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold focus:ring-2 focus:ring-blue-500"
                  min="0"
                  inputMode="numeric"
                  placeholder={String(selectedProduct.totalUnits || 0)}
                />
              </div>
            )}
          </div>

          {/* Difference */}
          {hasDifference && (
            <div className={`p-4 ${diff.units > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-xs font-medium text-gray-500 mb-1">RÓŻNICA</div>
              <div className={`text-2xl font-bold ${diff.units > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {diff.units > 0 ? '+' : ''}{diff.units} szt.
              </div>
              {diff.pallets !== 0 && (
                <div className="text-sm text-gray-500">
                  ({diff.pallets > 0 ? '+' : ''}{diff.pallets} palet)
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <div className="p-4">
            <button
              onClick={handleSubmit}
              disabled={!hasDifference || submitting}
              className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
                hasDifference && !submitting
                  ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Zapisywanie...
                </span>
              ) : hasDifference ? (
                `Zapisz korektę (${diff.units > 0 ? '+' : ''}${diff.units} szt.)`
              ) : (
                'Brak różnicy'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Recent Adjustments */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-3 border-b border-gray-100">
          <h3 className="font-medium text-gray-800 text-sm">Dzisiejsze korekty</h3>
        </div>
        {movementsLoading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Ładowanie...</div>
        ) : movements.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">Brak korekt</div>
        ) : (
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {movements.map((adj) => (
              <div key={adj.id} className="p-3 flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium text-gray-900">{adj.plantName}</div>
                  <div className="text-xs text-gray-500">
                    {adj.potSize && <span>{adj.potSize} • </span>}
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

      {/* Full Image Modal */}
      {showFullImage && selectedProduct?.imageUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl font-bold z-10"
            onClick={() => setShowFullImage(false)}
          >
            ×
          </button>
          <img
            src={selectedProduct.imageUrl}
            alt={selectedProduct.plantName}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
