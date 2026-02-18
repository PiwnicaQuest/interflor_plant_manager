import { useState, useEffect, useRef, useCallback } from 'react';
import { API } from '../../services/api';
import type { Product, InventoryMovement } from '../../types';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';

export function ScannerScanPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Obsługa skanera kodów kreskowych z prefiksem [barcode]
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setSearchLoading(true);
    setError(null);
    setSearchResults([]);
    setSearchQuery('');

    try {
      const result = await API.scanBarcode(barcode);
      setSelectedProduct(result.product);
      setMovements(result.recentMovements || []);
    } catch (err: any) {
      setError('Produkt nie znaleziony: ' + barcode);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useBarcodeScanner({ onScan: handleBarcodeScan });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setImageError(false);
    setShowFullImage(false);
  }, [selectedProduct?.id]);

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
          setMovements(result.recentMovements || []);
          setSearchResults([]);
          setSearchQuery('');
        } else {
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
    setImageError(false);
    setShowFullImage(false);
    inputRef.current?.focus();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMovementTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      purchase: 'Zakup',
      sale: 'Sprzedaz',
      order: 'Zamówienie',
      loss: 'Strata',
      loss_reversal: 'Cofniecie straty',
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

  const PlaceholderImage = ({ className }: { className?: string }) => (
    <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search Header - COMPACT */}
      <div className="bg-white shadow-sm p-3 sticky top-0 z-10">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Clear selected product when user starts typing to show search results
              if (e.target.value && selectedProduct) {
                setSelectedProduct(null);
                setMovements([]);
                setError(null);
              }
            }}
            placeholder="Skanuj kod lub wpisz nazwe..."
            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-10"
            autoComplete="off"
          />
          {searchLoading ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
            </div>
          ) : searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {!selectedProduct && searchQuery.length === 0 && (
          <p className="mt-1.5 text-xs text-gray-500 text-center">
            Wpisz kod kreskowy lub min. 2 znaki nazwy
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Error - COMPACT */}
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* Search Results - COMPACT */}
        {searchResults.length > 0 && !selectedProduct && (
          <div className="space-y-1.5">
            <h2 className="text-xs font-medium text-gray-500 px-1">
              Wyniki ({searchResults.length})
            </h2>
            {searchResults.map((product) => (
              <button
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className="w-full bg-white rounded-lg p-2.5 shadow-sm border border-gray-100 text-left active:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {/* Thumbnail - COMPACT */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.plantName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <PlaceholderImage className={`w-full h-full ${product.imageUrl ? 'hidden' : ''}`} />
                  </div>

                  {/* Info - COMPACT */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-xs">{product.plantName}</div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-1.5">
                      {product.potSize && <span>{product.potSize}</span>}
                      {product.plantHeightCm && <span>{product.plantHeightCm}cm</span>}
                    </div>
                  </div>

                  {/* Stock & Price */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="font-bold text-primary-600 text-sm">{product.totalUnits}</div>
                      <div className="text-xs text-gray-500">szt.</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-blue-600 text-sm">{product.basePriceGross?.toFixed(2) || "0"}</div>
                      <div className="text-xs text-gray-500">PLN</div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No results */}
        {searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && !selectedProduct && !error && (
          <div className="text-center py-6 text-gray-500 text-sm">
            Brak wynikow dla "{searchQuery}"
          </div>
        )}

        {/* Product Loading */}
        {productLoading && (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        )}

        {/* Product Details - COMPACT */}
        {selectedProduct && !productLoading && (
          <div className="space-y-3">
            {/* Product Card - COMPACT */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              {/* Product Image - COMPACT h-48 → h-32 */}
              {selectedProduct.imageUrl && !imageError ? (
                <div
                  className="relative w-full h-32 bg-gray-100 cursor-pointer"
                  onClick={() => setShowFullImage(true)}
                >
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.plantName}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                  <div className="absolute bottom-1.5 right-1.5 bg-black/50 text-white p-1.5 rounded">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </div>
              ) : (
                <PlaceholderImage className="w-full h-24" />
              )}

              {/* Header with name - COMPACT */}
              <div className="bg-primary-600 text-white p-3">
                <div className="flex justify-between items-start">
                  <h2 className="text-base font-bold flex-1">{selectedProduct.plantName}</h2>
                  <button
                    onClick={handleClear}
                    className="ml-2 p-1.5 hover:bg-primary-700 rounded transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-3">
                {/* Main Stats - COMPACT */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary-600">{selectedProduct.totalUnits}</div>
                    <div className="text-xs text-gray-600">Stan magazynowy</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-gray-900">{selectedProduct.basePriceGross?.toFixed(2)}</div>
                    <div className="text-xs text-gray-600">Cena PLN</div>
                  </div>
                </div>

                {/* Details - COMPACT */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selectedProduct.potSize && (
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Doniczka</span>
                      <span className="font-medium">{selectedProduct.potSize}</span>
                    </div>
                  )}
                  {selectedProduct.plantHeightCm && (
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Wysokość</span>
                      <span className="font-medium">{selectedProduct.plantHeightCm} cm</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Palety</span>
                    <span className="font-medium">{selectedProduct.palletCount}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Szt/paleta</span>
                    <span className="font-medium">{selectedProduct.unitsPerPallet}</span>
                  </div>
                  {selectedProduct.looseUnits !== undefined && selectedProduct.looseUnits > 0 && (
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Luzne szt</span>
                      <span className="font-medium">{selectedProduct.looseUnits}</span>
                    </div>
                  )}
                  {selectedProduct.barcode && (
                    <div className="col-span-2 flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Kod</span>
                      <span className="font-mono text-xs">{selectedProduct.barcode}</span>
                    </div>
                  )}
                  {selectedProduct.createdAt && (
                    <div className="col-span-2 flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">Data dodania</span>
                      <span className="font-medium">
                        {new Date(selectedProduct.createdAt).toLocaleDateString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Movements - COMPACT */}
            {movements.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-700 text-sm">Ostatnie ruchy</h3>
                </div>
                <div className="divide-y divide-gray-100 max-h-48 overflow-auto">
                  {movements.slice(0, 50).map((movement) => (
                    <div key={movement.id} className="px-3 py-2 flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        {movement.movementType === 'order' && movement.orderNumber ? (
                          <>
                            <div className="font-medium text-gray-900 text-sm truncate">
                              #{movement.orderNumber}
                              {(movement.orderCustomerCode || movement.orderCustomerName) && (
                                <span className="text-gray-600 font-normal"> - {movement.orderCustomerCode && "[" + movement.orderCustomerCode + "] "}{movement.orderCustomerName}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {movement.orderStatus && (
                                <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                                  movement.orderStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  movement.orderStatus === 'ready_for_pickup' ? 'bg-purple-100 text-purple-800' :
                                  movement.orderStatus === 'completed' ? 'bg-green-100 text-green-800' :
                                  movement.orderStatus === 'cancelled' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {movement.orderStatus === 'pending' ? 'Oczekujące' :
                                   movement.orderStatus === 'ready_for_pickup' ? 'Do odbióru' :
                                   movement.orderStatus === 'completed' ? 'Zakonczone' :
                                   movement.orderStatus === 'cancelled' ? 'Anulowane' :
                                   movement.orderStatus}
                                </span>
                              )}
                              <span className="text-xs text-gray-400">{formatDate(movement.createdAt)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-gray-900 text-sm">
                              {getMovementTypeLabel(movement.movementType)}
                            </div>
                            <div className="text-xs text-gray-400">{formatDate(movement.createdAt)}</div>
                          </>
                        )}
                      </div>
                      <div className={`font-bold text-sm ${getMovementColor(movement.deltaUnits)} ml-2`}>
                        {movement.deltaUnits > 0 ? '+' : ''}{movement.deltaUnits}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New Search Button - COMPACT */}
            <button
              onClick={handleClear}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
            >
              Nowe wyszukiwanie
            </button>
          </div>
        )}

        {/* Empty State - COMPACT */}
        {!selectedProduct && !searchLoading && searchQuery.length < 2 && searchResults.length === 0 && (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
              <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-1">Skanuj produkt</h2>
            <p className="text-gray-500 text-sm">
              Uzyj skanera lub wpisz nazwe produktu
            </p>
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
            onClick={() => setShowFullImage(false)}
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={selectedProduct.imageUrl}
            alt={selectedProduct.plantName}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <div className="bg-black/50 text-white py-2 px-4 rounded-lg inline-block text-sm">
              {selectedProduct.plantName}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
