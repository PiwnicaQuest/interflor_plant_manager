import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { OrderWithItems, OrderStatus, PaymentMethod, DocumentType, PaymentSplit } from '../types';
import { PaymentSplitModal } from '../components/POS/PaymentSplitModal';
import { CashPaymentModal } from '../components/POS/CashPaymentModal';

// Helper function to safely format numbers
const formatPrice = (value: number | string | null | undefined): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Number(num) || 0).toFixed(2);
};

export function POSPage() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.RECEIPT);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false);
  const [showCashPaymentModal, setShowCashPaymentModal] = useState(false);

  const fetchReadyOrders = async () => {
    try {
      setLoading(true);
      const data = await api.getOrders({ status: OrderStatus.READY_FOR_PICKUP });

      // Fetch full details for each order
      const ordersWithItems = await Promise.all(
        data.orders.map(async (order) => {
          const detailData = await api.getOrder(order.id);
          return detailData.order;
        })
      );

      setOrders(ordersWithItems);

      // Auto-select first order if none selected
      if (!selectedOrder && ordersWithItems.length > 0) {
        setSelectedOrder(ordersWithItems[0]);
      }
    } catch (err) {
      console.error('Error fetching ready orders:', err);
      setError('Błąd podczas ładowania zamówień');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReadyOrders();
    // Refresh every 30 seconds
    const interval = setInterval(fetchReadyOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCheckout = async (paymentMethod: PaymentMethod) => {
    if (!selectedOrder) return;

    try {
      setProcessing(true);
      setError('');
      setSuccess('');

      const result = await api.checkout({
        orderId: selectedOrder.id,
        paymentMethod,
        documentType,
      });

      setSuccess(
        `Płatność zakończona! ${result.documentType === 'invoice' ? 'Faktura' : 'Paragon'} ${result.documentNumber} - ${formatPrice(result.totalAmount)} PLN`
      );

      // Refresh orders list
      await fetchReadyOrders();

      // Clear selection
      setSelectedOrder(null);

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || 'Błąd podczas realizacji płatności');
    } finally {
      setProcessing(false);
    }
  };

  const handleSplitPayment = () => {
    setShowSplitPaymentModal(true);
  };

  const handleSplitPaymentConfirm = async (splits: PaymentSplit[]) => {
    if (!selectedOrder) return;

    try {
      setProcessing(true);
      setError('');
      setSuccess('');
      setShowSplitPaymentModal(false);

      const result = await api.checkout({
        orderId: selectedOrder.id,
        paymentSplits: splits,
        documentType,
      });

      // Create success message with split details
      const splitDetails = splits
        .map(s => {
          const method = s.paymentMethod === 'card' ? 'Karta' : s.paymentMethod === 'cash' ? 'Gotówka' : 'Przelew';
          return `${method}: ${formatPrice(s.amount)} PLN`;
        })
        .join(', ');

      setSuccess(
        `Płatność zakończona! ${result.documentType === 'invoice' ? 'Faktura' : 'Paragon'} ${result.documentNumber} - ${formatPrice(result.totalAmount)} PLN (${splitDetails})`
      );

      // Refresh orders list
      await fetchReadyOrders();

      // Clear selection
      setSelectedOrder(null);

      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || 'Błąd podczas realizacji płatności');
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="dark">
      <div className="min-h-screen bg-gray-900 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">POS / Kasa</h1>
            <div className="text-sm text-gray-400">
              {orders.length} zamówień gotowych
            </div>
          </div>

          {error && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded mb-4">
              {success}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Orders List */}
            <div className="lg:col-span-1">
              <div className="bg-gray-800 rounded-lg border border-gray-700">
                <div className="p-4 border-b border-gray-700">
                  <h2 className="text-xl font-semibold text-white">
                    Zamówienia gotowe
                  </h2>
                </div>
                <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                  {loading ? (
                    <div className="p-8 text-center text-gray-400">
                      Ładowanie...
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                      Brak zamówień do realizacji
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-700">
                      {orders.map((order) => (
                        <button
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                          className={`w-full text-left p-4 hover:bg-gray-700 transition-colors ${
                            selectedOrder?.id === order.id ? 'bg-gray-700' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-white text-lg">
                              {order.orderNumber}
                            </span>
                            <span className="text-green-400 font-bold">
                              {formatPrice(order.totalAmount)} PLN
                            </span>
                          </div>
                          <div className="text-sm text-gray-300">
                            {order.customerName || 'Brak klienta'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatDate(order.createdAt)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Order Details & Checkout */}
            <div className="lg:col-span-2 space-y-6">
              {selectedOrder ? (
                <>
                  {/* Order Details */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h2 className="text-2xl font-bold text-white mb-1">
                          {selectedOrder.orderNumber}
                        </h2>
                        <p className="text-gray-400">
                          {selectedOrder.customerName || 'Brak klienta'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Do zapłaty</div>
                        <div className="text-3xl font-bold text-green-400">
                          {formatPrice(selectedOrder.totalAmount)} PLN
                        </div>
                      </div>
                    </div>

                    {/* Products */}
                    <div className="bg-gray-900 rounded-lg p-4 mb-6">
                      <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase">
                        Produkty
                      </h3>
                      <div className="space-y-2">
                        {selectedOrder.items && selectedOrder.items.length > 0 ? (
                          selectedOrder.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between text-white"
                            >
                              <div className="flex-1">
                                <span className="font-medium">
                                  {item.productName || `Produkt #${item.productId}`}
                                </span>
                                <span className="text-gray-400 ml-2">
                                  x {item.quantity}
                                </span>
                              </div>
                              <div className="font-semibold">
                                {formatPrice(item.totalPrice)} PLN
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500">Brak produktów</p>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    {selectedOrder.customerNotes && (
                      <div className="bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg p-3 mb-4">
                        <div className="text-xs text-blue-400 font-semibold mb-1">
                          NOTATKA KLIENTA
                        </div>
                        <div className="text-sm text-blue-200">
                          {selectedOrder.customerNotes}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Document Type Selection */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Rodzaj dokumentu
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setDocumentType(DocumentType.RECEIPT)}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          documentType === DocumentType.RECEIPT
                            ? 'border-green-500 bg-green-900 bg-opacity-30'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-center">
                          <div className="text-2xl mb-2">🧾</div>
                          <div className="text-white font-semibold">Paragon</div>
                          <div className="text-xs text-gray-400 mt-1">
                            Szybka sprzedaż
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => setDocumentType(DocumentType.INVOICE)}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          documentType === DocumentType.INVOICE
                            ? 'border-green-500 bg-green-900 bg-opacity-30'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="text-center">
                          <div className="text-2xl mb-2">📄</div>
                          <div className="text-white font-semibold">Faktura</div>
                          <div className="text-xs text-gray-400 mt-1">
                            Z danymi firmy
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Payment Methods */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Metoda płatności
                    </h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => handleCheckout(PaymentMethod.CARD)}
                        disabled={processing}
                        className="w-full py-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-2xl font-bold rounded-lg transition-colors flex items-center justify-center gap-3"
                      >
                        <span>💳</span>
                        <span>KARTA</span>
                      </button>
                      <button
                        onClick={() => setShowCashPaymentModal(true)}
                        disabled={processing}
                        className="w-full py-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-2xl font-bold rounded-lg transition-colors flex items-center justify-center gap-3"
                      >
                        <span>💵</span>
                        <span>GOTÓWKA</span>
                      </button>
                      <button
                        onClick={() => handleCheckout(PaymentMethod.TRANSFER)}
                        disabled={processing}
                        className="w-full py-6 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-2xl font-bold rounded-lg transition-colors flex items-center justify-center gap-3"
                      >
                        <span>🏦</span>
                        <span>PRZELEW</span>
                      </button>

                      {/* Split Payment Button */}
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-600"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                          <span className="px-2 bg-gray-800 text-gray-400">lub</span>
                        </div>
                      </div>

                      <button
                        onClick={handleSplitPayment}
                        disabled={processing}
                        className="w-full py-6 bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white text-2xl font-bold rounded-lg transition-colors flex items-center justify-center gap-3 border-2 border-yellow-400"
                      >
                        <span>💰</span>
                        <span>PODZIAŁ PŁATNOŚCI</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-12 text-center">
                  <div className="text-6xl mb-4">📦</div>
                  <p className="text-xl text-gray-400">
                    Wybierz zamówienie z listy
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Split Payment Modal */}
      {showSplitPaymentModal && selectedOrder && (
        <PaymentSplitModal
          totalAmount={selectedOrder.totalAmount ?? 0}
          onConfirm={handleSplitPaymentConfirm}
          onCancel={() => setShowSplitPaymentModal(false)}
        />
      )}

      {/* Cash Payment Modal */}
      {showCashPaymentModal && selectedOrder && (
        <CashPaymentModal
          totalAmount={selectedOrder.totalAmount ?? 0}
          onConfirm={() => {
            setShowCashPaymentModal(false);
            handleCheckout(PaymentMethod.CASH);
          }}
          onCancel={() => setShowCashPaymentModal(false)}
        />
      )}
    </div>
  );
}
