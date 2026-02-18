import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { useState, useEffect, useRef } from 'react';
import { API } from '../../services/api';
import type { Product } from '../../types';

interface Loss {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  notes?: string;
  isReversed: boolean;
  createdAt: string;
  plantName?: string;
  potSize?: string;
  barcode?: string;
}

export function ScannerLossPage() {
  // User role check
  const [userRole, setUserRole] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Loss form state
  const [quantity, setQuantity] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Losses list
  const [losses, setLosses] = useState<Loss[]>([]);
  const [lossesLoading, setLossesLoading] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Barcode scanner handler
  const handleBarcodeScan = async (barcode: string) => {
    setError(null);
    setSuccess(null);
    try {
      const result = await API.scanBarcode(barcode);
      if (result.product) {
        setSelectedProduct(result.product);
        setSearchResults([]);
        setSearchQuery('');
        setQuantity('');
        setNotes('');
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

  // Load recent losses
  useEffect(() => {
    loadLosses();
  }, []);

  const loadLosses = async () => {
    setLossesLoading(true);
    try {
      const result = await API.getLosses({ showReversed: false });
      setLosses(result.losses?.slice(0, 20) || []);
    } catch (err) {
      console.error('Error loading losses:', err);
    } finally {
      setLossesLoading(false);
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
          setSelectedProduct(result.product);
          setSearchResults([]);
          setSearchQuery('');
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
    setQuantity('');
    setNotes('');
    setError(null);
    setSuccess(null);
  };

  const clearSelection = () => {
    setSelectedProduct(null);
    setQuantity('');
    setNotes('');
    setError(null);
    setSuccess(null);
    setShowConfirm(false);
    inputRef.current?.focus();
  };

  const calculateStock = (product: Product): number => {
    const pallets = product.palletCount || 0;
    const unitsPerPallet = product.unitsPerPallet || 1;
    const loose = product.looseUnits || 0;
    return pallets * unitsPerPallet + loose;
  };

  const handleSubmit = () => {
    if (!selectedProduct || !quantity) return;

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Podaj prawidłową ilość');
      return;
    }

    const stock = calculateStock(selectedProduct);
    if (qty > stock) {
      setError(`Niewystarczający stan. Dostępne: ${stock} szt.`);
      return;
    }

    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    if (!selectedProduct) return;

    setSubmitting(true);
    setError(null);
    setShowConfirm(false);

    try {
      await API.createLoss({
        productId: selectedProduct.id,
        quantity: parseInt(quantity),
        notes: notes || undefined
      });

      setSuccess(`Zarejestrowano stratę: ${quantity} szt.`);

      // Refresh product data
      const result = await API.scanBarcode(selectedProduct.barcode || '');
      setSelectedProduct(result.product);

      setQuantity('');
      setNotes('');
      loadLosses();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd rejestracji straty');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverse = async (lossId: number) => {
    if (!confirm('Czy na pewno chcesz cofnąć tę stratę?')) return;

    try {
      await API.reverseLoss(lossId);
      setSuccess('Strata została cofnięta');
      loadLosses();
      if (selectedProduct) {
        const result = await API.scanBarcode(selectedProduct.barcode || '');
        setSelectedProduct(result.product);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Błąd cofania straty');
    }
  };

  // Admin check
  if (userRole !== 'admin') {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <svg className="w-12 h-12 mx-auto text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold text-red-800">Brak dostępu</h3>
          <p className="text-red-600 text-sm mt-1">Tylko administratorzy mogą rejestrować straty</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h1 className="text-lg font-bold text-gray-800">Rejestracja Strat</h1>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-primary-700 text-sm">
          {success}
        </div>
      )}

      {/* Search */}
      {!selectedProduct && (
        <div className="bg-white rounded-lg shadow p-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Szukaj produktu (nazwa lub kod)
          </label>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Skanuj kod lub wpisz nazwę..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />

          {searchLoading && (
            <div className="mt-2 text-center text-gray-500 text-sm">Szukanie...</div>
          )}

          {searchResults.length > 0 && (
            <div className="mt-2 border rounded-lg divide-y max-h-60 overflow-y-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onClick={() => selectProduct(product)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium text-sm">{product.plantName}</div>
                    <div className="text-xs text-gray-500">{product.potSize} • {product.barcode}</div>
                  </div>
                  <div className="text-xs text-gray-600">
                    {calculateStock(product)} szt.
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected Product */}
      {selectedProduct && (
        <div className="bg-white rounded-lg shadow p-3 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-bold text-gray-800">{selectedProduct.plantName}</h2>
              <p className="text-sm text-gray-600">{selectedProduct.potSize} • {selectedProduct.barcode}</p>
            </div>
            <button
              onClick={clearSelection}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500">Stan:</span>
              <span className="font-bold ml-1">{calculateStock(selectedProduct)} szt.</span>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <span className="text-gray-500">Cena:</span>
              <span className="font-bold ml-1">{selectedProduct.purchasePricePln?.toFixed(2) || '0.00'} zł</span>
            </div>
          </div>

          {/* Loss Form */}
          <div className="border-t pt-3 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ilość straty (szt.)
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                max={calculateStock(selectedProduct)}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notatki (opcjonalnie)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Powód straty, opis uszkodzenia..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
              />
            </div>

            {quantity && parseInt(quantity) > 0 && (
              <div className="bg-red-50 rounded-lg p-2 text-center">
                <span className="text-red-700 font-medium">
                  Wartość straty: {(parseInt(quantity) * (selectedProduct.purchasePricePln || 0)).toFixed(2)} zł
                </span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!quantity || parseInt(quantity) <= 0 || submitting}
              className="w-full bg-red-600 text-white py-3 rounded-lg font-medium disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              {submitting ? 'Zapisywanie...' : 'Zarejestruj stratę'}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 max-w-sm w-full">
            <h3 className="font-bold text-lg mb-2">Potwierdź stratę</h3>
            <p className="text-gray-600 text-sm mb-3">
              Czy na pewno chcesz zarejestrować stratę <strong>{quantity} szt.</strong> produktu <strong>{selectedProduct.plantName}</strong>?
            </p>
            <p className="text-red-600 font-medium mb-4">
              Wartość: {(parseInt(quantity) * (selectedProduct.purchasePricePln || 0)).toFixed(2)} zł
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Anuluj
              </button>
              <button
                onClick={confirmSubmit}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Potwierdź
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Losses */}
      <div className="bg-white rounded-lg shadow p-3">
        <h3 className="font-medium text-gray-800 mb-2 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Ostatnie straty
        </h3>

        {lossesLoading ? (
          <div className="text-center text-gray-500 py-4 text-sm">Ładowanie...</div>
        ) : losses.length === 0 ? (
          <div className="text-center text-gray-500 py-4 text-sm">Brak zarejestrowanych strat</div>
        ) : (
          <div className="divide-y max-h-60 overflow-y-auto">
            {losses.map((loss) => (
              <div key={loss.id} className="py-2 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{loss.plantName}</div>
                  <div className="text-xs text-gray-500">
                    {loss.quantity} szt. • {loss.totalValue?.toFixed(2)} zł
                    {loss.notes && <span className="ml-1">• {loss.notes}</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(loss.createdAt).toLocaleString('pl-PL')}
                  </div>
                </div>
                <button
                  onClick={() => handleReverse(loss.id)}
                  className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                  title="Cofnij stratę"
                >
                  Cofnij
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
