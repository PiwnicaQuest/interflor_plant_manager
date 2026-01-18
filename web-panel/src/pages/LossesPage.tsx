import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { Loss, Product } from '../types';

export function LossesPage() {
  const [losses, setLosses] = useState<Loss[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [totalQuantity, setTotalQuantity] = useState(0);
  const [stats, setStats] = useState<any>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showReversed, setShowReversed] = useState(false);

  // Scanner
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeBuffer, setBarcodeBuffer] = useState('');

  // Load losses
  const fetchLosses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getLosses({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        showReversed,
      });
      setLosses(data.losses);
      setTotalValue(data.totalValue);
      setTotalQuantity(data.totalQuantity);

      // Load stats
      const statsData = await api.getLossStats({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching losses:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, showReversed]);

  useEffect(() => {
    fetchLosses();
  }, [fetchLosses]);

  // Search products
  const searchProducts = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setSearchLoading(true);
      const data = await api.getInventory({ search: term });
      setSearchResults(data.products || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm) {
        searchProducts(searchTerm);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchProducts]);

  // Handle barcode scan
  const handleBarcodeInput = useCallback(async (barcode: string) => {
    if (barcode.length < 5) return;
    
    try {
      const data = await api.scanBarcode(barcode);
      if (data.product) {
        setSelectedProduct(data.product);
        setSearchTerm('');
        setSearchResults([]);
        setFormError('');
      } else {
        setFormError('Nie znaleziono produktu o kodzie: ' + barcode);
      }
    } catch (error) {
      setFormError('Nie znaleziono produktu o kodzie: ' + barcode);
    }
    setBarcodeBuffer('');
  }, []);

  // Barcode scanner listener
  useEffect(() => {
    let buffer = '';
    let timeout: NodeJS.Timeout;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in other inputs
      if (document.activeElement?.tagName === 'INPUT' && 
          document.activeElement !== barcodeInputRef.current) {
        return;
      }

      if (e.key === 'Enter') {
        if (buffer.length >= 5) {
          handleBarcodeInput(buffer);
        }
        buffer = '';
        return;
      }

      // Only accept alphanumeric
      if (/^[a-zA-Z0-9]$/.test(e.key)) {
        buffer += e.key;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          buffer = '';
        }, 100);
      }
    };

    if (showForm) {
      window.addEventListener('keypress', handleKeyPress);
    }

    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      clearTimeout(timeout);
    };
  }, [showForm, handleBarcodeInput]);

  // Submit loss
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setFormError('Wybierz produkt');
      return;
    }
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) {
      setFormError('Podaj prawidlowa ilosc');
      return;
    }

    try {
      setSubmitting(true);
      await api.createLoss({
        productId: selectedProduct.id,
        quantity: qty,
        notes: notes || undefined,
      });
      
      // Reset form
      setSelectedProduct(null);
      setQuantity('');
      setNotes('');
      setSearchTerm('');
      setShowForm(false);
      setFormError('');
      
      // Refresh list
      fetchLosses();
    } catch (error: any) {
      setFormError(error.response?.data?.error || 'Błąd podczas rejestrowania straty');
    } finally {
      setSubmitting(false);
    }
  };

  // Reverse loss
  const handleReverse = async (lossId: number) => {
    if (!confirm('Czy na pewno chcesz cofnąć te strate? Stan magazynowy zostanie przywrocony.')) {
      return;
    }
    try {
      await api.reverseLoss(lossId);
      fetchLosses();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Błąd podczas cofania straty');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return (num || 0).toFixed(2);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Straty magazynowe</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rejestruj i sledz straty produktów
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary"
        >
          + Zarejestruj strate
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Laczna wartosc strat</div>
          <div className="text-2xl font-bold text-red-600">{formatPrice(totalValue)} PLN</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Laczna ilosc</div>
          <div className="text-2xl font-bold text-gray-900">{totalQuantity} szt.</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Liczba strat</div>
          <div className="text-2xl font-bold text-gray-900">{losses.filter(l => !l.isReversed).length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Od daty</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Do daty</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showReversed"
              checked={showReversed}
              onChange={(e) => setShowReversed(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="showReversed" className="text-sm text-gray-700">
              Pokaz cofniete
            </label>
          </div>
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setShowReversed(false);
            }}
            className="btn btn-secondary"
          >
            Wyczysc filtry
          </button>
        </div>
      </div>

      {/* Losses Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produkt</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ilosc</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Wartosc</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notatki</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Akcje</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Ładowanie...
                  </td>
                </tr>
              ) : losses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Brak zarejestrowanych strat
                  </td>
                </tr>
              ) : (
                losses.map((loss) => (
                  <tr key={loss.id} className={loss.isReversed ? 'bg-gray-100 opacity-60' : ''}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDate(loss.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{loss.plantName}</div>
                      <div className="text-xs text-gray-500">{loss.potSize} | {loss.barcode}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {loss.quantity} szt.
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
                      {formatPrice(loss.totalValue)} PLN
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {loss.notes || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {loss.isReversed ? (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Cofnieta
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          Aktywna
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!loss.isReversed && (
                        <button
                          onClick={() => handleReverse(loss.id)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Cofnij
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Loss Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Zarejestruj strate</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {formError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {formError}
                </div>
              )}

              {/* Barcode input (hidden but focusable for scanner) */}
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Zeskanuj kod kreskowy..."
                className="input mb-4 bg-gray-50"
                value={barcodeBuffer}
                onChange={(e) => setBarcodeBuffer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcodeInput(barcodeBuffer);
                  }
                }}
              />

              {/* Product search */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wyszukaj produkt
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Wpisz nazwe produktu..."
                  className="input"
                  disabled={!!selectedProduct}
                />
                {searchLoading && <p className="text-sm text-gray-500 mt-1">Szukanie...</p>}
                {searchResults.length > 0 && !selectedProduct && (
                  <div className="mt-2 border rounded-md max-h-48 overflow-y-auto">
                    {searchResults.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => {
                          setSelectedProduct(product);
                          setSearchTerm('');
                          setSearchResults([]);
                        }}
                        className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                      >
                        <div className="font-medium">{product.plantName}</div>
                        <div className="text-xs text-gray-500">
                          {product.potSize} | Stan: {product.totalUnits || 0} szt.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected product */}
              {selectedProduct && (
                <div className="mb-4 p-3 bg-blue-50 rounded-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{selectedProduct.plantName}</div>
                      <div className="text-sm text-gray-600">
                        {selectedProduct.potSize} | Kod: {selectedProduct.barcode}
                      </div>
                      <div className="text-sm text-gray-600">
                        Stan: {selectedProduct.totalUnits || 0} szt.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Usun
                    </button>
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ilosc (sztuk)
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Podaj ilosc"
                  className="input"
                  required
                />
              </div>

              {/* Notes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notatki (opcjonalnie)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Dodatkowe informacje..."
                  className="input"
                  rows={3}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="btn btn-secondary flex-1"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedProduct}
                  className="btn btn-primary flex-1"
                >
                  {submitting ? 'Zapisywanie...' : 'Zarejestruj strate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
