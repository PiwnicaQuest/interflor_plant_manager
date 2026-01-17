import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, removeItem, updatePalletCount, totalPallets, totalPrice, isLoading } = useCart();

  const getUnitsPerPallet = (product: any) => product.unitsPerPallet || 1;
  const getPalletCount = (item: any) => Math.floor(item.quantity / getUnitsPerPallet(item.product));

  return (
    <Fragment>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-green-50">
          <h2 className="text-lg font-semibold text-gray-900">
            Koszyk
            {items.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({items.length} {items.length === 1 ? 'produkt' : items.length < 5 ? 'produkty' : 'produktów'})
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Zamknij koszyk"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col h-[calc(100%-180px)] overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
              <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-center">Twój koszyk jest pusty</p>
              <button
                onClick={onClose}
                className="mt-4 text-green-600 hover:text-green-700 font-medium"
              >
                Przeglądaj katalog
              </button>
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {items.map((item) => {
                const palletCount = getPalletCount(item);
                const itemTotal = item.product.price * item.quantity;

                return (
                  <li key={item.product.id} className="p-4 hover:bg-gray-50">
                    <div className="flex gap-3">
                      {/* Product Image */}
                      <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                        {item.product.imageUrl ? (
                          <img
                            src={item.product.imageUrl}
                            alt={item.product.plantName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {item.product.plantName}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.product.potSize && `${item.product.potSize}`}
                          {item.product.plantHeightCm && ` • ${item.product.plantHeightCm} cm`}
                        </p>

                        {/* Quantity Controls */}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updatePalletCount(item.product.id, palletCount - 1)}
                              className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                              </svg>
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{palletCount}</span>
                            <button
                              onClick={() => updatePalletCount(item.product.id, palletCount + 1)}
                              className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                            <span className="text-xs text-gray-400 ml-1">palet</span>
                          </div>

                          <button
                            onClick={() => removeItem(item.product.id)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            aria-label="Usuń produkt"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>

                        {/* Price */}
                        <p className="text-sm font-semibold text-green-700 mt-1">
                          {itemTotal.toFixed(2)} zł
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer Summary */}
        {items.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Liczba palet:</span>
              <span className="font-medium">{totalPallets}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 mb-4">
              <span>Suma:</span>
              <span className="text-green-700">{totalPrice.toFixed(2)} zł</span>
            </div>

            <div className="space-y-2">
              <Link
                to="/cart"
                onClick={onClose}
                className="block w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white text-center font-medium rounded-lg transition-colors"
              >
                Przejdź do koszyka
              </Link>
              <button
                onClick={onClose}
                className="block w-full py-2 px-4 text-gray-600 hover:text-gray-800 text-center font-medium transition-colors"
              >
                Kontynuuj zakupy
              </button>
            </div>
          </div>
        )}
      </div>
    </Fragment>
  );
}
