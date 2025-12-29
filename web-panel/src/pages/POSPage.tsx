import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { OrderWithItems, OrderStatus, PaymentMethod, DocumentType, PaymentSplit, CompletedOrderSummary, TodaySummary } from '../types';
import { PaymentSplitModal } from '../components/POS/PaymentSplitModal';
import { CashPaymentModal } from '../components/POS/CashPaymentModal';
import { PaymentSuccessModal } from '../components/POS/PaymentSuccessModal';
import { TransferPaymentModal } from '../components/POS/TransferPaymentModal';

// Helper function to safely format numbers
const formatPrice = (value: number | string | null | undefined): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Number(num) || 0).toFixed(2);
};

interface CheckoutResult {
  documentType: 'invoice' | 'receipt';
  documentNumber: string;
  documentId: number;
  totalAmount: number;
  paymentDetails?: string;
  change?: number;
}

type TabType = 'ready' | 'history';

export function POSPage() {
  const [activeTab, setActiveTab] = useState<TabType>('ready');
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [completedOrders, setCompletedOrders] = useState<CompletedOrderSummary[]>([]);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.RECEIPT);
  const [error, setError] = useState('');
  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false);
  const [showCashPaymentModal, setShowCashPaymentModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [cashReceived, setCashReceived] = useState<number>(0);

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

  const fetchTodayCompleted = async () => {
    try {
      setHistoryLoading(true);
      const data = await api.getTodayCompletedOrders();
      setCompletedOrders(data.orders);
      setTodaySummary(data.summary);
    } catch (err) {
      console.error('Error fetching today completed orders:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchReadyOrders();
    fetchTodayCompleted();
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchReadyOrders();
      fetchTodayCompleted();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCheckout = async (paymentMethod: PaymentMethod, receivedAmount?: number, paymentDeadlineDays?: number) => {
    if (!selectedOrder) return;

    try {
      setProcessing(true);
      setError('');

      const result = await api.checkout({
        orderId: selectedOrder.id,
        paymentMethod,
        documentType,
        paymentDeadlineDays,
      });

      // Calculate change for cash payments
      let change: number | undefined;
      if (paymentMethod === PaymentMethod.CASH && receivedAmount) {
        change = receivedAmount - (result.totalAmount || 0);
        if (change < 0) change = undefined;
      }

      // Get payment method label
      const methodLabel = paymentMethod === 'card' ? 'Karta' : paymentMethod === 'cash' ? 'Gotówka' : 'Przelew';

      setCheckoutResult({
        documentType: result.documentType as 'invoice' | 'receipt',
        documentNumber: result.documentNumber,
        documentId: result.documentId,
        totalAmount: result.totalAmount,
        paymentDetails: `${methodLabel}: ${formatPrice(result.totalAmount)} PLN`,
        change,
      });
      setShowSuccessModal(true);

      // Refresh orders list and history
      await fetchReadyOrders();
      await fetchTodayCompleted();

      // Clear selection
      setSelectedOrder(null);
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
      setShowSplitPaymentModal(false);

      const result = await api.checkout({
        orderId: selectedOrder.id,
        paymentSplits: splits,
        documentType,
      });

      // Create payment details string
      const splitDetails = splits
        .map(s => {
          const method = s.paymentMethod === 'card' ? 'Karta' : s.paymentMethod === 'cash' ? 'Gotówka' : 'Przelew';
          return `${method}: ${formatPrice(s.amount)} PLN`;
        })
        .join(', ');

      setCheckoutResult({
        documentType: result.documentType as 'invoice' | 'receipt',
        documentNumber: result.documentNumber,
        documentId: result.documentId,
        totalAmount: result.totalAmount,
        paymentDetails: splitDetails,
      });
      setShowSuccessModal(true);

      // Refresh orders list and history
      await fetchReadyOrders();
      await fetchTodayCompleted();

      // Clear selection
      setSelectedOrder(null);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || 'Błąd podczas realizacji płatności');
    } finally {
      setProcessing(false);
    }
  };

  const handleCashPaymentConfirm = (receivedAmount: number) => {
    setShowCashPaymentModal(false);
    setCashReceived(receivedAmount);
    handleCheckout(PaymentMethod.CASH, receivedAmount);
  };

  const handleTransferConfirm = (paymentDeadlineDays: number) => {
    setShowTransferModal(false);
    handleCheckout(PaymentMethod.TRANSFER, undefined, paymentDeadlineDays);
  };

  const handlePrint = () => {
    if (!checkoutResult) return;

    const printUrl = checkoutResult.documentType === 'invoice'
      ? `/print/invoice/${checkoutResult.documentId}`
      : `/print/receipt/${checkoutResult.documentId}`;

    window.open(printUrl, '_blank');
  };

  const handleViewDocument = () => {
    if (!checkoutResult) return;

    const viewUrl = checkoutResult.documentType === 'invoice'
      ? `/print/invoice/${checkoutResult.documentId}`
      : `/print/receipt/${checkoutResult.documentId}`;

    window.open(viewUrl, '_blank');
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setCheckoutResult(null);
    setCashReceived(0);
  };

  const handleHistoryPrint = (order: CompletedOrderSummary) => {
    if (!order.document) return;
    const printUrl = order.document.type === 'invoice'
      ? `/print/invoice/${order.document.id}`
      : `/print/receipt/${order.document.id}`;
    window.open(printUrl, '_blank');
  };

  const handleHistoryView = (order: CompletedOrderSummary) => {
    if (!order.document) return;
    const viewUrl = order.document.type === 'invoice'
      ? `/print/invoice/${order.document.id}`
      : `/print/receipt/${order.document.id}`;
    window.open(viewUrl, '_blank');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPaymentMethodLabel = (order: CompletedOrderSummary): string => {
    if (!order.document) return '-';

    if (order.document.paymentSplits && Array.isArray(order.document.paymentSplits) && order.document.paymentSplits.length > 0) {
      return 'Podzielona';
    }

    switch (order.document.paymentMethod) {
      case 'cash': return 'Gotówka';
      case 'card': return 'Karta';
      case 'transfer': return 'Przelew';
      default: return '-';
    }
  };

  const getDocumentLabel = (type: 'invoice' | 'receipt'): string => {
    return type === 'invoice' ? 'FV' : 'PAR';
  };

  return (
    <div className="p-4 bg-gray-50 min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-gray-900">POS / Kasa</h1>
          <div className="text-sm text-gray-500">
            {orders.length} zamówień gotowych
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('ready')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'ready'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Do rozliczenia ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'history'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Historia dnia ({completedOrders.length})
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-3">
            {error}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'ready' ? (
          /* Ready Orders Tab */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Orders List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-sm font-semibold text-gray-700">
                    Zamówienia gotowe do odbioru
                  </h2>
                </div>
                <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                  {loading ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      Ładowanie...
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      Brak zamówień do realizacji
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {orders.map((order) => (
                        <button
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors ${
                            selectedOrder?.id === order.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-medium text-gray-900 text-sm">
                              {order.orderNumber}
                            </span>
                            <span className="text-green-600 font-semibold text-sm">
                              {formatPrice(order.totalAmount)} PLN
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {order.customerName || 'Brak klienta'}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
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
            <div className="lg:col-span-2 space-y-4">
              {selectedOrder ? (
                <>
                  {/* Order Details */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h2 className="text-lg font-bold text-gray-900">
                          {selectedOrder.orderNumber}
                        </h2>
                        <p className="text-sm text-gray-500">
                          {selectedOrder.customerName || 'Brak klienta'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Do zapłaty</div>
                        <div className="text-xl font-bold text-green-600">
                          {formatPrice(selectedOrder.totalAmount)} PLN
                        </div>
                      </div>
                    </div>

                    {/* Products */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                        Produkty
                      </h3>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {selectedOrder.items && selectedOrder.items.length > 0 ? (
                          selectedOrder.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between text-sm text-gray-700"
                            >
                              <div className="flex-1">
                                <span>
                                  {item.productName || `Produkt #${item.productId}`}
                                </span>
                                <span className="text-gray-400 ml-1">
                                  x{item.quantity}
                                </span>
                              </div>
                              <div className="font-medium">
                                {formatPrice(item.totalPrice)} PLN
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-400 text-sm">Brak produktów</p>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    {selectedOrder.customerNotes && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 text-sm">
                        <div className="text-xs text-blue-600 font-semibold mb-0.5">
                          NOTATKA KLIENTA
                        </div>
                        <div className="text-blue-800 text-sm">
                          {selectedOrder.customerNotes}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Document Type & Payment - Compact Layout */}
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                    {/* Document Type Selection - Inline */}
                    <div className="flex items-center gap-4 mb-4 pb-3 border-b border-gray-100">
                      <span className="text-sm font-medium text-gray-600">Dokument:</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDocumentType(DocumentType.RECEIPT)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            documentType === DocumentType.RECEIPT
                              ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Paragon
                        </button>
                        <button
                          onClick={() => setDocumentType(DocumentType.INVOICE)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            documentType === DocumentType.INVOICE
                              ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Faktura
                        </button>
                      </div>
                    </div>

                    {/* Payment Methods - Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleCheckout(PaymentMethod.CARD)}
                        disabled={processing}
                        className="py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <span>Karta</span>
                      </button>
                      <button
                        onClick={() => setShowCashPaymentModal(true)}
                        disabled={processing}
                        className="py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <span>Gotówka</span>
                      </button>
                      <button
                        onClick={() => setShowTransferModal(true)}
                        disabled={processing}
                        className="py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <span>Przelew</span>
                      </button>
                      <button
                        onClick={handleSplitPayment}
                        disabled={processing}
                        className="py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <span>Podziel płatność</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
                  <div className="text-4xl mb-2 text-gray-300">📦</div>
                  <p className="text-gray-500">
                    Wybierz zamówienie z listy
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* History Tab */
          <div className="space-y-4">
            {/* Completed Orders List */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h2 className="text-sm font-semibold text-gray-700">
                  Rozliczone dziś ({completedOrders.length})
                </h2>
                <button
                  onClick={fetchTodayCompleted}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Odśwież
                </button>
              </div>
              <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
                {historyLoading ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    Ładowanie...
                  </div>
                ) : completedOrders.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    Brak rozliczonych zamówień dziś
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {completedOrders.map((order) => (
                      <div
                        key={order.id}
                        className="px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          {/* Order Number & Customer */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 text-sm">
                                {order.orderNumber}
                              </span>
                              <span className="text-xs text-gray-400">
                                {formatTime(order.completedAt || order.createdAt)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {order.customerName || 'Brak klienta'}
                            </div>
                          </div>

                          {/* Amount */}
                          <div className="text-right">
                            <div className="font-semibold text-green-600 text-sm">
                              {formatPrice(order.totalAmount)} PLN
                            </div>
                          </div>

                          {/* Document */}
                          <div className="text-center min-w-[100px]">
                            {order.document ? (
                              <div className="text-xs">
                                <span className={`inline-block px-1.5 py-0.5 rounded ${
                                  order.document.type === 'invoice'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {getDocumentLabel(order.document.type)}
                                </span>
                                <div className="text-gray-500 mt-0.5 text-[10px]">
                                  {order.document.number}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </div>

                          {/* Payment Method */}
                          <div className="text-center min-w-[70px]">
                            <span className={`text-xs px-2 py-1 rounded ${
                              order.document?.paymentMethod === 'cash' ? 'bg-green-50 text-green-700' :
                              order.document?.paymentMethod === 'card' ? 'bg-blue-50 text-blue-700' :
                              order.document?.paymentMethod === 'transfer' ? 'bg-purple-50 text-purple-700' :
                              'bg-orange-50 text-orange-700'
                            }`}>
                              {getPaymentMethodLabel(order)}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleHistoryView(order)}
                              disabled={!order.document}
                              className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors disabled:opacity-50"
                              title="Podgląd"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleHistoryPrint(order)}
                              disabled={!order.document}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                              title="Drukuj"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Daily Summary */}
            {todaySummary && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Podsumowanie dnia
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Transakcje</div>
                    <div className="text-xl font-bold text-gray-900">
                      {todaySummary.totalTransactions}
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-green-600 mb-1">Gotówka</div>
                    <div className="text-xl font-bold text-green-700">
                      {formatPrice(todaySummary.cashTotal)}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-blue-600 mb-1">Karta</div>
                    <div className="text-xl font-bold text-blue-700">
                      {formatPrice(todaySummary.cardTotal)}
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-purple-600 mb-1">Przelew</div>
                    <div className="text-xl font-bold text-purple-700">
                      {formatPrice(todaySummary.transferTotal)}
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400 mb-1">Łącznie</div>
                    <div className="text-xl font-bold text-white">
                      {formatPrice(todaySummary.grandTotal)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
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
          onConfirm={handleCashPaymentConfirm}
          onCancel={() => setShowCashPaymentModal(false)}
        />
      )}

      {/* Transfer Payment Modal */}
      {showTransferModal && selectedOrder && (
        <TransferPaymentModal
          totalAmount={selectedOrder.totalAmount ?? 0}
          onConfirm={handleTransferConfirm}
          onCancel={() => setShowTransferModal(false)}
        />
      )}

      {/* Payment Success Modal */}
      {showSuccessModal && checkoutResult && (
        <PaymentSuccessModal
          documentType={checkoutResult.documentType}
          documentNumber={checkoutResult.documentNumber}
          documentId={checkoutResult.documentId}
          totalAmount={checkoutResult.totalAmount}
          paymentDetails={checkoutResult.paymentDetails}
          change={checkoutResult.change}
          onClose={handleCloseSuccessModal}
          onPrint={handlePrint}
          onViewDocument={handleViewDocument}
        />
      )}
    </div>
  );
}
