import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { OrderWithItems, OrderStatus, PaymentMethod, DocumentType, PaymentSplit, CompletedOrderSummary, TodaySummary } from '../types';
import { PaymentSplitModal } from '../components/POS/PaymentSplitModal';
import { CashPaymentModal } from '../components/POS/CashPaymentModal';
import { PaymentSuccessModal } from '../components/POS/PaymentSuccessModal';
import { TransferPaymentModal } from '../components/POS/TransferPaymentModal';
import { CardPaymentModal } from '../components/POS/CardPaymentModal';
import { usePrint } from '../hooks/usePrint';

// Helper function to safely format numbers
const formatPrice = (value: number | string | null | undefined): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Number(num) || 0).toFixed(2);
};

interface CheckoutResult {
  documentType: 'invoice' | 'receipt' | 'proforma';
  customerHasEmail?: boolean;
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
  const [showCardPaymentModal, setShowCardPaymentModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Print Agent hook
  const { printInvoice, printReceipt } = usePrint({
    onError: (error) => {
      console.error("Print error:", error);
      setError("Błąd drukowania: " + error);
    },
    onQueued: (jobId) => {
      console.log("Print job queued:", jobId);
    },
  });

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

  // Check if user is actively working (modal open or processing)
  const isActivelyWorking = processing ||
    showCashPaymentModal ||
    showCardPaymentModal ||
    showTransferModal ||
    showSplitPaymentModal ||
    showSuccessModal;

  useEffect(() => {
    // Initial fetch
    fetchReadyOrders();
    fetchTodayCompleted();
  }, []);

  useEffect(() => {
    // Auto-refresh every 30 seconds, but only when NOT actively working
    // This prevents orders from jumping/changing during payment processing
    if (isActivelyWorking) {
      return; // Don't set up interval when actively working
    }

    const interval = setInterval(() => {
      fetchReadyOrders();
      fetchTodayCompleted();
    }, 30000);

    return () => clearInterval(interval);
  }, [isActivelyWorking]);

  const handleCheckout = async (paymentMethod?: PaymentMethod, receivedAmount?: number, paymentDeadlineDays?: number) => {
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
      const methodLabel = paymentMethod === 'card' ? 'Karta' : paymentMethod === 'cash' ? 'Gotówka' : paymentMethod === 'transfer' ? 'Przelew' : undefined;

      setCheckoutResult({
        documentType: result.documentType as 'invoice' | 'receipt' | 'proforma',
        documentNumber: result.documentNumber,
        documentId: result.documentId,
        totalAmount: result.totalAmount,
        customerHasEmail: !!selectedOrder?.customerId,
        paymentDetails: methodLabel ? `${methodLabel}: ${formatPrice(result.totalAmount)} PLN` : undefined,
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

  const handleProformaGenerate = () => {
    handleCheckout(); // No payment method for proforma
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
        customerHasEmail: !!selectedOrder?.customerId,
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

  const handleCardPaymentConfirm = () => {
    setShowCardPaymentModal(false);
    handleCheckout(PaymentMethod.CARD);
  };

  const handlePrint = async () => {
    if (!checkoutResult) return;

    try {
      setPrintLoading(true);
      setError('');

      let html: string;
      if (checkoutResult.documentType === 'invoice') {
        html = await api.getInvoiceHtml(checkoutResult.documentId);
        await printInvoice(html, {
          title: `Faktura ${checkoutResult.documentNumber}`,
          invoiceId: checkoutResult.documentId,
        });
      } else if (checkoutResult.documentType === 'proforma') {
        html = await api.getProformaHtml(checkoutResult.documentId);
        await printInvoice(html, {
          title: `Proforma ${checkoutResult.documentNumber}`,
          invoiceId: checkoutResult.documentId,
        });
      } else {
        html = await api.getReceiptHtml(checkoutResult.documentId);
        await printReceipt(html, {
          title: `Paragon ${checkoutResult.documentNumber}`,
        });
      }
    } catch (err: any) {
      console.error('Print error:', err);
      setError(err.message || 'Błąd drukowania');
    } finally {
      setPrintLoading(false);
    }
  };

  const handleViewDocument = () => {
    if (!checkoutResult) return;

    let viewUrl: string;
    if (checkoutResult.documentType === 'invoice') {
      viewUrl = `/print/invoice/${checkoutResult.documentId}`;
    } else if (checkoutResult.documentType === 'proforma') {
      viewUrl = `/print/proforma/${checkoutResult.documentId}`;
    } else {
      viewUrl = `/print/receipt/${checkoutResult.documentId}`;
    }

    window.open(viewUrl, '_blank');
  };

  const handleSendEmail = async () => {
    if (!checkoutResult || checkoutResult.documentType !== 'invoice') return;
    await api.sendInvoiceEmail(checkoutResult.documentId);
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setCheckoutResult(null);
    setCashReceived(0);
  };

  const handleHistoryPrint = async (order: CompletedOrderSummary) => {
    if (!order.document) return;

    try {
      setPrintLoading(true);
      setError('');

      let html: string;
      if (order.document.type === 'invoice') {
        html = await api.getInvoiceHtml(order.document.id);
        await printInvoice(html, {
          title: `Faktura ${order.document.number}`,
          invoiceId: order.document.id,
        });
      } else if (order.document.type === 'proforma') {
        html = await api.getProformaHtml(order.document.id);
        await printInvoice(html, {
          title: `Proforma ${order.document.number}`,
          invoiceId: order.document.id,
        });
      } else {
        html = await api.getReceiptHtml(order.document.id);
        await printReceipt(html, {
          title: `Paragon ${order.document.number}`,
        });
      }
    } catch (err: any) {
      console.error('Print error:', err);
      setError(err.message || 'Błąd drukowania');
    } finally {
      setPrintLoading(false);
    }
  };

  const handleHistoryView = (order: CompletedOrderSummary) => {
    if (!order.document) return;
    let viewUrl: string;
    if (order.document.type === 'invoice') {
      viewUrl = `/print/invoice/${order.document.id}`;
    } else if (order.document.type === 'proforma') {
      viewUrl = `/print/proforma/${order.document.id}`;
    } else {
      viewUrl = `/print/receipt/${order.document.id}`;
    }
    window.open(viewUrl, '_blank');
  };



  const handleDownloadDailyReport = async () => {
    setDownloadingReport(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const blob = await api.downloadDailyReportPDF(today);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raport-dobowy-${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error downloading report:', err);
      setError('Nie udało się pobrać raportu dobowego');
    } finally {
      setDownloadingReport(false);
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

  const getDocumentLabel = (type: 'invoice' | 'receipt' | 'proforma'): string => {
    if (type === 'invoice') return 'FV';
    if (type === 'proforma') return 'PF';
    return 'PAR';
  };

  // Filter orders based on search query
  const filteredOrders = orders.filter(order => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (order.customerName?.toLowerCase().includes(query)) ||
      (order.orderNumber?.toLowerCase().includes(query)) ||
      ((order as any).customerCode?.toLowerCase().includes(query))
    );
  });

  const filteredCompletedOrders = completedOrders.filter(order => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (order.customerName?.toLowerCase().includes(query)) ||
      (order.orderNumber?.toLowerCase().includes(query)) ||
      (order.customerCode?.toLowerCase().includes(query))
    );
  });


  return (
    <div className="p-4 bg-gray-50 min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-gray-900">POS / Kasa</h1>
          <div className="text-sm text-gray-500">
            {filteredOrders.length} zamówień gotowych
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Szukaj kontrahenta lub zamówienia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
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
            Do rozliczenia ({filteredOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'history'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Historia dnia ({filteredCompletedOrders.length})
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
                    Zamówienia gotowe do odbióru
                  </h2>
                </div>
                <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                  {loading ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      Ładowanie...
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      Brak zamówień do realizacji
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredOrders.map((order) => (
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
                        {selectedOrder.customerId && (
                          <button
                            onClick={() => setDocumentType(DocumentType.PROFORMA)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                              documentType === DocumentType.PROFORMA
                                ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-300'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            Pro Forma
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Payment Methods - Grid (hidden for PROFORMA) */}
                    {documentType === DocumentType.PROFORMA ? (
                      <button
                        onClick={handleProformaGenerate}
                        disabled={processing}
                        className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <span>{processing ? 'Generowanie...' : 'Generuj Pro Formę'}</span>
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setShowCardPaymentModal(true)}
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
                    )}
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
                  Rozliczone dziś ({filteredCompletedOrders.length})
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
                ) : filteredCompletedOrders.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    Brak rozliczonych zamówień dziś
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredCompletedOrders.map((order) => (
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
                                    : order.document.type === 'proforma'
                                    ? 'bg-violet-100 text-violet-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {getDocumentLabel(order.document.type as 'invoice' | 'receipt' | 'proforma')}
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
            {todaySummary && (<>
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


            {/* Daily Report Button */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleDownloadDailyReport}
                disabled={downloadingReport}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors shadow-sm"
              >
                {downloadingReport ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Generowanie...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Pobierz raport dobowy (PDF)</span>
                  </>
                )}
              </button>
            </div>
            </>)}
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

      {/* Card Payment Modal */}
      {showCardPaymentModal && selectedOrder && (
        <CardPaymentModal
          totalAmount={selectedOrder.totalAmount ?? 0}
          onConfirm={handleCardPaymentConfirm}
          onCancel={() => setShowCardPaymentModal(false)}
          processing={processing}
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
          onSendEmail={handleSendEmail}
          hasCustomerEmail={checkoutResult.customerHasEmail}
        />
      )}
    </div>
  );
}
