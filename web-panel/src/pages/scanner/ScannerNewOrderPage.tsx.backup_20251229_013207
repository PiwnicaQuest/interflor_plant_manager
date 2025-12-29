import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../../services/api';
import type { Product, Customer } from '../../types';
import { QuickCustomerModal } from '../../components/Scanner/QuickCustomerModal';

interface OrderItem {
  productId: number;
  product: Product;
  palletCount: number; // Ilość palet
  unitsPerPallet: number; // Sztuk na paletę (z produktu)
  unitPriceGross: number; // Cena za sztukę
}

export function ScannerNewOrderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'customer' | 'products' | 'summary'>('customer');

  // Customer selection
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);

  // Products
  const [items, setItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productLoading, setProductLoading] = useState(false);

  // Notes
  const [customerNotes, setCustomerNotes] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productInputRef = useRef<HTMLInputElement>(null);

  // Load customers on mount
  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setCustomerLoading(true);
    try {
      const result = await API.getCustomers();
      setCustomers(result.customers || []);
    } catch (err) {
      setError('Nie udalo sie pobrac klientow');
    } finally {
      setCustomerLoading(false);
    }
  };

  // Filter customers by search
  const filteredCustomers = customers.filter(c => {
    const search = customerSearch.toLowerCase();
    const companyName = (c.companyName || '').toLowerCase();
    const firstName = (c.firstName || '').toLowerCase();
    const lastName = (c.lastName || '').toLowerCase();
    const nip = String(c.nip || '');
    return companyName.includes(search) ||
           firstName.includes(search) ||
           lastName.includes(search) ||
           nip.includes(customerSearch);
  });

  // Product search with debounce
  useEffect(() => {
    if (productSearch.length < 2) {
      setProductResults([]);
      return;
    }

    const isBarcode = /^\d{8,}$/.test(productSearch);

    const timeoutId = setTimeout(async () => {
      setProductLoading(true);
      try {
        if (isBarcode) {
          const result = await API.scanBarcode(productSearch);
          if (result.product) {
            addProduct(result.product);
            setProductSearch('');
          }
          setProductResults([]);
        } else {
          const result = await API.getInventory({ search: productSearch, isArchived: false });
          setProductResults(result.products || []);
        }
      } catch (err) {
        if (isBarcode) {
          setError('Produkt nie znaleziony');
        }
        setProductResults([]);
      } finally {
        setProductLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [productSearch]);

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setStep('products');
    setTimeout(() => productInputRef.current?.focus(), 100);
  };

  const handleNewCustomerCreated = (customer: Customer) => {
    // Add new customer to the list
    setCustomers(prev => [customer, ...prev]);
    // Select the new customer and move to products step
    setShowNewCustomerModal(false);
    selectCustomer(customer);
  };

  const addProduct = (product: Product) => {
    const existing = items.find(item => item.productId === product.id);
    if (existing) {
      setItems(items.map(item =>
        item.productId === product.id
          ? { ...item, palletCount: item.palletCount + 1 }
          : item
      ));
    } else {
      setItems([...items, {
        productId: product.id,
        product,
        palletCount: 1,
        unitsPerPallet: product.unitsPerPallet || 1,
        unitPriceGross: product.basePriceGross || 0,
      }]);
    }
    setProductResults([]);
    setProductSearch('');
    productInputRef.current?.focus();
  };

  const updatePalletCount = (productId: number, delta: number) => {
    setItems(items.map(item => {
      if (item.productId === productId) {
        const newCount = Math.max(1, item.palletCount + delta);
        return { ...item, palletCount: newCount };
      }
      return item;
    }));
  };

  const removeItem = (productId: number) => {
    setItems(items.filter(item => item.productId !== productId));
  };

  // Oblicz cenę za paletę
  const getPalletPrice = (item: OrderItem) => {
    return item.unitPriceGross * item.unitsPerPallet;
  };

  // Oblicz sumę dla pozycji
  const getItemTotal = (item: OrderItem) => {
    return getPalletPrice(item) * item.palletCount;
  };

  // Oblicz całkowitą sumę zamówienia
  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + getItemTotal(item), 0);
  };

  // Oblicz całkowitą liczbę sztuk
  const getTotalUnits = () => {
    return items.reduce((sum, item) => sum + (item.palletCount * item.unitsPerPallet), 0);
  };

  const handleSubmit = async () => {
    if (!selectedCustomer || items.length === 0) {
      setError('Wybierz klienta i dodaj produkty');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const orderData = {
        customerId: selectedCustomer.id,
        items: items.map(item => ({
          productId: item.productId,
          quantity: item.palletCount * item.unitsPerPallet, // Przekazujemy łączną liczbę sztuk
          unitPriceGross: item.unitPriceGross,
        })),
        customerNotes: customerNotes || undefined,
      };

      const result = await API.createOrder(orderData);
      navigate(`/scanner/orders/${result.orderId}`, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nie udalo sie utworzyc zamowienia');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          {['Klient', 'Produkty', 'Podsumowanie'].map((label, idx) => {
            const stepNames = ['customer', 'products', 'summary'] as const;
            const isActive = step === stepNames[idx];
            const isPast = stepNames.indexOf(step) > idx;

            return (
              <div key={label} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isActive ? 'bg-green-600 text-white' :
                  isPast ? 'bg-green-100 text-green-600' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isPast ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : idx + 1}
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  isActive ? 'text-green-600' :
                  isPast ? 'text-green-600' :
                  'text-gray-400'
                }`}>
                  {label}
                </span>
                {idx < 2 && (
                  <div className={`mx-3 w-8 h-0.5 ${isPast ? 'bg-green-600' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 font-bold">×</button>
        </div>
      )}

      {/* Step: Customer Selection */}
      {step === 'customer' && (
        <div className="flex-1 overflow-auto p-4">
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Szukaj klienta..."
              className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
              autoFocus
            />
            <button
              onClick={() => setShowNewCustomerModal(true)}
              className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors whitespace-nowrap"
            >
              + Nowy
            </button>
          </div>

          {customerLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {customerSearch ? 'Brak wynikow' : 'Brak klientow w bazie'}
              <button
                onClick={() => setShowNewCustomerModal(true)}
                className="block mx-auto mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
              >
                + Dodaj nowego kontrahenta
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => selectCustomer(customer)}
                  className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-left active:bg-gray-50 transition-colors"
                >
                  <div className="font-semibold text-gray-900">{customer.companyName}</div>
                  {customer.firstName && (
                    <div className="text-sm text-gray-500 mt-1">{customer.firstName}</div>
                  )}
                  {customer.nip && (
                    <div className="text-xs text-gray-400 mt-1">NIP: {customer.nip}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Products */}
      {step === 'products' && (
        <div className="flex-1 overflow-auto flex flex-col">
          {/* Selected Customer */}
          <div className="bg-green-50 px-4 py-3 border-b border-green-100">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-green-600">Klient:</div>
                <div className="font-semibold text-green-800">{selectedCustomer?.companyName}</div>
              </div>
              <button
                onClick={() => setStep('customer')}
                className="text-green-600 text-sm font-medium"
              >
                Zmien
              </button>
            </div>
          </div>

          {/* Product Search */}
          <div className="p-4 bg-white border-b border-gray-200">
            <div className="relative">
              <input
                ref={productInputRef}
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Skanuj lub wpisz nazwe produktu..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 pr-12"
                autoComplete="off"
              />
              {productLoading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
                </div>
              )}
            </div>

            {/* Search Results */}
            {productResults.length > 0 && (
              <div className="mt-2 max-h-48 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                {productResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addProduct(product)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  >
                    <div className="font-medium">{product.plantName}</div>
                    <div className="text-sm text-gray-500 flex justify-between">
                      <span>{product.potSize} | {product.palletCount} pal. × {product.unitsPerPallet} szt.</span>
                      <span className="font-semibold text-green-600">
                        {((product.basePriceGross || 0) * (product.unitsPerPallet || 1)).toFixed(2)} PLN/pal.
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items List */}
          <div className="flex-1 overflow-auto p-4">
            {items.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-3">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <p>Dodaj produkty do zamowienia</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={item.productId} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{item.product.plantName}</div>
                        <div className="text-sm text-gray-500">
                          {getPalletPrice(item).toFixed(2)} PLN/paleta ({item.unitsPerPallet} szt.)
                        </div>
                      </div>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="ml-2 p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updatePalletCount(item.productId, -1)}
                          className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                        </button>
                        <div className="text-center">
                          <span className="text-xl font-bold">{item.palletCount}</span>
                          <span className="text-sm text-gray-500 ml-1">pal.</span>
                        </div>
                        <button
                          onClick={() => updatePalletCount(item.productId, 1)}
                          className="w-10 h-10 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg flex items-center justify-center"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">
                          {getItemTotal(item).toFixed(2)} PLN
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.palletCount * item.unitsPerPallet} szt.
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Summary */}
          {items.length > 0 && (
            <div className="bg-white border-t border-gray-200 p-4 safe-area-bottom">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="text-gray-600">Razem ({items.length} poz.):</span>
                  <div className="text-sm text-gray-500">{getTotalUnits()} szt.</div>
                </div>
                <span className="text-2xl font-bold text-green-600">{calculateTotal().toFixed(2)} PLN</span>
              </div>
              <button
                onClick={() => setStep('summary')}
                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors"
              >
                Dalej
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step: Summary */}
      {step === 'summary' && (
        <div className="flex-1 overflow-auto p-4">
          {/* Customer */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm text-gray-500">Klient</div>
                <div className="font-bold text-gray-900">{selectedCustomer?.companyName}</div>
                {selectedCustomer?.firstName && (
                  <div className="text-sm text-gray-600">{selectedCustomer.firstName}</div>
                )}
              </div>
              <button
                onClick={() => setStep('customer')}
                className="text-green-600 text-sm font-medium"
              >
                Zmien
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <span className="font-semibold text-gray-700">Produkty ({items.length})</span>
              <button
                onClick={() => setStep('products')}
                className="text-green-600 text-sm font-medium"
              >
                Edytuj
              </button>
            </div>
            <div className="divide-y divide-gray-100 max-h-60 overflow-auto">
              {items.map((item) => (
                <div key={item.productId} className="px-4 py-3 flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.product.plantName}</div>
                    <div className="text-sm text-gray-500">
                      {item.palletCount} pal. × {item.unitsPerPallet} szt. = {item.palletCount * item.unitsPerPallet} szt.
                    </div>
                    <div className="text-xs text-gray-400">
                      {getPalletPrice(item).toFixed(2)} PLN/paleta
                    </div>
                  </div>
                  <div className="font-bold text-green-600 ml-3">
                    {getItemTotal(item).toFixed(2)} PLN
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 bg-green-50 border-t border-green-100">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-semibold text-green-800">Razem brutto</span>
                  <div className="text-sm text-green-600">{getTotalUnits()} szt.</div>
                </div>
                <span className="text-xl font-bold text-green-600">{calculateTotal().toFixed(2)} PLN</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Uwagi do zamowienia (opcjonalne)
            </label>
            <textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="Dodatkowe informacje..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-xl transition-colors flex items-center justify-center"
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Tworzenie...
              </>
            ) : (
              'Utworz zamowienie'
            )}
          </button>

          {/* Back Button */}
          <button
            onClick={() => setStep('products')}
            className="w-full mt-3 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
          >
            Wstecz
          </button>
        </div>
      )}

      {/* New Customer Modal */}
      {showNewCustomerModal && (
        <QuickCustomerModal
          onClose={() => setShowNewCustomerModal(false)}
          onCustomerCreated={handleNewCustomerCreated}
        />
      )}
    </div>
  );
}
