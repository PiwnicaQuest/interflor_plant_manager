import { useState, useEffect } from 'react';
import { Product } from '../../types';
import { API } from '../../services/api';

interface MergedProductsInfoProps {
  product: Product;
  onUnmerge?: (unmergedProduct: Product, masterProduct: Product) => void;
}

export function MergedProductsInfo({ product, onUnmerge }: MergedProductsInfoProps) {
  const [mergedProducts, setMergedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [unmerging, setUnmerging] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasMergedProducts = product.mergedProductIds && product.mergedProductIds.length > 0;
  const isMergedInto = product.mergedIntoId !== null && product.mergedIntoId !== undefined;

  useEffect(() => {
    if (hasMergedProducts) {
      loadMergedProducts();
    }
  }, [product.id, hasMergedProducts]);

  const loadMergedProducts = async () => {
    setLoading(true);
    try {
      const response = await API.getMergedProducts(product.id);
      setMergedProducts(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udalo sie zaladowac polaczonych produktow');
    } finally {
      setLoading(false);
    }
  };

  const handleUnmerge = async (productId: number) => {
    setUnmerging(productId);
    setError(null);
    try {
      const response = await API.unmergeProduct(productId);
      setMergedProducts(prev => prev.filter(p => p.id !== productId));
      if (onUnmerge) {
        onUnmerge(response.unmergedProduct, response.masterProduct);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udalo sie rozlaczyc produktu');
    } finally {
      setUnmerging(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
    }).format(price);
  };

  // Show if product is merged into another product
  if (isMergedInto) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
        <div className="flex items-center gap-2 text-yellow-800">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">Ten produkt zostal polaczony z produktem #{product.mergedIntoId}</span>
        </div>
        <p className="text-sm text-yellow-700 mt-1">
          Stan magazynowy i sprzedaz sa teraz sledzone w produkcie glownym.
        </p>
      </div>
    );
  }

  // Show merged products info for master product
  if (!hasMergedProducts) {
    return null;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-blue-800">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span className="font-medium">Polaczone produkty ({product.mergedProductIds?.length || 0})</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-2 mb-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Merged barcodes */}
      {product.mergedBarcodes && product.mergedBarcodes.length > 0 && (
        <div className="mb-3">
          <p className="text-sm text-blue-700 font-medium mb-1">Aktywne kody kreskowe:</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-mono rounded">
              {product.barcode} (glowny)
            </span>
            {product.mergedBarcodes.map((barcode, idx) => (
              <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-mono rounded">
                {barcode}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Merged products list */}
      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
          <span className="text-sm text-blue-600">Ladowanie...</span>
        </div>
      ) : mergedProducts.length > 0 ? (
        <div className="space-y-2">
          {mergedProducts.map((mergedProduct) => (
            <div
              key={mergedProduct.id}
              className="flex items-center justify-between bg-white rounded-lg p-3 border border-blue-100"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">#{mergedProduct.id}</span>
                  <span className="text-xs text-gray-500 font-mono">{mergedProduct.barcode}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Cena: {formatPrice(mergedProduct.basePriceGross)} |
                  Hodowca: {mergedProduct.grower || '-'}
                </div>
              </div>
              <button
                onClick={() => handleUnmerge(mergedProduct.id)}
                disabled={unmerging === mergedProduct.id}
                className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
              >
                {unmerging === mergedProduct.id ? (
                  <span className="flex items-center gap-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-red-500 border-t-transparent"></div>
                    Rozlaczanie...
                  </span>
                ) : (
                  'Rozlacz'
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-blue-600">Brak szczegolowych danych o polaczonych produktach</p>
      )}

      <p className="text-xs text-blue-600 mt-3">
        Skanowanie dowolnego z powyzszych kodow kreskowych zwroci ten produkt glowny.
      </p>
    </div>
  );
}
