import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API } from '../../services/api';
import type { Product, Customer } from '../../types';
import { QuickCustomerModal } from '../../components/Scanner/QuickCustomerModal';

// Placeholder dla brakujących zdjęć
const PlaceholderImage = ({ className }: { className?: string }) => (
  <div className={`bg-gray-100 flex items-center justify-center ${className}`}>
    <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  </div>
);

type QuantityMode = 'pallets' | 'units';

interface OrderItem {
  productId: number;
  product: Product;
  quantityMode: QuantityMode;
  inputValue: number;
  unitsPerPallet: number;
  unitPriceGross: number;
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

  const filteredCustomers = customers.filter(c => {
    const search = customerSearch.toLowerCase();
    const companyName = (c.companyName || '').toLowerCase();
    const firstName = (c.firstName || '').toLowerCase();
    const lastName = (c.lastName || '').toLowerCase();
    const nip = String(c.nip || '');
    const customerCode = (c.customerCode || '').toLowerCase();
    return companyName.includes(search) ||
           firstName.includes(search) ||
           lastName.includes(search) ||
           nip.includes(customerSearch) ||
           customerCode.includes(search);
  });

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
    setCustomers(prev => [customer, ...prev]);
    setShowNewCustomerModal(false);
    selectCustomer(customer);
  };

  const addProduct = (product: Product) => {
    if ((product.totalUnits ?? 0) <= 0) {
      setError(`Produkt "${product.plantName}" jest niedostępny (stan: 0)`);
      return;
    }

    const existing = items.find(item => item.productId === product.id);
    if (existing) {
      setItems(items.map(item =>
        item.productId === product.id
          ? { ...item, inputValue: item.inputValue + 1 }
          : item
      ));
    } else {
      setItems([...items, {
        productId: product.id,
        product,
        quantityMode: 'pallets',
        inputValue: 1,
        unitsPerPallet: product.unitsPerPallet || 1,
        unitPriceGross: product.basePriceGross || 0,
      }]);
    }
    setProductResults([]);
    setProductSearch('');
    productInputRef.current?.focus();
  };

  const toggleQuantityMode = (productId: number) => {
    setItems(items.map(item => {
      if (item.productId === productId) {
        if (item.quantityMode === 'pallets') {
          return {
            ...item,
            quantityMode: 'units',
            inputValue: item.inputValue * item.unitsPerPallet,
          };
        } else {
          const pallets = Math.max(1, Math.round(item.inputValue / item.unitsPerPallet));
          return {
            ...item,
            quantityMode: 'pallets',
            inputValue: pallets,
          };
        }
      }
      return item;
    }));
  };

  const updateInputValue = (productId: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setItems(items.map(item => {
      if (item.productId === productId) {
        return { ...item, inputValue: Math.max(0, numValue) };
      }
      return item;
    }));
  };

  const updateQuantity = (productId: number, delta: number) => {
    setItems(items.map(item => {
      if (item.productId === productId) {
        const newValue = Math.max(1, item.inputValue + delta);
        return { ...item, inputValue: newValue };
      }
      return item;
    }));
  };

  const removeItem = (productId: number) => {
    setItems(items.filter(item => item.productId !== productId));
  };

  const getItemUnits = (item: OrderItem) => {
    if (item.quantityMode === 'pallets') {
      return item.inputValue * item.unitsPerPallet;
    }
    return item.inputValue;
  };

  const getItemPallets = (item: OrderItem) => {
    if (item.quantityMode === 'pallets') {
      return item.inputValue;
    }
    return item.inputValue / item.unitsPerPallet;
  };

  const getPalletPrice = (item: OrderItem) => {
    return item.unitPriceGross * item.unitsPerPallet;
  };

  const getItemTotal = (item: OrderItem) => {
    return item.unitPriceGross * getItemUnits(item);
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + getItemTotal(item), 0);
  };

  const getTotalUnits = () => {
    return items.reduce((sum, item) => sum + getItemUnits(item), 0);
  };

  const handleSubmit = async () => {
    if (!selectedCustomer || items.length === 0) {
      setError('Wybierz klienta i dodaj produkty');
      return;
    }

    const invalidItems = items.filter(item => getItemUnits(item) <= 0);
    if (invalidItems.length > 0) {
      setError('Wszystkie produkty muszą miec ilosc wieksza niz 0');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const orderData = {
        customerId: selectedCustomer.id,
        items: items.map(item => ({
          productId: item.productId,
          quantity: getItemUnits(item),
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
      {/* Progress Steps - COMPACT */}
      <div className="bg-white border-b border-gray-200 px-3 py-2">
        <div className="flex items-center justify-between">
          {['Klient', 'Produkty', 'Podsumowanie'].map((label, idx) => {
            const stepNames = ['customer', 'products', 'summary'] as const;
            const isActive = step === stepNames[idx];
            const isPast = stepNames.indexOf(step) > idx;

            return (
              <div key={label} className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive ? 'bg-green-600 text-white' :
                  isPast ? 'bg-green-100 text-green-600' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isPast ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : idx + 1}
                </div>
                <span className={`ml-1.5 text-xs font-medium ${
                  isActive ? 'text-green-600' :
                  isPast ? 'text-green-600' :
                  'text-gray-400'
                }`}>
                  {label}
                </span>
                {idx < 2 && (
                  <div className={`mx-2 w-6 h-0.5 ${isPast ? 'bg-green-600' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error - COMPACT */}
      {error && (
        <div className="mx-3 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 font-bold">×</button>
        </div>
      )}

      {/* Step: Customer Selection - COMPACT */}
      {step === 'customer' && (
        <div className="flex-1 overflow-auto p-3">
          <div className="mb-3 flex gap-2">
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Szukaj klienta..."
              className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              autoFocus
            />
            <button
              onClick={() => setShowNewCustomerModal(true)}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              + Nowy
            </button>
          </div>

          {customerLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              {customerSearch ? 'Brak wynikow' : 'Brak klientow w bazie'}
              <button
                onClick={() => setShowNewCustomerModal(true)}
                className="block mx-auto mt-3 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                + Dodaj kontrahenta
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => selectCustomer(customer)}
                  className="w-full bg-white rounded-lg p-3 shadow-sm border border-gray-100 text-left active:bg-gray-50 transition-colors"
                >
                  <div className="font-semibold text-gray-900 text-sm">{customer.companyName}</div>
                  {customer.firstName && (
                    <div className="text-xs text-gray-500 mt-0.5">{customer.firstName}</div>
                  )}
                  {customer.nip && (
                    <div className="text-xs text-gray-400 mt-0.5">NIP: {customer.nip}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Products - COMPACT */}
      {step === 'products' && (
        <div className="flex-1 overflow-auto flex flex-col">
          {/* Selected Customer - COMPACT */}
          <div className="bg-green-50 px-3 py-2 border-b border-green-100">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-green-600">Klient:</div>
                <div className="font-semibold text-green-800 text-sm">{selectedCustomer?.companyName}</div>
              </div>
              <button
                onClick={() => setStep('customer')}
                className="text-green-600 text-xs font-medium"
              >
                Zmien
              </button>
            </div>
          </div>

          {/* Product Search - COMPACT */}
          <div className="p-3 bg-white border-b border-gray-200">
            <div className="relative">
              <input
                ref={productInputRef}
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Skanuj lub wpisz nazwe..."
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 pr-10"
                autoComplete="off"
              />
              {productLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600" />
                </div>
              )}
            </div>

            {/* Search Results - COMPACT */}
            {productResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                {productResults.map((product) => {
                  const isOutOfStock = (product.totalUnits ?? 0) <= 0;
                  return (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className={`w-full px-3 py-2 text-left border-b border-gray-100 last:border-0 ${
                        isOutOfStock ? 'bg-gray-50 hover:bg-gray-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* Thumbnail */}
                        <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-100">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : null}
                          <PlaceholderImage className={`w-full h-full ${product.imageUrl ? 'hidden' : ''}`} />
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className={`font-medium text-sm truncate ${isOutOfStock ? 'text-gray-500' : ''}`}>
                              {product.plantName}
                            </div>
                            <span className={`ml-2 flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${
                              isOutOfStock
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {isOutOfStock ? 'Brak' : `${product.totalUnits} szt.`}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 flex justify-between mt-0.5">
                            <span>{product.potSize} | {product.palletCount} pal. × {product.unitsPerPallet} szt.</span>
                            {!isOutOfStock && (
                              <span className="font-semibold text-green-600">
                                {((product.basePriceGross || 0) * (product.unitsPerPallet || 1)).toFixed(2)} PLN/pal.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Items List - COMPACT */}
          <div className="flex-1 overflow-auto p-3">
            {items.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-2">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <p className="text-sm">Dodaj produkty do zamowienia</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.productId} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                    <div className="flex gap-2 mb-1.5">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-gray-100">
                        {item.product.imageUrl ? (
                          <img
                            src={item.product.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : null}
                        <PlaceholderImage className={`w-full h-full ${item.product.imageUrl ? 'hidden' : ''}`} />
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0 flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 text-sm truncate">{item.product.plantName}</div>
                          <div className="text-xs text-gray-500">
                            {item.unitPriceGross.toFixed(2)} PLN/szt. ({item.unitsPerPallet} szt./paleta)
                          </div>
                        </div>
                        <button
                          onClick={() => removeItem(item.productId)}
                          className="ml-2 p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Quantity Mode Toggle - COMPACT */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs text-gray-500">Tryb:</span>
                      <div className="flex rounded overflow-hidden border border-gray-300">
                        <button
                          onClick={() => item.quantityMode !== 'pallets' && toggleQuantityMode(item.productId)}
                          className={`px-2 py-1 text-xs font-medium transition-colors ${
                            item.quantityMode === 'pallets'
                              ? 'bg-green-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Paletki
                        </button>
                        <button
                          onClick={() => item.quantityMode !== 'units' && toggleQuantityMode(item.productId)}
                          className={`px-2 py-1 text-xs font-medium transition-colors ${
                            item.quantityMode === 'units'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          Sztuki
                        </button>
                      </div>
                    </div>

                    {/* Quantity Input - COMPACT */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQuantity(item.productId, -1)}
                          className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                        </button>
                        <div className="flex items-center">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={item.inputValue}
                            onChange={(e) => updateInputValue(item.productId, e.target.value)}
                            className="w-16 h-8 text-center text-base font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                          <span className={`ml-1.5 text-xs font-medium ${
                            item.quantityMode === 'pallets' ? 'text-green-600' : 'text-blue-600'
                          }`}>
                            {item.quantityMode === 'pallets' ? 'pal.' : 'szt.'}
                          </span>
                        </div>
                        <button
                          onClick={() => updateQuantity(item.productId, 1)}
                          className="w-8 h-8 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg flex items-center justify-center"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-green-600">
                          {getItemTotal(item).toFixed(2)} PLN
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.quantityMode === 'pallets'
                            ? `= ${getItemUnits(item)} szt.`
                            : `= ${getItemPallets(item).toFixed(2)} pal.`
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Summary - COMPACT */}
          {items.length > 0 && (
            <div className="bg-white border-t border-gray-200 p-3 safe-area-bottom">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="text-gray-600 text-sm">Razem ({items.length} poz.):</span>
                  <div className="text-xs text-gray-500">{getTotalUnits()} szt.</div>
                </div>
                <span className="text-xl font-bold text-green-600">{calculateTotal().toFixed(2)} PLN</span>
              </div>
              <button
                onClick={() => setStep('summary')}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
              >
                Dalej
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step: Summary - COMPACT */}
      {step === 'summary' && (
        <div className="flex-1 overflow-auto p-3">
          {/* Customer - COMPACT */}
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 mb-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-gray-500">Klient</div>
                <div className="font-bold text-gray-900 text-sm">{selectedCustomer?.companyName}</div>
                {selectedCustomer?.firstName && (
                  <div className="text-xs text-gray-600">{selectedCustomer.firstName}</div>
                )}
              </div>
              <button
                onClick={() => setStep('customer')}
                className="text-green-600 text-xs font-medium"
              >
                Zmien
              </button>
            </div>
          </div>

          {/* Items - COMPACT */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 mb-3 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <span className="font-semibold text-gray-700 text-sm">Produkty ({items.length})</span>
              <button
                onClick={() => setStep('products')}
                className="text-green-600 text-xs font-medium"
              >
                Edytuj
              </button>
            </div>
            <div className="divide-y divide-gray-100 max-h-48 overflow-auto">
              {items.map((item) => (
                <div key={item.productId} className="px-3 py-2 flex justify-between items-center">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.product.plantName}</div>
                    <div className="text-xs text-gray-500">
                      {item.quantityMode === 'pallets'
                        ? `${item.inputValue} pal. × ${item.unitsPerPallet} szt. = ${getItemUnits(item)} szt.`
                        : `${item.inputValue} szt. (${getItemPallets(item).toFixed(2)} pal.)`
                      }
                    </div>
                    <div className="text-xs text-gray-400">
                      {item.unitPriceGross.toFixed(2)} PLN/szt.
                    </div>
                  </div>
                  <div className="font-bold text-green-600 text-sm ml-2">
                    {getItemTotal(item).toFixed(2)} PLN
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 bg-green-50 border-t border-green-100">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-semibold text-green-800 text-sm">Razem brutto</span>
                  <div className="text-xs text-green-600">{getTotalUnits()} szt.</div>
                </div>
                <span className="text-lg font-bold text-green-600">{calculateTotal().toFixed(2)} PLN</span>
              </div>
            </div>
          </div>

          {/* Notes - COMPACT */}
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Uwagi do zamowienia (opcjonalne)
            </label>
            <textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="Dodatkowe informacje..."
              rows={2}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>

          {/* Submit Button - COMPACT */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Tworzenie...
              </>
            ) : (
              'Utworz zamowienie'
            )}
          </button>

          {/* Back Button - COMPACT */}
          <button
            onClick={() => setStep('products')}
            className="w-full mt-2 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
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
