import { useState, useEffect, useRef } from 'react';
import { API } from '../../services/api';
import type { Product, InventoryMovement } from '../../types';

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

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset image error when product changes
  useEffect(() => {
    setImageError(false);
    setShowFullImage(false);
  }, [selectedProduct?.id]);

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
      order: 'Zamowienie',
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
    if (deltaUnits > 0) return 'text-green-600';
    if (deltaUnits < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  // Placeholder for missing images
  const PlaceholderImage = ({ className }: { className?: string }) => (
    <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
      <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search Header */}
      <div className="bg-white shadow-sm p-4 sticky top-0 z-10">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Skanuj kod lub wpisz nazwe..."
            className="w-full px-4 py-3 text-lg border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 pr-12"
            autoComplete="off"
          />
          {searchLoading ? (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
            </div>
          ) : searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {!selectedProduct && searchQuery.length === 0 && (
          <p className="mt-2 text-sm text-gray-500 text-center">
            Wpisz kod kreskowy lub min. 2 znaki nazwy
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Error */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
            {error}
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && !selectedProduct && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-gray-500 px-1">
              Wyniki ({searchResults.length})
            </h2>
            {searchResults.map((product) => (
              <button
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className="w-full bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-left active:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
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

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{product.plantName}</div>
                    <div className="text-sm text-gray-500 flex flex-wrap gap-2">
                      {product.potSize && <span>{product.potSize}</span>}
                      {product.plantHeightCm && <span>{product.plantHeightCm}cm</span>}
                    </div>
                  </div>

                  {/* Stock */}
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-green-600 text-lg">{product.totalUnits}</div>
                    <div className="text-xs text-gray-500">szt.</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No results */}
        {searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && !selectedProduct && !error && (
          <div className="text-center py-8 text-gray-500">
            Brak wynikow dla "{searchQuery}"
          </div>
        )}

        {/* Product Loading */}
        {productLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
          </div>
        )}

        {/* Product Details */}
        {selectedProduct && !productLoading && (
          <div className="space-y-4">
            {/* Product Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Product Image */}
              {selectedProduct.imageUrl && !imageError ? (
                <div
                  className="relative w-full h-48 bg-gray-100 cursor-pointer"
                  onClick={() => setShowFullImage(true)}
                >
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.plantName}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                  {/* Zoom icon overlay */}
                  <div className="absolute bottom-2 right-2 bg-black/50 text-white p-2 rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </div>
              ) : (
                <PlaceholderImage className="w-full h-32" />
              )}

              {/* Header with name */}
              <div className="bg-green-600 text-white p-4">
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-bold flex-1">{selectedProduct.plantName}</h2>
                  <button
                    onClick={handleClear}
                    className="ml-2 p-2 hover:bg-green-700 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-4">
                {/* Main Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-green-600">{selectedProduct.totalUnits}</div>
                    <div className="text-sm text-gray-600">Stan magazynowy</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-gray-900">{selectedProduct.basePriceGross?.toFixed(2)}</div>
                    <div className="text-sm text-gray-600">Cena PLN</div>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedProduct.potSize && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Doniczka</span>
                      <span className="font-medium">{selectedProduct.potSize}</span>
                    </div>
                  )}
                  {selectedProduct.plantHeightCm && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Wysokosc</span>
                      <span className="font-medium">{selectedProduct.plantHeightCm} cm</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Palety</span>
                    <span className="font-medium">{selectedProduct.palletCount}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Szt/paleta</span>
                    <span className="font-medium">{selectedProduct.unitsPerPallet}</span>
                  </div>
                  {selectedProduct.looseUnits !== undefined && selectedProduct.looseUnits > 0 && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Luzne szt</span>
                      <span className="font-medium">{selectedProduct.looseUnits}</span>
                    </div>
                  )}
                  {selectedProduct.barcode && (
                    <div className="col-span-2 flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Kod</span>
                      <span className="font-mono text-xs">{selectedProduct.barcode}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Movements */}
            {movements.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-700">Ostatnie ruchy</h3>
                </div>
                <div className="divide-y divide-gray-100 max-h-60 overflow-auto">
                  {movements.slice(0, 10).map((movement) => (
                    <div key={movement.id} className="px-4 py-3 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-gray-900">
                          {getMovementTypeLabel(movement.movementType)}
                        </div>
                        <div className="text-xs text-gray-400">{formatDate(movement.createdAt)}</div>
                      </div>
                      <div className={`font-bold ${getMovementColor(movement.deltaUnits)}`}>
                        {movement.deltaUnits > 0 ? '+' : ''}{movement.deltaUnits}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New Search Button */}
            <button
              onClick={handleClear}
              className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors"
            >
              Nowe wyszukiwanie
            </button>
          </div>
        )}

        {/* Empty State */}
        {!selectedProduct && !searchLoading && searchQuery.length < 2 && searchResults.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Skanuj produkt</h2>
            <p className="text-gray-500">
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
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="bg-black/50 text-white py-2 px-4 rounded-lg inline-block">
              {selectedProduct.plantName}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
