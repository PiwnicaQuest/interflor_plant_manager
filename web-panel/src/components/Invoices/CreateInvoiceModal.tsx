import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Customer, Product } from '../../types';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface InvoiceItemRow {
  productId: number | null;
  product?: Product;
  description: string;
  quantity: number;
  unitPriceNet: number;
  vatRate: number;
  growerPassport?: string;
}

function CustomerSearch({
  customers,
  selectedCustomerId,
  onSelect,
}: {
  customers: Customer[];
  selectedCustomerId: number | null;
  onSelect: (customerId: number, customer: Customer) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredCustomers = searchTerm.trim() === ''
    ? customers
    : customers.filter(c => {
        const s = searchTerm.toLowerCase();
        const code = String(c.customerCode || '').toLowerCase();
        const company = (c.companyName || '').toLowerCase();
        const first = (c.firstName || '').toLowerCase();
        const last = (c.lastName || '').toLowerCase();
        const nip = String(c.nip || '').replace(/[^0-9]/g, '');
        const searchNip = searchTerm.replace(/[^0-9]/g, '');
        return code.includes(s) || company.includes(s) || first.includes(s) || last.includes(s) ||
               (first + ' ' + last).includes(s) || (searchNip.length >= 3 && nip.includes(searchNip));
      });

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const formatName = (c: Customer) => {
    const name = c.companyName || ((c.firstName || '') + ' ' + (c.lastName || '')).trim();
    return c.customerCode ? '[' + c.customerCode + '] ' + name : name;
  };

  useEffect(() => {
    if (selectedCustomer && !isOpen) setSearchTerm(formatName(selectedCustomer));
  }, [selectedCustomer, isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedCustomer) setSearchTerm(formatName(selectedCustomer));
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedCustomer]);

  return (
    <div className="relative">
      <input ref={inputRef} type="text" className="input w-full" placeholder="Wpisz nazwe firmy, kod, NIP..."
        value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }}
        onFocus={() => { setIsOpen(true); if (selectedCustomer) setSearchTerm(''); }} autoComplete="off" />
      {isOpen && filteredCustomers.length > 0 && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredCustomers.slice(0, 50).map((c) => (
            <div key={c.id} className={'px-3 py-2 cursor-pointer hover:bg-gray-50' + (selectedCustomerId === c.id ? ' bg-green-50' : '')}
              onClick={() => { onSelect(c.id, c); setSearchTerm(formatName(c)); setIsOpen(false); }}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{formatName(c)}</div>
                  <div className="text-xs text-gray-500">
                    {c.nip && <span className="mr-2">NIP: {c.nip}</span>}
                    {c.city && <span>{c.city}</span>}
                  </div>
                </div>
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{c.priceGroupName || 'Podstawowa'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductSearch({
  products,
  onSelect,
  usedProductIds,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
  usedProductIds: number[];
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const available = products.filter(p => p.totalUnits > 0 && !p.isArchived && !usedProductIds.includes(p.id));
  const filtered = searchTerm.trim() === '' ? available : available.filter(p =>
    p.plantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.potSize && String(p.potSize).toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.barcode && p.barcode.includes(searchTerm))
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative">
      <input ref={inputRef} type="text" className="input w-full text-sm" placeholder="Wyszukaj produkt..."
        value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)} autoComplete="off" />
      {isOpen && filtered.length > 0 && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 30).map((p) => (
            <div key={p.id} className="px-3 py-2 cursor-pointer hover:bg-gray-50 flex justify-between items-center"
              onClick={() => { onSelect(p); setSearchTerm(''); setIsOpen(false); }}>
              <div>
                <div className="font-medium text-sm">{p.plantName}</div>
                <div className="text-xs text-gray-500">{p.potSize || '-'} | {p.plantHeightCm || '-'} cm</div>
              </div>
              <div className="text-right">
                <div className={'text-xs font-semibold ' + (p.totalUnits < 10 ? 'text-orange-600' : 'text-green-600')}>
                  {p.totalUnits} szt.
                </div>
                <div className="text-xs text-gray-400">{p.basePriceGross?.toFixed(2)} zl</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const discountMap: Record<number, keyof Product> = {
  1: 'basePriceGross',
  2: 'priceDiscount10',
  3: 'priceDiscount12',
  4: 'priceDiscount15',
  5: 'priceDiscount20',
  6: 'priceDiscount25',
};

function getProductPrice(product: Product, customer?: Customer | null): number {
  if (!customer) return product.basePriceGross || 0;
  const field = discountMap[customer.priceGroupId] || 'basePriceGross';
  return (product[field] as number) || product.basePriceGross || 0;
}

function grossToNet(gross: number, vatRate: number): number {
  return Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
}

export function CreateInvoiceModal({ isOpen, onClose, onSuccess }: CreateInvoiceModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<InvoiceItemRow[]>([]);
  const [paymentDeadline, setPaymentDeadline] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Set default payment deadline to +14 days
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setPaymentDeadline(d.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [custData, prodData] = await Promise.all([api.getCustomers(), api.getInventory()]);
        setCustomers(custData.customers);
        setProducts(prodData.products);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Blad ladowania danych');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // Reset form
    setSelectedCustomerId(null);
    setSelectedCustomer(null);
    setItems([]);
    setError('');
    setShowPaymentModal(false);
  }, [isOpen]);

  const handleCustomerSelect = (id: number, customer: Customer) => {
    setSelectedCustomerId(id);
    setSelectedCustomer(customer);
    // Update prices for existing items based on customer price group
    if (items.length > 0) {
      setItems(items.map(item => {
        if (!item.product) return item;
        const grossPrice = getProductPrice(item.product, customer);
        const netPrice = grossToNet(grossPrice, item.vatRate);
        return { ...item, unitPriceNet: netPrice };
      }));
    }
  };

  const addProduct = (product: Product) => {
    const grossPrice = getProductPrice(product, selectedCustomer);
    const vatRate = product.vatRate || 8;
    const netPrice = grossToNet(grossPrice, vatRate);
    setItems([...items, {
      productId: product.id,
      product,
      description: product.plantName + (product.potSize ? ' ' + product.potSize : ''),
      quantity: 1,
      unitPriceNet: netPrice,
      vatRate,
      growerPassport: product.growerPassport || undefined,
    }]);
  };

  const updateItem = (index: number, updates: Partial<InvoiceItemRow>) => {
    setItems(items.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculations
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const subtotalNet = items.reduce((sum, item) => sum + round2(item.unitPriceNet * item.quantity), 0);
  const totalVat = items.reduce((sum, item) => sum + round2(round2(item.unitPriceNet * item.quantity) * (item.vatRate / 100)), 0);
  const totalGross = round2(subtotalNet + totalVat);

  const canSubmit = selectedCustomerId && items.length > 0 && items.every(i => i.quantity > 0 && i.unitPriceNet > 0);

  const handleSubmit = async (paymentMethod: string) => {
    if (!selectedCustomerId || items.length === 0) return;
    try {
      setSubmitting(true);
      setError('');
      const result = await api.createInvoice({
        customerId: selectedCustomerId,
        paymentMethod,
        paymentDeadline,
        items: items.map(i => ({
          productId: i.productId || undefined,
          description: i.description,
          quantity: i.quantity,
          unitPriceNet: i.unitPriceNet,
          unitPriceGross: round2(i.unitPriceNet * (1 + i.vatRate / 100)),
          vatRate: i.vatRate,
          growerPassport: i.growerPassport,
        })),
      });
      alert('Faktura ' + result.invoiceNumber + ' utworzona!');
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Blad tworzenia faktury';
      setError(msg);
      setShowPaymentModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const usedProductIds = items.filter(i => i.productId).map(i => i.productId as number);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">Nowa faktura</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[calc(100vh-200px)] overflow-y-auto">
          {loading ? (
            <div className="text-center py-10 text-gray-500">Ladowanie danych...</div>
          ) : (
            <>
              {/* Customer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kontrahent</label>
                <CustomerSearch customers={customers} selectedCustomerId={selectedCustomerId} onSelect={handleCustomerSelect} />
                {selectedCustomer && (
                  <div className="mt-1 text-xs text-gray-500">
                    {selectedCustomer.nip && <span className="mr-3">NIP: {selectedCustomer.nip}</span>}
                    {selectedCustomer.city && <span>{selectedCustomer.street}, {selectedCustomer.postalCode} {selectedCustomer.city}</span>}
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pozycje faktury</label>

                {items.map((item, index) => (
                  <div key={index} className="border rounded-lg p-3 mb-2 bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-sm text-gray-800">{item.description}</div>
                      <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600 text-lg leading-none ml-2">&times;</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Ilosc {item.product ? `(max ${item.product.totalUnits})` : ''}</label>
                        <input type="number" className="input w-full text-sm" min="1"
                          max={item.product ? item.product.totalUnits : undefined}
                          value={item.quantity || ''} onChange={(e) => updateItem(index, { quantity: parseInt(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Cena netto</label>
                        <input type="number" className="input w-full text-sm" step="0.01" min="0"
                          value={item.unitPriceNet || ''} onChange={(e) => updateItem(index, { unitPriceNet: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">VAT %</label>
                        <select className="input w-full text-sm" value={item.vatRate}
                          onChange={(e) => updateItem(index, { vatRate: parseInt(e.target.value) })}>
                          <option value={8}>8%</option>
                          <option value={23}>23%</option>
                          <option value={0}>0%</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Brutto</label>
                        <div className="input w-full text-sm bg-gray-100 flex items-center">
                          {round2(item.unitPriceNet * (1 + item.vatRate / 100)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-right text-gray-500">
                      Wartosc: {round2(item.unitPriceNet * item.quantity).toFixed(2)} netto | {round2(item.unitPriceNet * item.quantity * (1 + item.vatRate / 100)).toFixed(2)} brutto
                    </div>
                  </div>
                ))}

                {/* Add product */}
                <div className="mt-2">
                  <ProductSearch products={products} onSelect={addProduct} usedProductIds={usedProductIds} />
                </div>
              </div>

              {/* Totals */}
              {items.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Netto:</span>
                    <span className="font-medium">{round2(subtotalNet).toFixed(2)} zl</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">VAT:</span>
                    <span className="font-medium">{round2(totalVat).toFixed(2)} zl</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-1">
                    <span>Brutto:</span>
                    <span className="text-primary-700">{totalGross.toFixed(2)} zl</span>
                  </div>
                </div>
              )}

              {/* Payment deadline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Termin platnosci</label>
                <input type="date" className="input w-full" value={paymentDeadline}
                  onChange={(e) => setPaymentDeadline(e.target.value)} />
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-between">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">Anuluj</button>
          <button onClick={() => setShowPaymentModal(true)} disabled={!canSubmit || submitting}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Tworzenie...' : 'Wystaw fakture'}
          </button>
        </div>
      </div>

      {/* Payment method modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Forma platnosci</h3>
            <div className="space-y-2">
              <button onClick={() => handleSubmit('cash')} disabled={submitting}
                className="w-full py-3 px-4 bg-green-50 border-2 border-green-200 rounded-lg text-green-800 font-medium hover:bg-green-100 disabled:opacity-50">
                Gotowka
              </button>
              <button onClick={() => handleSubmit('card')} disabled={submitting}
                className="w-full py-3 px-4 bg-blue-50 border-2 border-blue-200 rounded-lg text-blue-800 font-medium hover:bg-blue-100 disabled:opacity-50">
                Karta
              </button>
              <button onClick={() => handleSubmit('transfer')} disabled={submitting}
                className="w-full py-3 px-4 bg-purple-50 border-2 border-purple-200 rounded-lg text-purple-800 font-medium hover:bg-purple-100 disabled:opacity-50">
                Przelew
              </button>
            </div>
            <button onClick={() => setShowPaymentModal(false)} className="w-full mt-3 py-2 text-gray-500 hover:text-gray-700 text-sm">
              Anuluj
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
