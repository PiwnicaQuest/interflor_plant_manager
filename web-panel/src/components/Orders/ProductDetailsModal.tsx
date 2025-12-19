import { useState, useEffect } from 'react';
import { Product } from '../../types';
import { api } from '../../services/api';

interface ProductDetailsModalProps {
  productId: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  onClose: () => void;
}

export function ProductDetailsModal({
  productId,
  quantity,
  unitPrice,
  totalPrice,
  onClose
}: ProductDetailsModalProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        setIsLoading(true);
        const response = await api.getProduct(productId);
        setProduct(response.product);
      } catch (err: any) {
        console.error('Błąd podczas pobierania produktu:', err);
        setError('Nie udało się załadować danych produktu');
      } finally {
        setIsLoading(false);
      }
    };

    loadProduct();
  }, [productId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-screen overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {isLoading ? 'Ładowanie...' : product?.plantName || 'Produkt'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                ID: {productId}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="text-sm text-gray-500 mt-2">Ładowanie danych...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          ) : product ? (
            <>
              {/* Zdjęcie */}
              {product.imageUrl && (
                <div className="mb-6">
                  <img
                    src={product.imageUrl}
                    alt={product.plantName}
                    className="w-full h-64 object-cover rounded-lg"
                  />
                </div>
              )}

              {/* Status magazynowy */}
              <div className="mb-6">
                {product.inventoryStatus === 'ok' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                    OK
                  </span>
                )}
                {product.inventoryStatus === 'low' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                    Niski stan
                  </span>
                )}
              </div>

              {/* Podstawowe informacje */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="card p-4">
                  <p className="text-sm text-gray-500 mb-1">Wielkość doniczki</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {product.potSize || 'Brak danych'}
                  </p>
                </div>

                <div className="card p-4">
                  <p className="text-sm text-gray-500 mb-1">Wysokość rośliny</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {product.plantHeightCm ? `${product.plantHeightCm} cm` : 'Brak danych'}
                  </p>
                </div>

                {product.barcode && (
                  <div className="card p-4">
                    <p className="text-sm text-gray-500 mb-1">Kod kreskowy</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {product.barcode}
                    </p>
                  </div>
                )}

                {product.plantPassport && (
                  <div className="card p-4">
                    <p className="text-sm text-gray-500 mb-1">Paszport roślinny</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {product.plantPassport}
                    </p>
                  </div>
                )}
              </div>

              {/* Stan magazynowy */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Stan magazynowy</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Palety</p>
                    <p className="text-2xl font-bold text-gray-900">{product.palletCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Sztuk na palecie</p>
                    <p className="text-2xl font-bold text-gray-900">{product.unitsPerPallet}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Łącznie sztuk</p>
                    <p className="text-2xl font-bold text-primary-600">{product.totalUnits}</p>
                  </div>
                </div>
              </div>

              {/* Ceny */}
              <div className="card p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Cennik</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cena bazowa brutto:</span>
                    <span className="font-semibold">{(Number(product.basePriceGross) || 0).toFixed(2)} PLN</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rabat 10%:</span>
                    <span className="font-semibold">{(Number(product.priceDiscount10) || 0).toFixed(2)} PLN</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rabat 12%:</span>
                    <span className="font-semibold">{(Number(product.priceDiscount12) || 0).toFixed(2)} PLN</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rabat 15%:</span>
                    <span className="font-semibold">{(Number(product.priceDiscount15) || 0).toFixed(2)} PLN</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rabat 20%:</span>
                    <span className="font-semibold">{(Number(product.priceDiscount20) || 0).toFixed(2)} PLN</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rabat 25%:</span>
                    <span className="font-semibold">{(Number(product.priceDiscount25) || 0).toFixed(2)} PLN</span>
                  </div>
                </div>
              </div>

              {/* Informacje o pozycji w zamówieniu */}
              <div className="border-t pt-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Szczegóły pozycji w zamówieniu</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Ilość</p>
                    <p className="text-lg font-semibold text-gray-900">{quantity} szt.</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Cena jednostkowa</p>
                    <p className="text-lg font-semibold text-gray-900">{unitPrice.toFixed(2)} PLN</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Wartość łącznie</p>
                    <p className="text-lg font-bold text-primary-600">{totalPrice.toFixed(2)} PLN</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {/* Przycisk zamknij */}
          <button
            onClick={onClose}
            className="btn btn-secondary w-full"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
