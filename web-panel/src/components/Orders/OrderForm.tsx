import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Customer, Product, OrderWithItems } from '../../types';

interface OrderFormProps {
  order?: OrderWithItems | null;
  onSave: () => void;
  onCancel: () => void;
}

interface OrderItem {
  productId: number;
  product?: Product;
  quantity: number;
  price: number;
  palletCount: number;
  unitsPerPallet: number;
  itemDiscount: number;
  originalQuantity?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function OrderForm({ order, onSave, onCancel }: OrderFormProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(order?.customerId || null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | undefined>(undefined);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [customerNotes, setCustomerNotes] = useState(order?.customerNotes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  // Per-product qty/unit in left panel
  const [productQty, setProductQty] = useState<Record<number, number>>({});
  const [productUnit, setProductUnit] = useState<Record<number, 'szt' | 'pal'>>({});
  const [newCustomer, setNewCustomer] = useState({ companyName: '', firstName: '', lastName: '', nip: '', email: '', phone: '', street: '', postalCode: '', city: '', priceGroupId: 1 });
  const isEditMode = !!order;
  const customerDropRef = useRef<HTMLDivElement>(null);
  const customerInputRef2 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        const [customersData, productsData] = await Promise.all([api.getCustomers(), api.getInventory()]);
        setCustomers(customersData.customers);
        setProducts(productsData.products);
        if (order && order.items) {
          const snapshotProducts: Product[] = [];
          const orderItems: OrderItem[] = order.items.map(item => {
            let product = productsData.products.find((p: Product) => p.id === item.productId);
            if (!product && item.productSnapshot) {
              const snap = item.productSnapshot as any;
              product = { id: snap.id || item.productId, plantName: snap.plantName || item.productName || 'Nieznany', potSize: snap.potSize || null, unitsPerPallet: snap.unitsPerPallet || item.unitsPerPallet || 1, totalUnits: 0, palletCount: 0, basePriceGross: parseFloat(String(item.unitPriceGross)) || 0, barcode: snap.barcode || null, imageUrl: snap.imageUrl || null } as Product;
              snapshotProducts.push(product);
            }
            const upp = item.unitsPerPallet || product?.unitsPerPallet || 1;
            return { productId: item.productId!, product, quantity: item.quantity, price: item.unitPriceGross, palletCount: item.palletCount || Math.floor(item.quantity / upp), unitsPerPallet: upp, itemDiscount: 0, originalQuantity: item.quantity };
          });
          if (snapshotProducts.length > 0) setProducts([...productsData.products, ...snapshotProducts]);
          setItems(orderItems);
          if (order.customerId) {
            const c = customersData.customers.find((c: Customer) => c.id === order.customerId);
            setSelectedCustomer(c);
            setCustomerSearch(c?.companyName || `${c?.firstName || ''} ${c?.lastName || ''}`.trim());
          }
        }
      } catch (err) { setError('Błąd ładowania danych'); }
      finally { setLoadingData(false); }
    };
    fetchData();
  }, [order]);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerDropRef.current && !customerDropRef.current.contains(e.target as Node) &&
          customerInputRef2.current && !customerInputRef2.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getProductPrice = (product: Product, customer?: Customer): number => {
    if (!customer) return product.basePriceGross || 0;
    const map: Record<number, keyof Product> = { 1: 'basePriceGross', 2: 'priceDiscount10', 3: 'priceDiscount12', 4: 'priceDiscount15', 5: 'priceDiscount20', 6: 'priceDiscount25' };
    const gross = (product[map[customer.priceGroupId] || 'basePriceGross'] as number) || product.basePriceGross || 0;
    return customer.isEuCompany ? round2(gross / 1.08) : gross;
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomerId(customer.id); setSelectedCustomer(customer);
    setCustomerSearch(customer.companyName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim());
    setShowCustomerDropdown(false);
    if (items.length > 0) {
      setItems(items.map(item => item.product ? { ...item, price: getProductPrice(item.product, customer) } : item));
    }
  };

  const addProduct = (product: Product) => {
    const qty = productQty[product.id] || 1;
    const unit = productUnit[product.id] || 'szt';
    const upp = product.unitsPerPallet || 1;
    const totalQty = unit === 'pal' ? qty * upp : qty;
    const pallets = unit === 'pal' ? qty : Math.floor(totalQty / upp);
    const price = getProductPrice(product, selectedCustomer);

    const existing = items.findIndex(i => i.productId === product.id);
    if (existing >= 0) {
      setItems(prev => prev.map((item, idx) => idx === existing ? { ...item, quantity: item.quantity + totalQty, palletCount: Math.floor((item.quantity + totalQty) / item.unitsPerPallet) } : item));
    } else {
      setItems(prev => [...prev, { productId: product.id, product, quantity: totalQty, price, palletCount: pallets, unitsPerPallet: upp, itemDiscount: 0 }]);
    }
  };

  const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

  const updateItemQty = (index: number, qty: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(0, qty), palletCount: Math.floor(Math.max(0, qty) / item.unitsPerPallet) } : item));
  };

  const updateItemPrice = (index: number, price: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, price } : item));
  };

  const updateItemDiscount = (index: number, pct: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const origPrice = item.itemDiscount > 0 ? round2(item.price / (1 - item.itemDiscount / 100)) : item.price;
      const newPrice = pct > 0 ? round2(origPrice * (1 - pct / 100)) : origPrice;
      return { ...item, itemDiscount: pct, price: newPrice };
    }));
  };

  // Totals
  const rawTotal = items.reduce((s, i) => s + round2(i.price * i.quantity), 0);
  const discountAmt = discountType === 'percent' ? round2(rawTotal * orderDiscount / 100) : round2(orderDiscount);
  const discountRatio = rawTotal > 0 ? (rawTotal - discountAmt) / rawTotal : 1;
  const totalGross = round2(rawTotal - discountAmt);
  const totalNet = round2(totalGross / 1.08);
  const totalVat = round2(totalGross - totalNet);
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  const handleSubmit = async () => {
    if (!selectedCustomerId && !isEditMode) { setError('Wybierz klienta'); return; }
    if (items.length === 0) { setError('Dodaj przynajmniej jeden produkt'); return; }
    if (items.some(item => !item.productId || item.quantity <= 0)) { setError('Wszystkie pozycje muszą mieć ilość > 0'); return; }
    setLoading(true); setError('');
    try {
      const adjustedItems = items.map(item => ({
        productId: item.productId, quantity: item.quantity,
        palletCount: item.palletCount, unitsPerPallet: item.unitsPerPallet,
        unitPriceGross: selectedCustomer?.isEuCompany ? round2(item.price * discountRatio * 1.08) : round2(item.price * discountRatio),
      }));
      if (isEditMode && order) {
        await api.updateOrder(order.id, { items: adjustedItems });
      } else {
        await api.createOrder({ customerId: selectedCustomerId!, items: adjustedItems, customerNotes: customerNotes || undefined });
      }
      onSave();
    } catch (err: any) { setError(err.response?.data?.error || 'Błąd'); }
    finally { setLoading(false); }
  };

  const handleAddCustomer = async () => {
    try {
      if (!newCustomer.email || !newCustomer.phone || !newCustomer.street || !newCustomer.postalCode || !newCustomer.city) { setError('Wypełnij wymagane pola'); return; }
      const response = await api.createCustomer(newCustomer);
      const data = await api.getCustomers(); setCustomers(data.customers);
      const created = data.customers.find((c: Customer) => c.id === response.customerId);
      if (created) handleCustomerSelect(created);
      setShowAddCustomer(false);
      setNewCustomer({ companyName: '', firstName: '', lastName: '', nip: '', email: '', phone: '', street: '', postalCode: '', city: '', priceGroupId: 1 });
    } catch (err: any) { setError(err.response?.data?.error || 'Błąd'); }
  };

  const availableProducts = products.filter(p => (p.totalUnits > 0 || items.some(i => i.productId === p.id)) && !p.isArchived);
  const filteredProducts = productSearch.trim() === '' ? availableProducts : availableProducts.filter(p =>
    (p.plantName || '').toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.potSize && String(p.potSize).toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.barcode && String(p.barcode).includes(productSearch))
  );
  const filteredCustomers = (() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers.filter(c => {
      const name = (c.companyName || '').toLowerCase();
      const code = String(c.customerCode || '').toLowerCase();
      const first = (c.firstName || '').toLowerCase();
      const last = (c.lastName || '').toLowerCase();
      const nipStr = String(c.nip || '');
      return name.includes(q) || code.includes(q) || first.includes(q) || last.includes(q) || nipStr.includes(q);
    }).slice(0, 50);
  })();

  if (loadingData) return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"><div className="bg-white rounded-lg p-6">Ładowanie...</div></div>);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full flex flex-col" style={{ width: 'calc(100vw - 48px)', maxWidth: '1600px', height: 'calc(100vh - 48px)' }}>
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-3 border-b bg-gray-50 rounded-t-xl">
          <h2 className="text-lg font-bold text-gray-900">{isEditMode ? `Edytuj zamówienie ${order?.orderNumber}` : 'Nowe zamówienie'}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {error && <div className="mx-4 mt-2 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

        <div className="flex flex-1 overflow-hidden">
          {/* ═══ LEFT: Product Catalog ═══ */}
          <div className="w-[45%] border-r flex flex-col">
            <div className="p-3 border-b bg-gray-50">
              <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="Szukaj produktów..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredProducts.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-sm">Brak produktów</div>
              ) : filteredProducts.map(p => {
                const price = getProductPrice(p, selectedCustomer);
                const isAdded = items.some(i => i.productId === p.id);
                const qty = productQty[p.id] || 1;
                const unit = productUnit[p.id] || 'szt';
                return (
                  <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border ${isAdded ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100 hover:border-gray-300'} transition-colors`}>
                    {/* Image */}
                    <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">brak</div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0 mr-1">
                      <div className="font-medium text-sm leading-tight truncate">{p.plantName}</div>
                      <div className="text-xs text-gray-500">
                        {p.potSize || '-'} | Stan: {p.totalUnits} szt | {p.unitsPerPallet || 1} szt/pal
                      </div>
                    </div>
                    {/* Price */}
                    <div className="text-right flex-shrink-0 w-16">
                      <div className="font-bold text-sm text-green-700">{price.toFixed(2)}</div>
                      <div className="text-xs text-gray-400">zł brutto</div>
                    </div>
                    {/* Unit + Qty + Add */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <select className="w-12 px-1 py-1.5 border border-gray-300 rounded text-xs"
                        value={unit} onChange={e => setProductUnit(prev => ({ ...prev, [p.id]: e.target.value as 'szt' | 'pal' }))}>
                        <option value="szt">szt</option>
                        <option value="pal">pal</option>
                      </select>
                      <input type="number" className="w-12 px-1 py-1.5 border border-gray-300 rounded text-xs text-center"
                        min="1" value={qty}
                        onChange={e => setProductQty(prev => ({ ...prev, [p.id]: Math.max(1, parseInt(e.target.value) || 1) }))} />
                      <button onClick={() => addProduct(p)}
                        className="w-8 h-8 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg text-lg font-bold transition-colors flex-shrink-0">
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ═══ RIGHT: Order Details ═══ */}
          <div className="w-[55%] flex flex-col">
            {/* Customer */}
            <div className="p-3 border-b">
              <div className="text-xs text-gray-500 mb-1">Kontrahent</div>
              {isEditMode ? (
                <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm"><strong>{order?.customerName || 'Brak'}</strong>
                  {selectedCustomer?.priceGroupName && <span className="ml-2 text-gray-400">({selectedCustomer.priceGroupName})</span>}
                </div>
              ) : (
                <div className="relative">
                  <div className="flex gap-2">
                    <input ref={customerInputRef2} type="text" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      placeholder="Szukaj: nazwa, kod klienta, NIP..."
                      value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                      onFocus={() => { setShowCustomerDropdown(true); if (selectedCustomerId) setCustomerSearch(''); }}
                      autoComplete="off" />
                    <button type="button" onClick={() => setShowAddCustomer(true)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 whitespace-nowrap">+ Nowy</button>
                  </div>
                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <div ref={customerDropRef} className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.map(c => (
                        <div key={c.id}
                          className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${selectedCustomerId === c.id ? 'bg-blue-50' : ''}`}
                          onClick={() => handleCustomerSelect(c)}>
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-medium text-sm">{c.companyName || `${c.firstName || ''} ${c.lastName || ''}`.trim()}</div>
                              <div className="text-xs text-gray-500">
                                {c.customerCode && <span className="mr-2">Kod: {c.customerCode}</span>}
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
              )}
            </div>

            {/* Items header */}
            <div className="px-4 pt-3 pb-1 text-sm text-gray-500 font-medium">Pozycje zamówienia ({items.length})</div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-4 pb-2">
              {items.length === 0 ? (
                <div className="text-center text-gray-400 py-12 text-sm">Kliknij + przy produkcie z lewej strony</div>
              ) : items.map((item, index) => {
                const lineTotal = round2(item.price * item.quantity);
                const netPrice = round2(item.price / 1.08);
                return (
                  <div key={index} className="flex items-center gap-2 py-2.5 border-b border-gray-100">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">{item.product?.plantName || 'Produkt'}</span>
                      {item.product?.potSize && <span className="text-xs text-gray-400 ml-1">{item.product.potSize}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-gray-400">Ilość:</span>
                      <input type="number" min="1" className="w-14 px-1.5 py-1 border border-gray-300 rounded text-xs text-center"
                        value={item.quantity} onChange={e => updateItemQty(index, parseInt(e.target.value) || 0)} />
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-gray-400">Netto:</span>
                      <span className="text-xs w-14 text-right">{netPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-gray-400">Brutto:</span>
                      <input type="text" inputMode="decimal" className="w-16 px-1.5 py-1 border border-gray-300 rounded text-xs text-center"
                        defaultValue={item.price.toFixed(2)}
                        key={`price-${index}-${item.productId}`}
                        onFocus={e => e.target.select()}
                        onBlur={e => {
                          const v = parseFloat(e.target.value.replace(',', '.')) || 0;
                          e.target.value = v.toFixed(2);
                          updateItemPrice(index, v);
                        }} />
                    </div>
                    <span className="px-1 py-0.5 bg-gray-100 text-gray-500 rounded text-xs flex-shrink-0">VAT 8%</span>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <span className="text-xs text-gray-400">-</span>
                      <input type="text" inputMode="decimal" className="w-10 px-1 py-1 border border-gray-300 rounded text-xs text-center"
                        defaultValue={item.itemDiscount || ''}
                        placeholder="0"
                        key={`disc-${index}-${item.productId}`}
                        onBlur={e => updateItemDiscount(index, parseFloat(e.target.value) || 0)} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                    <div className="font-semibold text-sm text-gray-900 w-20 text-right flex-shrink-0">{lineTotal.toFixed(2)} zł</div>
                    <div className="text-xs text-blue-600 font-medium w-14 text-right flex-shrink-0">{item.quantity} szt</div>
                    <button onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600 text-sm flex-shrink-0 ml-1">×</button>
                  </div>
                );
              })}
            </div>

            {/* Footer: totals + submit */}
            <div className="border-t bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-600">
                  Netto: <strong>{totalNet.toFixed(2)} zł</strong>
                  <span className="mx-2">|</span>
                  VAT: <strong>{totalVat.toFixed(2)} zł</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Rabat:</span>
                  <input type="text" inputMode="decimal" className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                    value={orderDiscount || ''} placeholder="0"
                    onChange={e => setOrderDiscount(parseFloat(e.target.value) || 0)} />
                  <button onClick={() => setDiscountType(discountType === 'percent' ? 'amount' : 'percent')}
                    className={`px-2 py-1 rounded text-xs font-medium ${discountType === 'percent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                    {discountType === 'percent' ? '%' : 'zł'}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-500">
                  Pozycji: {items.length} | Sztuk: {totalUnits}
                </div>
                <div className="text-xl font-bold text-gray-900">Brutto: {totalGross.toFixed(2)} zł</div>
              </div>
              {!isEditMode && (
                <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" rows={1}
                  placeholder="Notatki (opcjonalnie)..." value={customerNotes} onChange={e => setCustomerNotes(e.target.value)} />
              )}
              <button onClick={handleSubmit} disabled={loading || items.length === 0 || (!selectedCustomerId && !isEditMode)}
                className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 text-sm">
                {loading ? 'Zapisywanie...' : isEditMode ? 'Zaktualizuj zamówienie' : 'Utwórz zamówienie'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold mb-4">Dodaj kontrahenta</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Nazwa firmy</label><input type="text" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.companyName} onChange={e => setNewCustomer({ ...newCustomer, companyName: e.target.value })} /></div>
                <div><label className="block text-sm font-medium mb-1">NIP</label><input type="text" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.nip} onChange={e => setNewCustomer({ ...newCustomer, nip: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Imię</label><input type="text" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.firstName} onChange={e => setNewCustomer({ ...newCustomer, firstName: e.target.value })} /></div>
                <div><label className="block text-sm font-medium mb-1">Nazwisko</label><input type="text" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.lastName} onChange={e => setNewCustomer({ ...newCustomer, lastName: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} /></div>
                <div><label className="block text-sm font-medium mb-1">Telefon *</label><input type="text" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Ulica *</label><input type="text" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.street} onChange={e => setNewCustomer({ ...newCustomer, street: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Kod pocztowy *</label><input type="text" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.postalCode} onChange={e => setNewCustomer({ ...newCustomer, postalCode: e.target.value })} /></div>
                <div><label className="block text-sm font-medium mb-1">Miasto *</label><input type="text" className="w-full px-3 py-2 border rounded-lg text-sm" value={newCustomer.city} onChange={e => setNewCustomer({ ...newCustomer, city: e.target.value })} /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleAddCustomer} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium">Dodaj</button>
              <button onClick={() => setShowAddCustomer(false)} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium">Anuluj</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
