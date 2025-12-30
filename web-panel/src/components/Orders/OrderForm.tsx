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
  inputMode: 'pallets' | 'units';
}

function CustomerSearchInput({
  customers,
  selectedCustomerId,
  onSelect,
  disabled,
}: {
  customers: Customer[];
  selectedCustomerId: number | null;
  onSelect: (customerId: number, customer: Customer | undefined) => void;
  disabled?: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredCustomers = searchTerm.trim() === ''
    ? customers
    : customers.filter(c => {
        const searchLower = searchTerm.toLowerCase();
        const companyName = (c.companyName || '').toLowerCase();
        const firstName = (c.firstName || '').toLowerCase();
        const lastName = (c.lastName || '').toLowerCase();
        const nip = String(c.nip || '').replace(/[^0-9]/g, '');
        const searchNip = searchTerm.replace(/[^0-9]/g, '');
        return companyName.includes(searchLower) ||
               firstName.includes(searchLower) ||
               lastName.includes(searchLower) ||
               (c.firstName && c.lastName && (firstName + ' ' + lastName).includes(searchLower)) ||
               (searchNip.length >= 3 && nip.includes(searchNip));
      });

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const formatCustomerName = (customer: Customer) => customer.companyName || ((customer.firstName || '') + ' ' + (customer.lastName || '')).trim();

  useEffect(() => {
    if (selectedCustomer && !isOpen) setSearchTerm(formatCustomerName(selectedCustomer));
  }, [selectedCustomer, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedCustomer) setSearchTerm(formatCustomerName(selectedCustomer));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedCustomer]);

  const handleSelect = (customer: Customer) => {
    onSelect(customer.id, customer);
    setSearchTerm(formatCustomerName(customer));
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <input ref={inputRef} type="text" className="input w-full" placeholder="Wpisz nazwe firmy, imie, nazwisko lub NIP..."
        value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); setHighlightedIndex(0); }}
        onFocus={() => { setIsOpen(true); if (selectedCustomer) setSearchTerm(''); }}
        disabled={disabled} autoComplete="off" />
      {isOpen && filteredCustomers.length > 0 && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredCustomers.slice(0, 50).map((customer, index) => (
            <div key={customer.id} className={'px-3 py-2 cursor-pointer ' + (index === highlightedIndex ? 'bg-primary-100 text-primary-900' : 'hover:bg-gray-50') + (selectedCustomerId === customer.id ? ' bg-green-50' : '')}
              onClick={() => handleSelect(customer)} onMouseEnter={() => setHighlightedIndex(index)}>
              <div className="flex justify-between items-start">
                <div><div className="font-medium">{formatCustomerName(customer)}</div>
                  <div className="text-sm text-gray-500">{customer.nip && <span className="mr-3">NIP: {customer.nip}</span>}{customer.city && <span>{customer.city}</span>}</div></div>
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{customer.priceGroupName || 'Podstawowa'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductSearchInput({ products, selectedProductId, onSelect, disabled }: { products: Product[]; selectedProductId: number; onSelect: (productId: number, product: Product | undefined) => void; disabled?: boolean; }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const availableProducts = products.filter(p => p.totalUnits > 1);
  const filteredProducts = searchTerm.trim() === '' ? availableProducts : availableProducts.filter(p => p.plantName.toLowerCase().includes(searchTerm.toLowerCase()) || (p.potSize && String(p.potSize).toLowerCase().includes(searchTerm.toLowerCase())));
  const selectedProduct = products.find(p => p.id === selectedProductId);

  useEffect(() => { if (selectedProduct && !isOpen) setSearchTerm(selectedProduct.plantName + ' (' + (selectedProduct.potSize || '-') + ')'); }, [selectedProduct, isOpen]);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedProduct) setSearchTerm(selectedProduct.plantName + ' (' + (selectedProduct.potSize || '-') + ')');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedProduct]);

  const handleSelect = (product: Product) => { onSelect(product.id, product); setSearchTerm(product.plantName + ' (' + (product.potSize || '-') + ')'); setIsOpen(false); };

  return (
    <div className="relative">
      <input ref={inputRef} type="text" className="input w-full" placeholder="Wpisz nazwe rosliny..."
        value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); setHighlightedIndex(0); }}
        onFocus={() => { setIsOpen(true); if (selectedProduct) setSearchTerm(''); }} disabled={disabled} autoComplete="off" />
      {isOpen && filteredProducts.length > 0 && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredProducts.slice(0, 50).map((product, index) => (
            <div key={product.id} className={'px-3 py-2 cursor-pointer flex justify-between items-center ' + (index === highlightedIndex ? 'bg-primary-100 text-primary-900' : 'hover:bg-gray-50') + (selectedProductId === product.id ? ' bg-green-50' : '')}
              onClick={() => handleSelect(product)} onMouseEnter={() => setHighlightedIndex(index)}>
              <div><div className="font-medium">{product.plantName}</div>
                <div className="text-sm text-gray-500">{product.potSize || '-'} | Wys: {product.plantHeightCm || '-'} cm | {product.unitsPerPallet || 1} szt/paleta</div></div>
              <div className="text-right"><div className={'text-sm font-semibold ' + (product.totalUnits < 10 ? 'text-orange-600' : 'text-green-600')}>{product.palletCount || 0} pal. ({product.totalUnits} szt.)</div>
                <div className="text-xs text-gray-500">{product.basePriceGross?.toFixed(2)} PLN</div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ companyName: '', firstName: '', lastName: '', nip: '', email: '', phone: '', street: '', postalCode: '', city: '', priceGroupId: 1 });
  const [useCustomRecipient, setUseCustomRecipient] = useState(false);
  const [recipient, setRecipient] = useState({ companyName: '', firstName: '', lastName: '', street: '', postalCode: '', city: '', phone: '' });
  const isEditMode = !!order;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        const [customersData, productsData] = await Promise.all([api.getCustomers(), api.getInventory()]);
        setCustomers(customersData.customers);
        setProducts(productsData.products);
        if (order && order.items) {
          const orderItems: OrderItem[] = order.items.map(item => {
            const product = productsData.products.find((p: Product) => p.id === item.productId);
            const unitsPerPallet = item.unitsPerPallet || product?.unitsPerPallet || 1;
            return { productId: item.productId!, product, quantity: item.quantity, price: item.unitPriceGross,
              palletCount: item.palletCount || Math.floor(item.quantity / unitsPerPallet), unitsPerPallet, inputMode: 'units' as const };
          });
          setItems(orderItems);
          if (order.customerId) { const customer = customersData.customers.find((c: Customer) => c.id === order.customerId); setSelectedCustomer(customer); }
        }
      } catch (err) { console.error('Error loading data:', err); setError('Blad podczas ladowania danych'); }
      finally { setLoadingData(false); }
    };
    fetchData();
  }, [order]);

  const handleCustomerSelect = (customerId: number, customer: Customer | undefined) => {
    setSelectedCustomerId(customerId); setSelectedCustomer(customer);
    if (customer && items.length > 0) {
      const discountMap: Record<number, keyof Product> = { 1: 'basePriceGross', 2: 'priceDiscount10', 3: 'priceDiscount12', 4: 'priceDiscount15', 5: 'priceDiscount20', 6: 'priceDiscount25' };
      const priceField = discountMap[customer.priceGroupId] || 'basePriceGross';
      setItems(items.map(item => item.product ? { ...item, price: (item.product[priceField] as number) || item.product.basePriceGross || 0 } : item));
    }
  };

  const addItem = () => setItems([...items, { productId: 0, quantity: 0, price: 0, palletCount: 0, unitsPerPallet: 1, inputMode: 'pallets' }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const handleProductSelect = (index: number, productId: number, product: Product | undefined) => {
    const newItems = [...items];
    newItems[index].productId = productId; newItems[index].product = product; newItems[index].unitsPerPallet = product?.unitsPerPallet || 1;
    if (product && selectedCustomerId) {
      const customer = selectedCustomer || customers.find(c => c.id === selectedCustomerId);
      if (customer) {
        const discountMap: Record<number, keyof Product> = { 1: 'basePriceGross', 2: 'priceDiscount10', 3: 'priceDiscount12', 4: 'priceDiscount15', 5: 'priceDiscount20', 6: 'priceDiscount25' };
        newItems[index].price = (product[discountMap[customer.priceGroupId] || 'basePriceGross'] as number) || product.basePriceGross || 0;
      }
    }
    setItems(newItems);
  };

  const updateItemPalletCount = (index: number, palletCount: number) => {
    const newItems = [...items]; const item = newItems[index];
    item.palletCount = palletCount || 0; item.quantity = item.palletCount * item.unitsPerPallet;
    setItems(newItems);
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const newItems = [...items]; const item = newItems[index];
    item.quantity = quantity || 0; item.palletCount = Math.floor(item.quantity / item.unitsPerPallet);
    setItems(newItems);
  };

  const toggleInputMode = (index: number) => { const newItems = [...items]; newItems[index].inputMode = newItems[index].inputMode === 'pallets' ? 'units' : 'pallets'; setItems(newItems); };
  const calculateTotal = () => items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleAddCustomer = async () => {
    try {
      if (!newCustomer.email || !newCustomer.phone || !newCustomer.street || !newCustomer.postalCode || !newCustomer.city) { setError('Wypelnij wszystkie wymagane pola kontrahenta'); return; }
      if (!newCustomer.companyName && (!newCustomer.firstName || !newCustomer.lastName)) { setError('Podaj nazwe firmy lub imie i nazwisko'); return; }
      const response = await api.createCustomer(newCustomer);
      const customersData = await api.getCustomers(); setCustomers(customersData.customers);
      const newCustomerData = customersData.customers.find((c: Customer) => c.id === response.customerId);
      setSelectedCustomerId(response.customerId); setSelectedCustomer(newCustomerData); setShowAddCustomer(false); setError('');
      setNewCustomer({ companyName: '', firstName: '', lastName: '', nip: '', email: '', phone: '', street: '', postalCode: '', city: '', priceGroupId: 1 });
    } catch (err: any) { setError(err.response?.data?.error || 'Blad podczas dodawania kontrahenta'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId && !isEditMode) { setError('Wybierz klienta'); return; }
    if (items.length === 0) { setError('Dodaj przynajmniej jeden produkt'); return; }
    if (items.some(item => !item.productId || item.quantity <= 0)) { setError('Wszystkie produkty musza miec wybrana pozycje i ilosc wieksza od 0'); return; }

    // Validate recipient fields if custom recipient is used
    if (useCustomRecipient) {
      if (!recipient.street || !recipient.postalCode || !recipient.city) {
        setError('Wypelnij adres odbiorcy (ulica, kod pocztowy, miasto)');
        return;
      }
      if (!recipient.companyName && (!recipient.firstName || !recipient.lastName)) {
        setError('Podaj nazwe firmy odbiorcy lub imie i nazwisko');
        return;
      }
    }

    setLoading(true); setError('');
    try {
      if (isEditMode && order) {
        await api.updateOrder(order.id, { items: items.map(item => ({ productId: item.productId!, quantity: item.quantity, palletCount: item.palletCount, unitsPerPallet: item.unitsPerPallet })) });
      } else {
        await api.createOrder({
          customerId: selectedCustomerId!,
          items: items.map(item => ({ productId: item.productId!, quantity: item.quantity, palletCount: item.palletCount, unitsPerPallet: item.unitsPerPallet })),
          customerNotes: customerNotes || undefined,
          useCustomRecipient,
          recipientCompanyName: useCustomRecipient ? recipient.companyName : undefined,
          recipientFirstName: useCustomRecipient ? recipient.firstName : undefined,
          recipientLastName: useCustomRecipient ? recipient.lastName : undefined,
          recipientStreet: useCustomRecipient ? recipient.street : undefined,
          recipientPostalCode: useCustomRecipient ? recipient.postalCode : undefined,
          recipientCity: useCustomRecipient ? recipient.city : undefined,
          recipientPhone: useCustomRecipient ? recipient.phone : undefined,
        });
      }
      onSave();
    } catch (err: any) { setError(err.response?.data?.error || 'Blad podczas ' + (isEditMode ? 'aktualizacji' : 'tworzenia') + ' zamowienia'); }
    finally { setLoading(false); }
  };

  if (loadingData) return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg p-6"><p className="text-gray-600">Ladowanie danych...</p></div></div>);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{isEditMode ? 'Edytuj zamowienie ' + order?.orderNumber : 'Nowe zamowienie'}</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700">Klient (Nabywca) <span className="text-red-500">*</span></label>
                {!isEditMode && <button type="button" onClick={() => setShowAddCustomer(true)} className="text-sm text-blue-600 hover:text-blue-700">+ Dodaj nowego</button>}
              </div>
              {isEditMode ? <input type="text" className="input bg-gray-100" value={order?.customerName || 'Brak danych'} disabled /> : <CustomerSearchInput customers={customers} selectedCustomerId={selectedCustomerId} onSelect={handleCustomerSelect} />}
              {selectedCustomer && <div className="mt-1 text-sm text-gray-500">Grupa cenowa: <span className="font-medium">{selectedCustomer.priceGroupName || 'Podstawowa'}</span>{selectedCustomer.nip && <span className="ml-3">NIP: {selectedCustomer.nip}</span>}</div>}
            </div>

            {/* Recipient Section - only for new orders */}
            {!isEditMode && selectedCustomerId && (
              <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                <div className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    id="useCustomRecipient"
                    checked={useCustomRecipient}
                    onChange={(e) => setUseCustomRecipient(e.target.checked)}
                    className="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <label htmlFor="useCustomRecipient" className="ml-2 text-sm font-medium text-gray-700">
                    Inny adres dostawy (Odbiorca)
                  </label>
                </div>

                {useCustomRecipient && (
                  <div className="mt-4 space-y-4 border-t border-green-200 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa firmy odbiorcy</label>
                        <input
                          type="text"
                          className="input"
                          value={recipient.companyName}
                          onChange={(e) => setRecipient({ ...recipient, companyName: e.target.value })}
                          placeholder="Opcjonalnie"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Telefon odbiorcy</label>
                        <input
                          type="text"
                          className="input"
                          value={recipient.phone}
                          onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })}
                          placeholder="Opcjonalnie"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Imie odbiorcy</label>
                        <input
                          type="text"
                          className="input"
                          value={recipient.firstName}
                          onChange={(e) => setRecipient({ ...recipient, firstName: e.target.value })}
                          placeholder="Opcjonalnie"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nazwisko odbiorcy</label>
                        <input
                          type="text"
                          className="input"
                          value={recipient.lastName}
                          onChange={(e) => setRecipient({ ...recipient, lastName: e.target.value })}
                          placeholder="Opcjonalnie"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ulica <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className="input"
                        value={recipient.street}
                        onChange={(e) => setRecipient({ ...recipient, street: e.target.value })}
                        placeholder="np. ul. Kwiatowa 15"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Kod pocztowy <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          className="input"
                          value={recipient.postalCode}
                          onChange={(e) => setRecipient({ ...recipient, postalCode: e.target.value })}
                          placeholder="00-000"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Miasto <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          className="input"
                          value={recipient.city}
                          onChange={(e) => setRecipient({ ...recipient, city: e.target.value })}
                          placeholder="Miasto"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Te dane pojawia sie jako "Odbiorca" na fakturze, jesli adres dostawy rozni sie od adresu nabywcy.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-3"><label className="block text-sm font-medium text-gray-700">Produkty <span className="text-red-500">*</span></label></div>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="bg-gray-50 p-3 rounded-lg">
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-5"><label className="block text-xs text-gray-600 mb-1">Produkt</label><ProductSearchInput products={products} selectedProductId={item.productId} onSelect={(productId, product) => handleProductSelect(index, productId, product)} /></div>
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-600 mb-1">{item.inputMode === 'pallets' ? 'Palety' : 'Sztuki'}<button type="button" onClick={() => toggleInputMode(index)} className="ml-1 text-blue-500 text-xs hover:underline">({item.inputMode === 'pallets' ? 'wpisz szt.' : 'wpisz pal.'})</button></label>
                        {item.inputMode === 'pallets' ? <input type="number" className="input" min="0" value={item.palletCount} onChange={(e) => updateItemPalletCount(index, parseInt(e.target.value))} /> : <input type="number" className="input" min="1" max={item.product?.totalUnits || 999} value={item.quantity} onChange={(e) => updateItemQuantity(index, parseInt(e.target.value))} />}
                      </div>
                      <div className="col-span-2"><label className="block text-xs text-gray-600 mb-1">Szt/paleta</label><input type="text" className="input bg-gray-100" value={item.unitsPerPallet} readOnly /></div>
                      <div className="col-span-2"><label className="block text-xs text-gray-600 mb-1">Cena jedn.</label><input type="text" className="input bg-white" value={(item.price || 0).toFixed(2)} readOnly /></div>
                      <div className="col-span-1"><button type="button" onClick={() => removeItem(index)} className="btn btn-danger w-full">X</button></div>
                    </div>
                    {item.product && item.quantity > 0 && (<div className="mt-2 text-sm text-gray-600 flex justify-between items-center border-t pt-2"><span><strong>{item.palletCount}</strong> palet x <strong>{item.unitsPerPallet}</strong> szt/paleta = <strong>{item.quantity}</strong> szt.</span><span className="font-semibold text-gray-800">Wartosc: {(item.price * item.quantity).toFixed(2)} PLN</span></div>)}
                    {item.product && item.quantity > item.product.totalUnits && <p className="text-xs text-red-500 mt-1">Przekroczono dostepny stan: max {item.product.totalUnits} szt.</p>}
                  </div>
                ))}
              </div>
              {items.length === 0 && <p className="text-sm text-gray-500 italic">Brak produktow</p>}
              <button type="button" onClick={addItem} className="btn btn-secondary text-sm mt-3">+ Dodaj produkt</button>
            </div>
            {items.length > 0 && (<div className="bg-gray-50 p-4 rounded-lg"><div className="flex justify-between text-sm text-gray-600 mb-2"><span>Lacznie palet:</span><span className="font-semibold">{items.reduce((sum, item) => sum + item.palletCount, 0)}</span></div><div className="flex justify-between text-sm text-gray-600 mb-2"><span>Lacznie sztuk:</span><span className="font-semibold">{items.reduce((sum, item) => sum + item.quantity, 0)}</span></div><div className="flex justify-between text-lg font-bold border-t pt-2"><span>Suma:</span><span>{calculateTotal().toFixed(2)} PLN</span></div></div>)}
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notatki klienta (opcjonalnie)</label><textarea className="input" rows={3} placeholder="Dodatkowe uwagi do zamowienia..." value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} /></div>
            <div className="flex gap-3 pt-4"><button type="submit" disabled={loading} className="btn btn-primary flex-1">{loading ? (isEditMode ? 'Aktualizowanie...' : 'Tworzenie...') : (isEditMode ? 'Zaktualizuj zamowienie' : 'Utworz zamowienie')}</button><button type="button" onClick={onCancel} className="btn btn-secondary flex-1">Anuluj</button></div>
          </form>
        </div>
      </div>
      {showAddCustomer && (<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-[60]"><div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"><div className="p-6"><h3 className="text-xl font-bold text-gray-900 mb-4">Dodaj nowego kontrahenta</h3><div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Nazwa firmy</label><input type="text" className="input" value={newCustomer.companyName} onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })} placeholder="Opcjonalnie" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">NIP</label><input type="text" className="input" value={newCustomer.nip} onChange={(e) => setNewCustomer({ ...newCustomer, nip: e.target.value })} placeholder="Opcjonalnie" /></div></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Imie</label><input type="text" className="input" value={newCustomer.firstName} onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })} placeholder="Opcjonalnie" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Nazwisko</label><input type="text" className="input" value={newCustomer.lastName} onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })} placeholder="Opcjonalnie" /></div></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label><input type="email" className="input" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} required /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Telefon <span className="text-red-500">*</span></label><input type="text" className="input" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} required /></div></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Ulica <span className="text-red-500">*</span></label><input type="text" className="input" value={newCustomer.street} onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })} required /></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Kod pocztowy <span className="text-red-500">*</span></label><input type="text" className="input" value={newCustomer.postalCode} onChange={(e) => setNewCustomer({ ...newCustomer, postalCode: e.target.value })} required /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Miasto <span className="text-red-500">*</span></label><input type="text" className="input" value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} required /></div></div></div><div className="flex gap-3 mt-6"><button type="button" onClick={handleAddCustomer} className="btn btn-primary flex-1">Dodaj kontrahenta</button><button type="button" onClick={() => setShowAddCustomer(false)} className="btn btn-secondary flex-1">Anuluj</button></div></div></div></div>)}
    </div>
  );
}
