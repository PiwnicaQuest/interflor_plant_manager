import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Order, OrderWithItems, OrderItem } from '../../types';

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

  useEffect(() => {
    const fetchTargetOrders = async () => {
      try {
        // Pobierz tylko zamówienia w statusie pending lub in_progress (nie zakończone/anulowane)
        const data = await api.getOrders({});
        const validOrders = data.orders.filter(
          (order) =>
            order.id !== sourceOrder.id &&
            order.status !== 'completed' &&
            order.status !== 'cancelled'
        );
        setTargetOrders(validOrders);
      } catch (err) {
        console.error('Error fetching target orders:', err);
        setError('Błąd podczas ładowania zamówień docelowych');
      }
    };

    fetchTargetOrders();

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
  }, [sourceOrder]);

  const updateTransferQuantity = (index: number, quantity: number) => {
    const newTransferItems = [...transferItems];
    const maxQty = newTransferItems[index].maxQuantity;
    newTransferItems[index].transferQuantity = Math.max(0, Math.min(quantity, maxQty));
    setTransferItems(newTransferItems);
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
      // Step 1: Get current items from both orders
      const [sourceOrderData, targetOrderData] = await Promise.all([
        api.getOrder(sourceOrder.id),
        api.getOrder(selectedTargetOrderId),
      ]);

      // Step 2: Calculate new items for source order (remove transferred quantities)
      const newSourceItems = sourceOrderData.order.items
        .map((item) => {
          const transferItem = itemsToTransfer.find(
            (ti) => ti.orderItem.id === item.id
          );
          if (transferItem) {
            const remainingQty = item.quantity - transferItem.transferQuantity;
            if (remainingQty > 0) {
              return {
                productId: item.productId!,
                quantity: remainingQty,
              };
            }
            return null; // Remove item if quantity is 0
          }
          return {
            productId: item.productId!,
            quantity: item.quantity,
          };
        })
        .filter((item) => item !== null);

      // Step 3: Calculate new items for target order (add transferred items)
      const existingTargetItems = targetOrderData.order.items.map((item) => ({
        productId: item.productId!,
        quantity: item.quantity,
      }));

      const newTargetItems = [...existingTargetItems];

      itemsToTransfer.forEach((transferItem) => {
        const existingItemIndex = newTargetItems.findIndex(
          (item) => item.productId === transferItem.orderItem.productId
        );

        if (existingItemIndex >= 0) {
          // Product already exists in target order - increase quantity
          newTargetItems[existingItemIndex].quantity += transferItem.transferQuantity;
        } else {
          // Product doesn't exist - add new item
          newTargetItems.push({
            productId: transferItem.orderItem.productId!,
            quantity: transferItem.transferQuantity,
          });
        }
      });

      // Step 4: Update both orders
      await Promise.all([
        newSourceItems.length > 0
          ? api.updateOrder(sourceOrder.id, { items: newSourceItems })
          : Promise.resolve(), // Skip if no items left
        api.updateOrder(selectedTargetOrderId, { items: newTargetItems }),
      ]);

      // Step 5: If source order has no items left, optionally cancel it
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
      setError(err.response?.data?.error || 'Błąd podczas przenoszenia produktów');
    } finally {
      setLoading(false);
    }
  };

  const getTotalTransferredItems = () => {
    return transferItems.reduce((sum, item) => sum + item.transferQuantity, 0);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Przenieś produkty - {sourceOrder.orderNumber}
          </h2>

          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {/* Target Order Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zamówienie docelowe <span className="text-red-500">*</span>
            </label>
            <select
              className="input"
              value={selectedTargetOrderId || ''}
              onChange={(e) => setSelectedTargetOrderId(parseInt(e.target.value))}
            >
              <option value="">-- Wybierz zamówienie docelowe --</option>
              {targetOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} - {order.customerName || 'Brak klienta'} (
                  {order.totalAmount?.toFixed(2) || '0.00'} PLN)
                </option>
              ))}
            </select>
            {targetOrders.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                Brak dostępnych zamówień docelowych. Wszystkie inne zamówienia są zakończone lub anulowane.
              </p>
            )}
          </div>

          {/* Products to Transfer */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Produkty do przeniesienia
            </h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th className="text-center">Dostępna ilość</th>
                    <th className="text-center">Ile przenieść</th>
                    <th className="text-right">Cena jedn.</th>
                  </tr>
                </thead>
                <tbody>
                  {transferItems.map((item, index) => (
                    <tr key={item.orderItem.id}>
                      <td>{item.orderItem.productName || `Produkt #${item.orderItem.productId}`}</td>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          {getTotalTransferredItems() > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-blue-900 font-semibold">
                  Łączna ilość do przeniesienia:
                </span>
                <span className="text-blue-900 text-xl font-bold">
                  {getTotalTransferredItems()} szt.
                </span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleTransfer}
              disabled={loading || !selectedTargetOrderId || getTotalTransferredItems() === 0}
              className="btn btn-primary flex-1"
            >
              {loading ? 'Przenoszenie...' : 'Przenieś produkty'}
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
