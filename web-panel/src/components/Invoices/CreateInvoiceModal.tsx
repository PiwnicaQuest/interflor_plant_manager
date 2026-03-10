import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api';
import { usePrint } from '../../hooks/usePrint';
import { Customer, Product, PriceGroup } from '../../types';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface InvoiceItemRow {
  productId: number;
  product: Product;
  description: string;
  quantity: number;
  unitPriceNet: number;
  unitPriceGross: number;
  vatRate: number;
  growerPassport?: string;
}

// ─── Price helpers ─────────────────────────────────────────────

const knownGroupFields: Record<string, keyof Product> = {
  'podstawowa': 'basePriceGross',
  'rabat_10': 'priceDiscount10',
  'rabat_12': 'priceDiscount12',
  'rabat_15': 'priceDiscount15',
  'rabat_20': 'priceDiscount20',
  'rabat_25': 'priceDiscount25',
  'auchan_8': 'priceAuchan8',
  'hurt': 'pricePlus',
};

function getProductPrice(product: Product, customer?: Customer | null, priceGroups?: PriceGroup[]): number {
  const base = product.basePriceGross || 0;
  if (!customer) return base;
  const pg = priceGroups?.find(g => g.id === customer.priceGroupId);
  const pgName = (pg?.name || customer.priceGroupName || '').toLowerCase();
  const field = knownGroupFields[pgName];
  if (field) return (product[field] as number) || base;
  if (pg && pg.discountPercentage !== undefined && pg.discountPercentage !== 0) {
    return Math.round(base * (1 - Number(pg.discountPercentage) / 100) * 100) / 100;
  }
  return base;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const grossToNet = (gross: number, vat: number) => round2(gross / (1 + vat / 100));
const netToGross = (net: number, vat: number) => round2(net * (1 + vat / 100));

// ─── Customer Search Component ─────────────────────────────────

function CustomerSearch({ customers, selectedCustomerId, onSelect }: {
  customers: Customer[];
  selectedCustomerId: number | null;
  onSelect: (id: number, c: Customer) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const filtered = search.trim() === '' ? customers : customers.filter(c => {
    const s = search.toLowerCase();
    const code = String(c.customerCode || '').toLowerCase();
    const company = (c.companyName || '').toLowerCase();
    const first = (c.firstName || '').toLowerCase();
    const last = (c.lastName || '').toLowerCase();
    const nip = String(c.nip || '').replace(/[^0-9]/g, '');
    const sNip = search.replace(/[^0-9]/g, '');
    return code.includes(s) || company.includes(s) || first.includes(s) || last.includes(s) ||
      (first + ' ' + last).includes(s) || (sNip.length >= 3 && nip.includes(sNip));
  });

  const sel = customers.find(c => c.id === selectedCustomerId);
  const fmt = (c: Customer) => {
    const name = c.companyName || ((c.firstName || '') + ' ' + (c.lastName || '')).trim();
    return c.customerCode ? `[${c.customerCode}] ${name}` : name;
  };

  useEffect(() => {
    if (sel && !open) setSearch(fmt(sel));
  }, [sel, open]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (sel) setSearch(fmt(sel));
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [sel]);

  return (
    <div className="relative">
      <input ref={inputRef} type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="Szukaj: nazwa, kod klienta, NIP..." value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); if (sel) setSearch(''); }} autoComplete="off" />
      {open && filtered.length > 0 && (
        <div ref={dropRef} className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.slice(0, 50).map(c => (
            <div key={c.id} className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${selectedCustomerId === c.id ? 'bg-blue-50' : ''}`}
              onClick={() => { onSelect(c.id, c); setSearch(fmt(c)); setOpen(false); }}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{fmt(c)}</div>
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

// ─── Success Modal ─────────────────────────────────────────────

function InvoiceSuccessModal({ invoiceId, invoiceNumber, customerEmail, onClose, onPrint, onEmail }: {
  invoiceId: number;
  invoiceNumber: string;
  customerEmail?: string;
  onClose: () => void;
  onPrint: () => void;
  onEmail: (email?: string) => void;
}) {
  const [emailInput, setEmailInput] = useState(customerEmail || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    try { await onPrint(); } finally { setPrinting(false); }
  };

  const handleEmail = async () => {
    setSending(true);
    try {
      await onEmail(emailInput || undefined);
      setSent(true);
    } catch { } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-1">Faktura wystawiona!</h3>
        <p className="text-gray-500 mb-6">{invoiceNumber}</p>

        <div className="space-y-3">
          <button onClick={handlePrint} disabled={printing}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            {printing ? 'Drukowanie...' : 'Drukuj fakture'}
          </button>

          <div className="border rounded-lg p-3">
            <div className="flex gap-2">
              <input type="email" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Email klienta..." value={emailInput} onChange={e => setEmailInput(e.target.value)} />
              <button onClick={handleEmail} disabled={sending || sent || !emailInput}
                className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap ${sent ? 'bg-green-100 text-green-700' : 'bg-orange-500 text-white hover:bg-orange-600'} disabled:opacity-50`}>
                {sent ? 'Wyslano!' : sending ? 'Wysylanie...' : 'Wyslij email'}
              </button>
            </div>
          </div>

          <button onClick={onClose} className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Modal ────────────────────────────────────────────────

export function CreateInvoiceModal({ isOpen, onClose, onSuccess }: CreateInvoiceModalProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<InvoiceItemRow[]>([]);
  const [selectedPayment, setSelectedPayment] = useState('');
  const [transferDays, setTransferDays] = useState(14);
  const [productSearch, setProductSearch] = useState('');

  // Quantity/unit inputs per product (temporary, before adding)
  const [productQty, setProductQty] = useState<Record<number, number>>({});
  const [productUnit, setProductUnit] = useState<Record<number, 'szt' | 'pal'>>({});

  // Success modal
  const [successData, setSuccessData] = useState<{ id: number; number: string; email?: string } | null>(null);

  const { printInvoicePdf } = usePrint({ enabled: true });

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [custData, prodData, pgData] = await Promise.all([
          api.getCustomers(), api.getInventory(), api.getPriceGroups()
        ]);
        setCustomers(custData.customers);
        setProducts(prodData.products);
        setPriceGroups(pgData.priceGroups || []);
      } catch {
        setError('Blad ladowania danych');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    setSelectedCustomerId(null);
    setSelectedCustomer(null);
    setItems([]);
    setError('');
    setSelectedPayment('');
    setTransferDays(14);
    setProductSearch('');
    setProductQty({});
    setProductUnit({});
    setSuccessData(null);
  }, [isOpen]);

  // ─── Handlers ──────────────────────

  const handleCustomerSelect = useCallback((id: number, customer: Customer) => {
    setSelectedCustomerId(id);
    setSelectedCustomer(customer);
    setItems(prev => prev.map(item => {
      const gross = getProductPrice(item.product, customer, priceGroups);
      const net = grossToNet(gross, item.vatRate);
      return { ...item, unitPriceGross: gross, unitPriceNet: net };
    }));
  }, [priceGroups]);

  const addProduct = useCallback((product: Product) => {
    const qty = productQty[product.id] || 1;
    const unit = productUnit[product.id] || 'szt';
    const finalQty = unit === 'pal' && product.unitsPerPallet ? qty * product.unitsPerPallet : qty;
    const gross = getProductPrice(product, selectedCustomer, priceGroups);
    const vatRate = product.vatRate || 8;
    const net = grossToNet(gross, vatRate);
    setItems(prev => {
      const existing = prev.findIndex(i => i.productId === product.id);
      if (existing >= 0) {
        return prev.map((item, idx) => idx === existing ? { ...item, quantity: item.quantity + finalQty } : item);
      }
      return [...prev, {
        productId: product.id,
        product,
        description: product.plantName + (product.potSize ? ' ' + product.potSize : ''),
        quantity: finalQty,
        unitPriceNet: net,
        unitPriceGross: gross,
        vatRate,
        growerPassport: product.growerPassport || undefined,
      }];
    });
    setProductQty(prev => ({ ...prev, [product.id]: 1 }));
    setProductUnit(prev => ({ ...prev, [product.id]: 'szt' }));
  }, [selectedCustomer, priceGroups, productQty, productUnit]);

  const updateItemNet = (index: number, net: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, unitPriceNet: net, unitPriceGross: netToGross(net, item.vatRate) } : item));
  };

  const updateItemGross = (index: number, gross: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, unitPriceGross: gross, unitPriceNet: grossToNet(gross, item.vatRate) } : item));
  };

  const updateItemQty = (index: number, qty: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: qty } : item));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Calculations ──────────────────

  const subtotalNet = items.reduce((s, i) => s + round2(i.unitPriceNet * i.quantity), 0);
  const totalVat = items.reduce((s, i) => s + round2(round2(i.unitPriceNet * i.quantity) * (i.vatRate / 100)), 0);
  const totalGross = round2(subtotalNet + totalVat);
  const canSubmit = selectedCustomerId && items.length > 0 && selectedPayment && items.every(i => i.quantity > 0 && i.unitPriceNet > 0);

  // ─── Submit ────────────────────────

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      setError('');
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + transferDays);
      const result = await api.createInvoice({
        customerId: selectedCustomerId!,
        paymentMethod: selectedPayment,
        paymentDeadline: selectedPayment === 'transfer' ? deadlineDate.toISOString().split('T')[0] : undefined,
        items: items.map(i => ({
          productId: i.productId,
          description: i.description,
          quantity: i.quantity,
          unitPriceNet: i.unitPriceNet,
          unitPriceGross: i.unitPriceGross,
          vatRate: i.vatRate,
          growerPassport: i.growerPassport,
        })),
      });
      setSuccessData({
        id: result.invoiceId || result.id,
        number: result.invoiceNumber,
        email: selectedCustomer?.email || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Blad tworzenia faktury');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async () => {
    if (!successData) return;
    await printInvoicePdf(successData.id, { title: `Faktura ${successData.number}` });
  };

  const handleEmail = async (email?: string) => {
    if (!successData) return;
    await api.sendInvoiceEmail(successData.id, { email });
  };

  const handleSuccessClose = () => {
    setSuccessData(null);
    onClose();
  };

  // ─── Product list ──────────────────

  const availableProducts = products.filter(p => p.totalUnits > 0 && !p.isArchived);
  const filteredProducts = productSearch.trim() === '' ? availableProducts : availableProducts.filter(p =>
    p.plantName.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.potSize && String(p.potSize).toLowerCase().includes(productSearch.toLowerCase())) ||
    (p.barcode && p.barcode.includes(productSearch))
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl flex flex-col" style={{ height: 'calc(100vh - 48px)' }}>
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-3 border-b bg-gray-50 rounded-t-xl">
            <h2 className="text-lg font-bold text-gray-900">Nowa faktura</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">Ladowanie danych...</div>
          ) : (
            <div className="flex flex-1 overflow-hidden">
              {/* ═══ LEFT: Product Catalog ═══ */}
              <div className="w-[45%] border-r flex flex-col">
                <div className="p-3 border-b bg-gray-50">
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="Szukaj produkt..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filteredProducts.length === 0 ? (
                    <div className="text-center text-gray-400 py-8 text-sm">Brak produktow</div>
                  ) : filteredProducts.map(p => {
                    const price = getProductPrice(p, selectedCustomer, priceGroups);
                    const qty = productQty[p.id] || 1;
                    const unit = productUnit[p.id] || 'szt';
                    const isAdded = items.some(i => i.productId === p.id);
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
                          <div className="font-medium text-sm leading-tight">{p.plantName}</div>
                          <div className="text-xs text-gray-500">
                            {p.potSize || '-'} | Stan: {p.totalUnits} szt
                            {p.unitsPerPallet ? ` | ${p.unitsPerPallet} szt/pal` : ''}
                          </div>
                        </div>
                        {/* Price */}
                        <div className="text-right flex-shrink-0 w-16">
                          <div className="font-bold text-sm text-green-700">{price.toFixed(2)}</div>
                          <div className="text-xs text-gray-400">zl brutto</div>
                        </div>
                        {/* Unit + Qty + Add */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {p.unitsPerPallet && p.unitsPerPallet > 0 ? (
                            <select className="w-12 px-1 py-1.5 border border-gray-300 rounded text-xs"
                              value={unit} onChange={e => setProductUnit(prev => ({ ...prev, [p.id]: e.target.value as 'szt' | 'pal' }))}>
                              <option value="szt">szt</option>
                              <option value="pal">pal</option>
                            </select>
                          ) : (
                            <span className="text-xs text-gray-400 w-12 text-center">szt</span>
                          )}
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

              {/* ═══ RIGHT: Customer + Items + Payment ═══ */}
              <div className="w-[55%] flex flex-col">
                {/* Customer */}
                <div className="p-3 border-b bg-gray-50">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Kontrahent</label>
                  <CustomerSearch customers={customers} selectedCustomerId={selectedCustomerId} onSelect={handleCustomerSelect} />
                  {selectedCustomer && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      {selectedCustomer.nip && <span>NIP: {selectedCustomer.nip}</span>}
                      {selectedCustomer.city && <span>| {selectedCustomer.street}, {selectedCustomer.postalCode} {selectedCustomer.city}</span>}
                      <span className="ml-auto px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{selectedCustomer.priceGroupName || 'Podstawowa'}</span>
                    </div>
                  )}
                </div>

                {/* Items list */}
                <div className="flex-1 overflow-y-auto p-3">
                  <label className="block text-xs font-medium text-gray-500 mb-2">Pozycje faktury ({items.length})</label>
                  {items.length === 0 ? (
                    <div className="text-center text-gray-300 py-12">
                      <svg className="w-12 h-12 mx-auto mb-2 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="text-sm">Dodaj produkty z listy po lewej</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item, index) => (
                        <div key={item.productId} className="border rounded-lg p-2.5 bg-white hover:shadow-sm transition-shadow">
                          <div className="flex items-start justify-between mb-2">
                            <div className="font-medium text-sm text-gray-800 truncate flex-1">{item.description}</div>
                            <button onClick={() => removeItem(index)}
                              className="ml-2 w-6 h-6 flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 rounded transition-colors text-sm">
                              &times;
                            </button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 items-end">
                            <div>
                              <label className="text-xs text-gray-400">Ilosc</label>
                              <input type="number" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center" min="1"
                                value={item.quantity || ''} onChange={e => updateItemQty(index, parseInt(e.target.value) || 0)} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">Netto</label>
                              <input type="number" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center" step="0.01" min="0"
                                value={item.unitPriceNet || ''} onChange={e => updateItemNet(index, parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">Brutto</label>
                              <input type="number" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-center" step="0.01" min="0"
                                value={item.unitPriceGross || ''} onChange={e => updateItemGross(index, parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-400">VAT</label>
                              <select className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                                value={item.vatRate} onChange={e => {
                                  const vat = parseInt(e.target.value);
                                  setItems(prev => prev.map((it, i) => i === index ? { ...it, vatRate: vat, unitPriceGross: netToGross(it.unitPriceNet, vat) } : it));
                                }}>
                                <option value={8}>8%</option>
                                <option value={23}>23%</option>
                                <option value={0}>0%</option>
                              </select>
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-right text-gray-400">
                            = {round2(item.unitPriceNet * item.quantity).toFixed(2)} netto / {round2(item.unitPriceGross * item.quantity).toFixed(2)} brutto
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totals + Payment + Submit */}
                <div className="border-t bg-gray-50 p-3 space-y-3 rounded-br-xl">
                  {/* Totals */}
                  {items.length > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <div className="text-gray-500">
                        Netto: <span className="font-medium text-gray-700">{round2(subtotalNet).toFixed(2)} zl</span>
                        <span className="mx-2">|</span>
                        VAT: <span className="font-medium text-gray-700">{round2(totalVat).toFixed(2)} zl</span>
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        {totalGross.toFixed(2)} zl
                      </div>
                    </div>
                  )}

                  {/* Payment */}
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setSelectedPayment('cash')}
                      className={`py-2.5 rounded-lg font-medium text-sm border-2 transition-all ${selectedPayment === 'cash' ? 'bg-green-500 border-green-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-green-300'}`}>
                      Gotowka
                    </button>
                    <button type="button" onClick={() => setSelectedPayment('card')}
                      className={`py-2.5 rounded-lg font-medium text-sm border-2 transition-all ${selectedPayment === 'card' ? 'bg-blue-500 border-blue-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'}`}>
                      Karta
                    </button>
                    <button type="button" onClick={() => setSelectedPayment('transfer')}
                      className={`py-2.5 rounded-lg font-medium text-sm border-2 transition-all ${selectedPayment === 'transfer' ? 'bg-purple-500 border-purple-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                      Przelew
                    </button>
                  </div>

                  {/* Transfer days */}
                  {selectedPayment === 'transfer' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Termin:</span>
                      {[7, 14, 21, 30].map(d => (
                        <button key={d} type="button" onClick={() => setTransferDays(d)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${transferDays === d ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300'}`}>
                          {d} dni
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Error */}
                  {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

                  {/* Submit */}
                  <button onClick={handleSubmit} disabled={!canSubmit || submitting}
                    className="w-full py-3 bg-rose-600 text-white rounded-lg font-bold text-base hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {submitting ? 'Tworzenie faktury...' : 'Wystaw fakture'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {successData && (
        <InvoiceSuccessModal
          invoiceId={successData.id}
          invoiceNumber={successData.number}
          customerEmail={successData.email}
          onClose={handleSuccessClose}
          onPrint={handlePrint}
          onEmail={handleEmail}
        />
      )}
    </>
  );
}
