import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

export function CartPage() {
  const { items, updatePalletCount, removeItem, clearCart, totalPrice, totalPallets } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  const [customerNotes, setCustomerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN'
    }).format(price);
  };

  const getUnitsPerPallet = (product: any) => product.unitsPerPallet || 1;
  const getPalletCount = (item: any) => Math.floor(item.quantity / getUnitsPerPallet(item.product));
  const getMaxPallets = (product: any) => product.palletCount || Math.floor(product.availableUnits / getUnitsPerPallet(product));

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/cart' } });
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const orderItems = items.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
      }));

      const result = await api.checkout(orderItems, customerNotes || undefined);
      
      clearCart();
      navigate('/orders', { 
        state: { 
          success: true, 
          orderNumber: result.orderNumber,
          totalAmount: result.totalAmount 
        } 
      });
    } catch (err: any) {
      setError(err.message || 'Błąd składania zamówienia');
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">🛒</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Koszyk jest pusty</h2>
        <p className="text-gray-600 mb-6">Dodaj produkty do koszyka, aby złożyć zamówienie</p>
        <Link to="/" className="btn btn-primary">
          Przejdź do katalogu
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Koszyk</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => {
            const palletCount = getPalletCount(item);
            const unitsPerPallet = getUnitsPerPallet(item.product);
            const maxPallets = getMaxPallets(item.product);
            
            return (
              <div key={item.product.id} className="card p-4 flex gap-4">
                {/* Image */}
                <div className="w-24 h-24 bg-gray-100 rounded-lg flex-shrink-0">
                  {item.product.imageUrl ? (
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.plantName}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">
                      🌿
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{item.product.plantName}</h3>
                  <p className="text-sm text-gray-500">
                    {item.product.potSize && `${item.product.potSize} • `}
                    {formatPrice(item.product.price)} / szt.
                  </p>
                  <p className="text-sm text-gray-500">
                    1 paleta = {unitsPerPallet} szt.
                  </p>
                  <p className="text-sm text-gray-400">
                    Dostępne palety: {maxPallets}
                  </p>
                </div>

                {/* Pallet Quantity */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">Palety</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updatePalletCount(item.product.id, palletCount - 1)}
                      className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={maxPallets}
                      value={palletCount}
                      onChange={(e) => updatePalletCount(item.product.id, parseInt(e.target.value) || 1)}
                      className="w-16 text-center border rounded-lg py-1"
                    />
                    <button
                      onClick={() => updatePalletCount(item.product.id, palletCount + 1)}
                      disabled={palletCount >= maxPallets}
                      className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-xs text-gray-500">({item.quantity} szt.)</span>
                </div>

                {/* Price & Remove */}
                <div className="flex flex-col items-end justify-between">
                  <span className="font-bold text-green-600">
                    {formatPrice(item.product.price * item.quantity)}
                  </span>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Usuń
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="card p-6 sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Podsumowanie</h2>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Palety</span>
                <span>{totalPallets} szt.</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Rośliny</span>
                <span>{items.reduce((sum, i) => sum + i.quantity, 0)} szt.</span>
              </div>
            </div>

            <div className="border-t pt-4 mb-6">
              <div className="flex justify-between text-xl font-bold">
                <span>Razem</span>
                <span className="text-green-600">{formatPrice(totalPrice)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Uwagi do zamówienia (opcjonalne)
              </label>
              <textarea
                className="input h-24 resize-none"
                placeholder="Np. preferowany termin dostawy..."
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {!isAuthenticated && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  Musisz być zalogowany, aby złożyć zamówienie
                </p>
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={submitting}
              className="btn btn-primary w-full py-3 text-lg"
            >
              {submitting ? 'Składanie zamówienia...' : (
                isAuthenticated ? 'Złóż zamówienie' : 'Zaloguj się i zamów'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
