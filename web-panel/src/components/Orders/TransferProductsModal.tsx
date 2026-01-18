import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Order, OrderWithItems, OrderItem, Customer } from '../../types';

interface TransferProductsModalProps {
  sourceOrder: OrderWithItems;
  onClose: () => void;
  onSuccess: () => void;
}

interface TransferItem {
  orderItem: OrderItem;
  transferQuantity: number;
  maxQuantity: number;
}

export function TransferProductsModal({ sourceOrder, onClose, onSuccess }: TransferProductsModalProps) {
  const [targetOrders, setTargetOrders] = useState<Order[]>([]);
  const [selectedTargetOrderId, setSelectedTargetOrderId] = useState<number | null>(null);
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDifferentCustomerWarning, setShowDifferentCustomerWarning] = useState(false);

  // New order creation states
  const [showNewOrderForm, setShowNewOrderForm] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Customer autocomplete states
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get source order customer ID
  const sourceCustomerId = sourceOrder.customerId;

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch target orders
        const ordersData = await api.getOrders({});
        const validOrders = ordersData.orders.filter(
          (order) =>
            order.id !== sourceOrder.id &&
            order.status !== 'completed' &&
            order.status !== 'cancelled'
        );
        setTargetOrders(validOrders);

        // Fetch customers for new order creation
        const customersData = await api.getCustomers();
        setCustomers(customersData.customers || []);

        // Pre-select source order's customer
        setSelectedCustomerId(sourceCustomerId || null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Błąd podczas ładowania danych');
      }
    };

    fetchData();

    // Initialize transfer items with all products from source order
    if (sourceOrder.items) {
      setTransferItems(
        sourceOrder.items.map((item) => ({
          orderItem: item,
          transferQuantity: 0,
          maxQuantity: item.quantity,
        }))
      );
    }
  }, [sourceOrder, sourceCustomerId]);

  // Check if selected target order has different customer
  useEffect(() => {
    if (selectedTargetOrderId) {
      const targetOrder = targetOrders.find(o => o.id === selectedTargetOrderId);
      if (targetOrder && targetOrder.customerId !== sourceCustomerId) {
        setShowDifferentCustomerWarning(true);
      } else {
        setShowDifferentCustomerWarning(false);
      }
    } else {
      setShowDifferentCustomerWarning(false);
    }
  }, [selectedTargetOrderId, targetOrders, sourceCustomerId]);

  const updateTransferQuantity = (index: number, quantity: number) => {
    const newTransferItems = [...transferItems];
    const maxQty = newTransferItems[index].maxQuantity;
    newTransferItems[index].transferQuantity = Math.max(0, Math.min(quantity, maxQty));
    setTransferItems(newTransferItems);
  };

  const handleCreateNewOrder = async () => {
    if (!selectedCustomerId) {
      setError('Wybierz kontrahenta dla nowego zamówienia');
      return;
    }

    setCreatingOrder(true);
    setError('');

    try {
      // Create new empty order
      const result = await api.createOrder({
        customerId: selectedCustomerId,
        items: [],
        source: 'panel',
      });

      // Refresh orders list
      const ordersData = await api.getOrders({});
      const validOrders = ordersData.orders.filter(
        (order) =>
          order.id !== sourceOrder.id &&
          order.status !== 'completed' &&
          order.status !== 'cancelled'
      );
      setTargetOrders(validOrders);

      // Select the newly created order
      setSelectedTargetOrderId(result.orderId);
      setShowNewOrderForm(false);

    } catch (err: any) {
      console.error('Error creating order:', err);
      setError(err.response?.data?.error || 'Błąd podczas tworzenia zamówienia');
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedTargetOrderId) {
      setError('Wybierz zamówienie docelowe');
      return;
    }

    const itemsToTransfer = transferItems.filter((item) => item.transferQuantity > 0);

    if (itemsToTransfer.length === 0) {
      setError('Wybierz przynajmniej jeden produkt do przeniesienia');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [sourceOrderData, targetOrderData] = await Promise.all([
        api.getOrder(sourceOrder.id),
        api.getOrder(selectedTargetOrderId),
      ]);

      const targetOrder = targetOrders.find(o => o.id === selectedTargetOrderId);
      const isDifferentCustomer = targetOrder?.customerId !== sourceCustomerId;

      const newSourceItems = sourceOrderData.order.items
        .map((item) => {
          const transferItem = itemsToTransfer.find(
            (ti) => ti.orderItem.id === item.id
          );
          if (transferItem) {
            const remainingQty = item.quantity - transferItem.transferQuantity;
            if (remainingQty > 0) {
              const unitsPerPallet = item.unitsPerPallet || 1;
              const newPalletCount = Math.floor(remainingQty / unitsPerPallet);
              return {
                productId: item.productId!,
                quantity: remainingQty,
                unitPriceGross: item.unitPriceGross,
                palletCount: newPalletCount,
                unitsPerPallet: item.unitsPerPallet,
              };
            }
            return null;
          }
          return {
            productId: item.productId!,
            quantity: item.quantity,
            unitPriceGross: item.unitPriceGross,
            palletCount: item.palletCount,
            unitsPerPallet: item.unitsPerPallet,
          };
        })
        .filter((item) => item !== null);

      const existingTargetItems = targetOrderData.order.items.map((item) => ({
        productId: item.productId!,
        quantity: item.quantity,
        unitPriceGross: item.unitPriceGross,
        palletCount: item.palletCount,
        unitsPerPallet: item.unitsPerPallet,
      }));

      const newTargetItems = [...existingTargetItems];

      itemsToTransfer.forEach((transferItem) => {
        const existingItemIndex = newTargetItems.findIndex(
          (item) => item.productId === transferItem.orderItem.productId
        );

        if (existingItemIndex >= 0) {
          const existingItem = newTargetItems[existingItemIndex];
          const newQuantity = existingItem.quantity + transferItem.transferQuantity;
          const unitsPerPallet = existingItem.unitsPerPallet || transferItem.orderItem.unitsPerPallet || 1;
          newTargetItems[existingItemIndex] = {
            ...existingItem,
            quantity: newQuantity,
            palletCount: Math.floor(newQuantity / unitsPerPallet),
          };
        } else {
          const unitsPerPallet = transferItem.orderItem.unitsPerPallet || 1;
          const newItem: any = {
            productId: transferItem.orderItem.productId!,
            quantity: transferItem.transferQuantity,
            palletCount: Math.floor(transferItem.transferQuantity / unitsPerPallet),
            unitsPerPallet: unitsPerPallet,
          };

          if (!isDifferentCustomer) {
            newItem.unitPriceGross = transferItem.orderItem.unitPriceGross;
          }

          newTargetItems.push(newItem);
        }
      });

      if (newSourceItems.length > 0) {
        await api.updateOrder(sourceOrder.id, { items: newSourceItems });
      }
      await api.updateOrder(selectedTargetOrderId, { items: newTargetItems });

      if (newSourceItems.length === 0) {
        await api.cancelOrder(
          sourceOrder.id,
          'Wszystkie produkty zostały przeniesione do innego zamówienia'
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Transfer error:', err);
      setError(err.response?.data?.error || err.message || 'Błąd podczas przenoszenia produktów');
    } finally {
      setLoading(false);
    }
  };

  const getTotalTransferredItems = () => {
    return transferItems.reduce((sum, item) => sum + item.transferQuantity, 0);
  };

  const sameCustomerOrders = targetOrders.filter(o => o.customerId === sourceCustomerId);
  const differentCustomerOrders = targetOrders.filter(o => o.customerId !== sourceCustomerId);

  // Filter customers based on search query
  const filteredCustomers = customerSearchQuery.length >= 2
    ? customers.filter((customer) => {
        const query = String(customerSearchQuery).toLowerCase();
        const companyName = String(customer.companyName ?? '').toLowerCase();
        const firstName = String(customer.firstName ?? '').toLowerCase();
        const lastName = String(customer.lastName ?? '').toLowerCase();
        const nip = String(customer.nip ?? '').toLowerCase();
        const code = String(customer.customerCode ?? '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();

        return (
          companyName.includes(query) ||
          fullName.includes(query) ||
          firstName.includes(query) ||
          lastName.includes(query) ||
          nip.includes(query) ||
          code.includes(query)
        );
      })
    : [];

  // Handle customer selection from autocomplete
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearchQuery(getCustomerDisplayName(customer));
    setShowCustomerDropdown(false);
    setHighlightedIndex(-1);
  };

  // Handle keyboard navigation in autocomplete
  const handleCustomerInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showCustomerDropdown || filteredCustomers.length === 0) {
      if (e.key === 'ArrowDown' && customerSearchQuery.length >= 2) {
        setShowCustomerDropdown(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredCustomers.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredCustomers.length) {
          handleSelectCustomer(filteredCustomers[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowCustomerDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        customerInputRef.current &&
        !customerInputRef.current.contains(event.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCustomerDisplayName = (customer: Customer) => {
    const companyName = customer.companyName ? String(customer.companyName) : '';
    const code = customer.customerCode ? String(customer.customerCode) : '';

    if (companyName) {
      return code ? `[${code}] ${companyName}` : companyName;
    }
    const firstName = customer.firstName ? String(customer.firstName) : '';
    const lastName = customer.lastName ? String(customer.lastName) : '';
    const name = `${firstName} ${lastName}`.trim();
    return code ? `[${code}] ${name}` : name;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Przenies produkty - {sourceOrder.orderNumber}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zamówienie docelowe <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select
                className="input flex-1"
                value={selectedTargetOrderId || ''}
                onChange={(e) => setSelectedTargetOrderId(parseInt(e.target.value))}
                disabled={showNewOrderForm}
              >
                <option value="">-- Wybierz zamówienie docelowe --</option>
                {sameCustomerOrders.length > 0 && (
                  <optgroup label="Ten sam kontrahent">
                    {sameCustomerOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNumber} - {order.customerName || 'Brak klienta'} (
                        {order.totalAmount?.toFixed(2) || '0.00'} PLN)
                      </option>
                    ))}
                  </optgroup>
                )}
                {differentCustomerOrders.length > 0 && (
                  <optgroup label="Inny kontrahent">
                    {differentCustomerOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNumber} - {order.customerName || 'Brak klienta'} (
                        {order.totalAmount?.toFixed(2) || '0.00'} PLN)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                type="button"
                onClick={() => setShowNewOrderForm(!showNewOrderForm)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  showNewOrderForm
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {showNewOrderForm ? 'Anuluj' : '+ Nowe'}
              </button>
            </div>

            {showNewOrderForm && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-sm font-semibold text-green-800 mb-3">
                  Utwórz nowe zamówienie
                </h4>
                <div className="flex gap-2">
                  {/* Customer Autocomplete */}
                  <div className="relative flex-1">
                    <input
                      ref={customerInputRef}
                      type="text"
                      className="input w-full"
                      placeholder="Wpisz nazwe kontrahenta, NIP lub kod..."
                      value={customerSearchQuery}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCustomerSearchQuery(value);
                        setShowCustomerDropdown(value.length >= 2);
                        setHighlightedIndex(-1);
                        if (value.length < 2) {
                          setSelectedCustomerId(null);
                        }
                      }}
                      onFocus={() => {
                        if (customerSearchQuery.length >= 2) {
                          setShowCustomerDropdown(true);
                        }
                      }}
                      onKeyDown={handleCustomerInputKeyDown}
                    />
                    {selectedCustomerId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomerId(null);
                          setCustomerSearchQuery('');
                          setShowCustomerDropdown(false);
                          customerInputRef.current?.focus();
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    )}
                    {showCustomerDropdown && filteredCustomers.length > 0 && (
                      <div
                        ref={dropdownRef}
                        className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                      >
                        {filteredCustomers.slice(0, 20).map((customer, index) => (
                          <div
                            key={customer.id}
                            onClick={() => handleSelectCustomer(customer)}
                            className={`px-4 py-2 cursor-pointer ${
                              index === highlightedIndex
                                ? 'bg-blue-100 text-blue-900'
                                : 'hover:bg-gray-100'
                            } ${selectedCustomerId === customer.id ? 'bg-green-50' : ''}`}
                          >
                            <div className="font-medium">
                              {customer.companyName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim()}
                            </div>
                            <div className="text-xs text-gray-500 flex gap-2">
                              {customer.customerCode && <span>[{customer.customerCode}]</span>}
                              {customer.nip && <span>NIP: {customer.nip}</span>}
                              {customer.city && <span>{customer.city}</span>}
                            </div>
                          </div>
                        ))}
                        {filteredCustomers.length > 20 && (
                          <div className="px-4 py-2 text-xs text-gray-500 text-center border-t">
                            Wyświetlono 20 z {filteredCustomers.length} wynikow. Zawez wyszukiwanie.
                          </div>
                        )}
                      </div>
                    )}
                    {showCustomerDropdown && customerSearchQuery.length >= 2 && filteredCustomers.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                        Nie znaleziono kontrahentów
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateNewOrder}
                    disabled={creatingOrder || !selectedCustomerId}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {creatingOrder ? 'Tworzenie...' : 'Utworz'}
                  </button>
                </div>
                {customerSearchQuery.length > 0 && customerSearchQuery.length < 2 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Wpisz min. 2 znaki, aby wyszukac kontrahenta
                  </p>
                )}
                {selectedCustomerId === sourceCustomerId && (
                  <p className="text-xs text-green-700 mt-2">
                    Ten sam kontrahent co zamówienie źródłowe - ceny zostana zachowane.
                  </p>
                )}
                {selectedCustomerId && selectedCustomerId !== sourceCustomerId && (
                  <p className="text-xs text-yellow-700 mt-2">
                    Inny kontrahent - ceny zostana dostosowane do jego grupy cenowej.
                  </p>
                )}
              </div>
            )}

            {targetOrders.length === 0 && !showNewOrderForm && (
              <p className="text-sm text-gray-500 mt-2">
                Brak dostępnych zamówień docelowych. Kliknij "+ Nowe" aby utworzyć nowe zamówienie.
              </p>
            )}
          </div>

          {showDifferentCustomerWarning && (
            <div className="bg-yellow-50 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-6">
              <strong>Uwaga:</strong> Wybrane zamówienie docelowe należy do innego kontrahenta.
              Ceny produktów zostana dostosowane do grupy cenowej nowego kontrahenta.
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Produkty do przeniesienia
            </h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th className="text-center">Dostepna ilosc</th>
                    <th className="text-center">Ile przeniesc</th>
                    <th className="text-right">Cena jedn.</th>
                  </tr>
                </thead>
                <tbody>
                  {transferItems.map((item, index) => (
                    <tr key={item.orderItem.id}>
                      <td>
                        <div>
                          {item.orderItem.productSnapshot?.plantName ||
                           item.orderItem.productName ||
                           `Produkt #${item.orderItem.productId}`}
                        </div>
                        {item.orderItem.productSnapshot?.potSize && (
                          <div className="text-xs text-gray-500">
                            {item.orderItem.productSnapshot.potSize}
                            {item.orderItem.productSnapshot.plantHeightCm &&
                              ` / ${item.orderItem.productSnapshot.plantHeightCm}cm`}
                          </div>
                        )}
                      </td>
                      <td className="text-center font-semibold">{item.maxQuantity} szt.</td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateTransferQuantity(index, item.transferQuantity - 1)
                            }
                            className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                            disabled={item.transferQuantity === 0}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            className="input text-center w-20"
                            min="0"
                            max={item.maxQuantity}
                            value={item.transferQuantity}
                            onChange={(e) =>
                              updateTransferQuantity(index, parseInt(e.target.value) || 0)
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateTransferQuantity(index, item.transferQuantity + 1)
                            }
                            className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                            disabled={item.transferQuantity >= item.maxQuantity}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => updateTransferQuantity(index, item.maxQuantity)}
                            className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm"
                          >
                            Wszystko
                          </button>
                        </div>
                      </td>
                      <td className="text-right">
                        {(item.orderItem.unitPriceGross || 0).toFixed(2)} PLN
                        {showDifferentCustomerWarning && (
                          <div className="text-xs text-yellow-600">
                            (cena zmieni sie)
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {getTotalTransferredItems() > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-blue-900 font-semibold">
                  Laczna ilosc do przeniesienia:
                </span>
                <span className="text-blue-900 text-xl font-bold">
                  {getTotalTransferredItems()} szt.
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleTransfer}
              disabled={loading || !selectedTargetOrderId || getTotalTransferredItems() === 0}
              className="btn btn-primary flex-1"
            >
              {loading ? 'Przenoszenie...' : 'Przenies produkty'}
            </button>
            <button onClick={onClose} className="btn btn-secondary flex-1">
              Anuluj
            </button>
          </div>

          {getTotalTransferredItems() === transferItems.reduce((sum, item) => sum + item.maxQuantity, 0) &&
            getTotalTransferredItems() > 0 && (
              <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3 mt-4">
                <strong>Uwaga:</strong> Przenosisz wszystkie produkty z tego zamówienia. Zamówienie źródłowe zostanie automatycznie anulowane.
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
