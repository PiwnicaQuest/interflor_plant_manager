import { useState, useEffect, useRef, useCallback } from 'react';
import { API } from '../services/api';
import type { Product, InventoryMovement } from '../types';

export function ScannerPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    // Check if it looks like a barcode (long number)
    const isBarcode = /^\d{8,}$/.test(searchQuery);

    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      setError(null);

      try {
        if (isBarcode) {
          // Direct barcode scan
          const result = await API.scanBarcode(searchQuery);
          setSelectedProduct(result.product);
          setMovements(result.recentMovements || []);
          setSearchResults([]);
          setSearchQuery('');
        } else {
          // Name search
          const result = await API.getInventory({ search: searchQuery, isArchived: false });
          setSearchResults(result.products || []);
        }
      } catch (err: any) {
        if (isBarcode) {
          setError('Produkt nie znaleziony');
        }
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSelectProduct = async (product: Product) => {
    setProductLoading(true);
    setError(null);
    setSearchResults([]);
    setSearchQuery('');

    try {
      if (product.barcode) {
        const result = await API.scanBarcode(product.barcode);
        setSelectedProduct(result.product);
        setMovements(result.recentMovements || []);
      } else {
        // Get product details
        const result = await API.getProduct(product.id);
        setSelectedProduct(result.product);
        setMovements(result.movements || []);
      }
    } catch (err: any) {
      setSelectedProduct(product);
      setMovements([]);
    } finally {
      setProductLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedProduct(null);
    setMovements([]);
    setSearchQuery('');
    setSearchResults([]);
    setError(null);
    inputRef.current?.focus();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMovementTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      purchase: 'Zakup',
      sale: 'Sprzedaż',
      order: 'Zamówienie',
      loss: 'Strata',
      loss_reversal: 'Cofnięcie straty',
      adjustment: 'Korekta',
      correction: 'Korekta',
      return: 'Zwrot',
      merge: 'Scalenie',
    };
    return types[type?.toLowerCase()] || type;
  };

  const getMovementColor = (deltaUnits: number) => {
    if (deltaUnits > 0) return 'text-primary-600';
    if (deltaUnits < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">📦 Skaner Magazynowy</h1>

          {/* Search Input */}
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zeskanuj kod kreskowy lub wpisz nazwę rośliny..."
              className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-10"
              autoComplete="off"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
              </div>
            )}
          </div>

          {/* Search hint */}
          {!selectedProduct && searchQuery.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">
              Wpisz kod kreskowy lub co najmniej 2 znaki nazwy produktu
            </p>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && !selectedProduct && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="font-semibold text-gray-700">
                Wyniki wyszukiwania ({searchResults.length})
              </h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleSelectProduct(product)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-gray-900">{product.plantName}</div>
                    <div className="text-sm text-gray-500 flex gap-3">
                      {product.potSize && <span>Doniczka: {product.potSize}</span>}
                      {product.plantHeightCm && <span>Wys: {product.plantHeightCm} cm</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-primary-600">{product.totalUnits} szt.</div>
                    <div className="text-sm text-gray-600">{product.basePriceGross?.toFixed(2)} PLN</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && !selectedProduct && !error && (
          <div className="text-center py-8 text-gray-500">
            Brak wyników dla "{searchQuery}"
          </div>
        )}

        {/* Product Details */}
        {productLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        )}

        {selectedProduct && !productLoading && (
          <div className="space-y-4">
            {/* Product Info Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-gray-900">{selectedProduct.plantName}</h2>
                <button
                  onClick={handleClear}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Nowe wyszukiwanie
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selectedProduct.potSize && (
                  <div>
                    <div className="text-sm text-gray-500">Rozmiar doniczki</div>
                    <div className="font-medium">{selectedProduct.potSize}</div>
                  </div>
                )}
                {selectedProduct.plantHeightCm && (
                  <div>
                    <div className="text-sm text-gray-500">Wysokość</div>
                    <div className="font-medium">{selectedProduct.plantHeightCm} cm</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-500">Stan magazynowy</div>
                  <div className="font-bold text-xl text-primary-600">{selectedProduct.totalUnits} szt.</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Cena brutto</div>
                  <div className="font-bold text-xl">{selectedProduct.basePriceGross?.toFixed(2)} PLN</div>
                </div>
              </div>

              {/* Additional details */}
              <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {selectedProduct.palletCount !== undefined && (
                  <div>
                    <span className="text-gray-500">Palety:</span>{' '}
                    <span className="font-medium">{selectedProduct.palletCount}</span>
                  </div>
                )}
                {selectedProduct.unitsPerPallet && (
                  <div>
                    <span className="text-gray-500">Szt/paleta:</span>{' '}
                    <span className="font-medium">{selectedProduct.unitsPerPallet}</span>
                  </div>
                )}
                {selectedProduct.looseUnits !== undefined && (
                  <div>
                    <span className="text-gray-500">Luźne szt:</span>{' '}
                    <span className="font-medium">{selectedProduct.looseUnits}</span>
                  </div>
                )}
                {selectedProduct.barcode && (
                  <div>
                    <span className="text-gray-500">Kod:</span>{' '}
                    <span className="font-medium font-mono text-xs">{selectedProduct.barcode}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Movements */}
            {movements.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-700">Ostatnie ruchy magazynowe</h3>
                </div>
                <div className="divide-y divide-gray-200 max-h-80 overflow-y-auto">
                  {movements.map((movement) => (
                    <div key={movement.id} className="px-4 py-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-900">
                            {getMovementTypeLabel(movement.movementType)}
                          </div>
                          {movement.reason && (
                            <div className="text-sm text-gray-500 mt-1">{movement.reason}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">
                            {formatDate(movement.createdAt)}
                          </div>
                        </div>
                        <div className={`font-bold ${getMovementColor(movement.deltaUnits)}`}>
                          {movement.deltaUnits > 0 ? '+' : ''}{movement.deltaUnits} szt.
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!selectedProduct && !searchLoading && searchQuery.length < 2 && searchResults.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📦</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Skaner Magazynowy</h2>
            <p className="text-gray-500">
              Zeskanuj kod kreskowy lub wyszukaj produkt po nazwie
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
