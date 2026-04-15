import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api';
import { OrderWithItems, OrderStatus, PaymentMethod, DocumentType, PaymentSplit, CompletedOrderSummary, TodaySummary } from '../../types';
import { usePrint } from '../../hooks/usePrint';

const formatPrice = (value: number | string | null | undefined): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return (Number(num) || 0).toFixed(2);
};

interface CheckoutResult {
  documentType: 'invoice' | 'receipt' | 'proforma';
  documentNumber: string;
  documentId: number;
  totalAmount: number;
  customerHasEmail?: boolean;
  change?: number;
  orderId?: number;
}

type TabType = 'ready' | 'history';

export function ScannerPOSPage() {
  // === Tab State ===
  const [activeTab, setActiveTab] = useState<TabType>('ready');

  // === Data State ===
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [completedOrders, setCompletedOrders] = useState<CompletedOrderSummary[]>([]);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // === Selection State ===
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | null>(null);

  // === Modal/Sheet State ===
  const [showDocTypeSheet, setShowDocTypeSheet] = useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showHistoryActions, setShowHistoryActions] = useState<CompletedOrderSummary | null>(null);
  const [showOrderSummary, setShowOrderSummary] = useState(false);
  const [orderDiscount, setOrderDiscount] = useState<number>(0);

  // === Payment Processing State ===
  const [processing, setProcessing] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [transferDeadlineDays, setTransferDeadlineDays] = useState(14);
  const [splitPayments, setSplitPayments] = useState<Array<{ paymentMethod: string; amount: number }>>([
    { paymentMethod: 'cash', amount: 0 },
    { paymentMethod: 'card', amount: 0 },
  ]);
  const [printLoading, setPrintLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [notification, setNotification] = useState<{type: 'success' | 'error'; message: string} | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // === Print hook ===


  // Print: try ESC/POS (best quality) > PNG (native) > HTML (fallback)
  const printHtmlDirect = async (fetchUrl: string, title: string, imageUrl?: string, escposUrl?: string) => {
    // 1. PNG image via native app - high resolution bitmap for TSPL printer
    if (imageUrl && typeof (window as any).xprintImage === 'function') {
      (window as any).xprintImage(imageUrl);
      return;
    }
  // 3. Fallback: HTML print via window.open
    try {
      setPrintLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(fetchUrl, {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!response.ok) throw new Error('Blad pobierania dokumentu');
      const html = await response.text();

      const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:72mm;margin:0;padding:2mm 2mm;font-family:"Courier New",Courier,monospace;font-size:14px;font-weight:bold;color:#000;background:#fff;height:auto!important;overflow:visible!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
*{font-weight:bold!important;-webkit-print-color-adjust:exact!important}
img{max-width:100%;height:auto;image-rendering:crisp-edges;-webkit-print-color-adjust:exact!important}
@media print{@page{size:72mm auto;margin:0}html,body{width:72mm;height:auto!important;overflow:visible!important;padding:1mm 2mm;font-size:13px}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
</style></head><body>${html}
<script>
// Force body to full document height then print
function doPrint(){
  document.body.style.height=document.body.scrollHeight+'px';
  document.documentElement.style.height=document.body.scrollHeight+'px';
  document.body.style.overflow='visible';
  document.documentElement.style.overflow='visible';
  window.scrollTo(0,0);
  setTimeout(function(){window.print();},500);
}
// Wait for images
var imgs=document.querySelectorAll('img');var loaded=0;var total=imgs.length;
if(total===0){setTimeout(doPrint,300);}
else{function chk(){loaded++;if(loaded>=total)setTimeout(doPrint,300);}
imgs.forEach(function(i){if(i.complete)chk();else{i.onload=chk;i.onerror=chk;}});
setTimeout(doPrint,4000);}
</script></body></html>`;

      const blob = new Blob([fullHtml], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      const w = window.open(blobUrl, '_blank');
      if (!w) {
        // Fallback: navigate in same window
        window.location.href = blobUrl;
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch (err: any) {
      console.error('Print error:', err);
      setError(err.message || 'Blad drukowania');
    } finally {
      setPrintLoading(false);
    }
  };

  const { printInvoicePdf, printProformaPdf, printReceipt } = usePrint({
    onError: (err) => {
      console.error('Print error:', err);
      setError('Błąd drukowania: ' + err);
    },
  });

  // === Check if actively working ===
  const isActivelyWorking = processing || showOrderSummary || showDocTypeSheet || showPaymentSheet ||
    showCashModal || showCardModal || showTransferModal || showSplitModal || showSuccessModal;

  // === Data Fetching ===
  const fetchReadyOrders = useCallback(async () => {
    try {
      const data = await api.getOrders({ status: OrderStatus.READY_FOR_PICKUP });
      const ordersWithItems = await Promise.all(
        data.orders.map(async (order) => {
          const detailData = await api.getOrder(order.id);
          return detailData.order;
        })
      );
      setOrders(ordersWithItems);
    } catch (err) {
      console.error('Error fetching ready orders:', err);
    }
  }, []);

  const fetchTodayCompleted = useCallback(async () => {
    try {
      const data = await api.getTodayCompletedOrders();
      setCompletedOrders(data.orders);
      setTodaySummary(data.summary);
    } catch (err) {
      console.error('Error fetching today completed:', err);
    }
  }, []);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchReadyOrders(), fetchTodayCompleted()]);
    setRefreshing(false);
  }, [fetchReadyOrders, fetchTodayCompleted]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchReadyOrders(), fetchTodayCompleted()]);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (isActivelyWorking) return;
    const interval = setInterval(() => {
      fetchReadyOrders();
      fetchTodayCompleted();
    }, 30000);
    return () => clearInterval(interval);
  }, [isActivelyWorking, fetchReadyOrders, fetchTodayCompleted]);

  // === Flow Handlers ===
  const handleOrderSelect = (order: OrderWithItems) => {
    setSelectedOrder(order);
    setSelectedDocType(null);
    setCashReceived('');
    setTransferDeadlineDays(14);
    setSplitPayments([
      { paymentMethod: 'cash', amount: 0 },
      { paymentMethod: 'card', amount: 0 },
    ]);
    setError('');
    setOrderDiscount(0);
    setShowOrderSummary(true);
  };

  const selectDocType = (type: DocumentType) => {
    setSelectedDocType(type);
    setShowDocTypeSheet(false);
    if (type === DocumentType.PROFORMA) {
      handleCheckout(undefined, undefined, undefined, type);
    } else {
      setShowPaymentSheet(true);
    }
  };

  const selectPayment = (method: string) => {
    setShowPaymentSheet(false);
    switch (method) {
      case 'cash': setShowCashModal(true); break;
      case 'card': setShowCardModal(true); break;
      case 'transfer': setShowTransferModal(true); break;
      case 'split': setShowSplitModal(true); break;
    }
  };

  const resetFlow = () => {
    setSelectedOrder(null);
    setSelectedDocType(null);
    setShowOrderSummary(false);
    setOrderDiscount(0);
    setShowDocTypeSheet(false);
    setShowPaymentSheet(false);
    setShowCashModal(false);
    setShowCardModal(false);
    setShowTransferModal(false);
    setShowSplitModal(false);
    setShowSuccessModal(false);
    setCheckoutResult(null);
    setCashReceived('');
    setEmailSent(false);
    setError('');
  };

  // === Checkout ===
  const handleCheckout = async (paymentMethod?: PaymentMethod, receivedAmount?: number, deadlineDays?: number, docTypeOverride?: DocumentType) => {
    const docType = docTypeOverride || selectedDocType;
    if (!selectedOrder || !docType) return;
    try {
      setProcessing(true);
      setError('');

      const result = await api.checkout({
        orderId: selectedOrder.id,
        paymentMethod,
        documentType: docType,
        paymentDeadlineDays: deadlineDays,
        discountPercentage: orderDiscount > 0 ? orderDiscount : undefined,
      });

      let change: number | undefined;
      if (paymentMethod === PaymentMethod.CASH && receivedAmount) {
        change = receivedAmount - (result.totalAmount || discountedTotal || 0);
        if (change < 0) change = undefined;
      }

      setCheckoutResult({
        documentType: result.documentType as 'invoice' | 'receipt' | 'proforma',
        documentNumber: result.documentNumber,
        documentId: result.documentId,
        totalAmount: result.totalAmount,
        customerHasEmail: !!(selectedOrder as any).customerEmail,
        change,
        orderId: result.orderId,
      });

      setShowCashModal(false);
      setShowCardModal(false);
      setShowTransferModal(false);
      setShowSplitModal(false);
      setShowSuccessModal(true);

      await Promise.all([fetchReadyOrders(), fetchTodayCompleted()]);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || 'Błąd podczas realizacji płatności');
    } finally {
      setProcessing(false);
    }
  };

  const handleSplitCheckout = async () => {
    if (!selectedOrder || !selectedDocType) return;
    try {
      setProcessing(true);
      setError('');

      const result = await api.checkout({
        orderId: selectedOrder.id,
        paymentSplits: splitPayments.filter(s => s.amount > 0) as any,
        documentType: selectedDocType,
        discountPercentage: orderDiscount > 0 ? orderDiscount : undefined,
      });

      setCheckoutResult({
        documentType: result.documentType as 'invoice' | 'receipt' | 'proforma',
        documentNumber: result.documentNumber,
        documentId: result.documentId,
        totalAmount: result.totalAmount,
        customerHasEmail: !!(selectedOrder as any).customerEmail,
        orderId: result.orderId,
      });

      setShowSplitModal(false);
      setShowSuccessModal(true);

      await Promise.all([fetchReadyOrders(), fetchTodayCompleted()]);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || 'Błąd podczas realizacji płatności');
    } finally {
      setProcessing(false);
    }
  };

  // === Print/Email ===
  const handlePrint = async (docType?: string, docId?: number, docNumber?: string) => {
    const type = docType || checkoutResult?.documentType;
    const id = docId || checkoutResult?.documentId;
    const number = docNumber || checkoutResult?.documentNumber;
    if (!type || !id) return;

    try {
      setPrintLoading(true);
      if (type === 'invoice') {
        await printInvoicePdf(id, { title: `Faktura ${number}` });
      } else if (type === 'proforma') {
        await printProformaPdf(id, { title: `Proforma ${number}` });
      } else {
        const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
        const token2 = localStorage.getItem('token');
        printHtmlDirect(API_URL + '/receipts/' + id + '/html', 'Paragon ' + number, API_URL + '/receipts/' + id + '/receipt-image?token=' + token2, API_URL + '/receipts/' + id + '/escpos?token=' + token2);
      }
    } catch (err: any) {
      console.error('Print error:', err);
      setError(err.message || 'Błąd drukowania');
    } finally {
      setPrintLoading(false);
    }
  };

  const handleViewDocument = (docType?: string, docId?: number) => {
    const type = docType || checkoutResult?.documentType;
    const id = docId || checkoutResult?.documentId;
    if (!type || !id) return;

    let viewUrl: string;
    if (type === 'invoice') viewUrl = `/print/invoice/${id}`;
    else if (type === 'proforma') viewUrl = `/print/proforma/${id}`;
    else viewUrl = `/print/receipt/${id}`;
    window.open(viewUrl, '_blank');
  };

  const [manualEmail, setManualEmail] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);

  const handleSendEmail = async (docId?: number, docType?: string, email?: string) => {
    const id = docId || checkoutResult?.documentId;
    if (!id) return;
    const type = docType || checkoutResult?.documentType;
    try {
      setEmailSending(true);
      const opts = email ? { email } : undefined;
      if (type === 'proforma') {
        await api.sendProformaEmail(id, opts);
      } else {
        await api.sendInvoiceEmail(id, opts);
      }
      // Save email to customer if manually entered
      if (email && checkoutResult?.orderId) {
        try {
          const orderData = selectedOrder || completedOrders.find(o => o.id === checkoutResult.orderId);
          if (orderData && (orderData as any).customerId) {
            await api.updateCustomer((orderData as any).customerId, { email });
            setEmailSaved(true);
          }
        } catch (e) {}
      }
      setEmailSent(true);
      setNotification({ type: 'success', message: 'Email wysłany pomyślnie' });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Błąd wysyłki email';
      setError(msg);
      setNotification({ type: 'error', message: msg });
    } finally {
      setEmailSending(false);
    }
  };

  // Discounted total calculation
  const discountedTotal = selectedOrder && orderDiscount > 0
    ? Math.round(Number(selectedOrder.totalAmount) * (1 - orderDiscount / 100) * 100) / 100
    : Number(selectedOrder?.totalAmount) || 0;

  // === Split helpers ===
  const splitTotal = splitPayments.reduce((sum, s) => sum + (s.amount || 0), 0);
  const splitRemaining = selectedOrder ? Number(formatPrice(discountedTotal - splitTotal)) : 0;

  const handleSummaryNext = () => {
    setShowOrderSummary(false);
    setShowDocTypeSheet(true);
  };

  const getPaymentLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Gotówka';
      case 'card': return 'Karta';
      case 'transfer': return 'Przelew';
      default: return method;
    }
  };

  const getDocLabel = (type: string) => {
    switch (type) {
      case 'invoice': return 'Faktura';
      case 'receipt': return 'Paragon';
      case 'proforma': return 'Proforma';
      default: return type;
    }
  };

  // === RENDER ===
  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex-shrink-0 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Kasa</h1>
          <p className="text-xs text-gray-500">Rozliczanie zamówień</p>
        </div>
        <button
          onClick={refreshData}
          disabled={refreshing}
          className="p-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <svg className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex justify-between items-start">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 text-red-500 font-bold">×</button>
        </div>
      )}
      {/* Notification */}
      {notification && (
        <div className={"fixed top-4 left-4 right-4 z-[9999] p-4 rounded-xl shadow-lg text-sm font-medium flex justify-between items-center " + (notification.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white')}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 font-bold text-white/80">×</button>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex mx-4 mt-3 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('ready')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'ready' ? 'bg-white shadow text-primary-600' : 'text-gray-600'
          }`}
        >
          Gotowe do wydania
          {orders.length > 0 && (
            <span className="ml-1 bg-primary-600 text-white text-xs rounded-full px-1.5 py-0.5">
              {orders.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'history' ? 'bg-white shadow text-primary-600' : 'text-gray-600'
          }`}
        >
          Historia dnia
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full mx-auto mb-3"></div>
              <p className="text-sm text-gray-500">Ładowanie...</p>
            </div>
          </div>
        ) : activeTab === 'ready' ? (
          /* === READY ORDERS TAB === */
          <div className="px-4 py-3 space-y-3">
            {orders.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <p className="text-gray-400 font-medium">Brak zamówień do wydania</p>
                <p className="text-gray-300 text-sm mt-1">Zamówienia pojawią się automatycznie</p>
              </div>
            ) : (
              orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => handleOrderSelect(order)}
                  className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-left active:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base text-gray-900">{order.orderNumber}</p>
                      <p className="text-sm text-gray-500 mt-0.5 truncate">
                        {order.customerName || 'Klient detaliczny'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'pozycja' : 'pozycji'}
                      </p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-lg font-bold text-primary-600">
                        {formatPrice(order.totalAmount)} zł
                      </p>
                      <svg className="w-5 h-5 text-gray-300 ml-auto mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          /* === HISTORY TAB === */
          <div className="px-4 py-3 space-y-3">
            {/* Summary Card */}
            {todaySummary && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 font-medium">Dzisiejsza sprzedaż</span>
                  <span className="text-xl font-bold text-primary-600">
                    {formatPrice(todaySummary.grandTotal)} zł
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                  {todaySummary.cashTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Gotówka</span>
                      <span className="font-medium">{formatPrice(todaySummary.cashTotal)} zł</span>
                    </div>
                  )}
                  {todaySummary.cardTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Karta</span>
                      <span className="font-medium">{formatPrice(todaySummary.cardTotal)} zł</span>
                    </div>
                  )}
                  {todaySummary.transferTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Przelew</span>
                      <span className="font-medium">{formatPrice(todaySummary.transferTotal)} zł</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm pt-1">
                    <span className="text-gray-500">Transakcje</span>
                    <span className="font-medium">{todaySummary.totalTransactions}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Completed Transactions */}
            {completedOrders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">Brak transakcji dzisiaj</p>
              </div>
            ) : (
              completedOrders.map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => setShowHistoryActions(tx)}
                  className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-3 text-left active:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">
                        {tx.document?.number || tx.orderNumber}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{tx.customerName || '-'}</p>
                      <div className="flex gap-1.5 mt-1.5">
                        <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                          {tx.document ? getDocLabel(tx.document.type) : '-'}
                        </span>
                        <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                          {tx.document ? getPaymentLabel(tx.document.paymentMethod) : '-'}
                        </span>
                      </div>
                    </div>
                    <p className="font-bold text-sm text-gray-900 ml-3">
                      {formatPrice(tx.totalAmount)} zł
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* === FULL-SCREEN: Order Summary === */}
      {showOrderSummary && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <button onClick={resetFlow} className="p-1">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-center">
              <h3 className="font-bold text-gray-900">Podsumowanie</h3>
              <p className="text-xs text-gray-500">{selectedOrder.orderNumber}</p>
            </div>
            <div className="w-8" />
          </div>

          {/* Customer info */}
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">{selectedOrder.customerName || 'Klient detaliczny'}</p>
          </div>

          {/* Items list */}
          <div className="flex-1 overflow-auto px-4 py-3">
            <div className="space-y-2">
              {(selectedOrder.items || []).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.productSnapshot?.plantName || 'Produkt'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.productSnapshot?.potSize && `${item.productSnapshot.potSize} • `}
                      {item.quantity} szt. x {formatPrice(item.unitPriceGross)} zł
                    </p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 ml-3">
                    {formatPrice(Number(item.totalPrice || item.quantity * item.unitPriceGross))} zł
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Discount + Total section */}
          <div className="border-t border-gray-200 bg-white px-4 pt-3 pb-2">
            {/* Subtotal */}
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-500">Suma</span>
              <span className="text-sm font-medium text-gray-700">{formatPrice(selectedOrder.totalAmount)} zł</span>
            </div>

            {/* Discount buttons */}
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-2">Rabat:</p>
              <div className="flex gap-2 flex-wrap">
                {[0, 5, 10, 15, 20, 25].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setOrderDiscount(pct)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      orderDiscount === pct
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                    }`}
                  >
                    {pct === 0 ? 'Brak' : `${pct}%`}
                  </button>
                ))}
              </div>
              {/* Custom discount input */}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-500">Inny:</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  value={orderDiscount || ''}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                    setOrderDiscount(val);
                  }}
                  className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center"
                  placeholder="0"
                />
                <span className="text-xs text-gray-500">%</span>
              </div>
            </div>

            {/* Discount amount */}
            {orderDiscount > 0 && (
              <div className="flex justify-between items-center mb-2 text-red-600">
                <span className="text-sm">Rabat ({orderDiscount}%)</span>
                <span className="text-sm font-medium">
                  -{formatPrice(Number(selectedOrder.totalAmount) * orderDiscount / 100)} zł
                </span>
              </div>
            )}

            {/* Final total */}
            <div className="flex justify-between items-center py-3 border-t border-gray-200">
              <span className="text-base font-bold text-gray-900">Do zapłaty</span>
              <span className="text-xl font-bold text-primary-600">
                {formatPrice(orderDiscount > 0 ? Number(selectedOrder.totalAmount) * (1 - orderDiscount / 100) : Number(selectedOrder.totalAmount))} zł
              </span>
            </div>
          </div>

          {/* Next button */}
          <div className="p-4 pb-6">
            <button
              onClick={handleSummaryNext}
              className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg active:bg-green-700 transition-colors"
            >
              Dalej
            </button>
          </div>
        </div>
      )}

      {/* === BOTTOM SHEET: Document Type === */}
      {showDocTypeSheet && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={resetFlow} />
          <div className="relative w-full bg-white rounded-t-2xl p-4 pb-8 animate-slide-up">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-1">Wybierz typ dokumentu</h3>
            <p className="text-sm text-gray-500 mb-4">
              {selectedOrder.orderNumber} — {formatPrice(discountedTotal)} zł
            </p>
            <div className="space-y-2">
              <button
                onClick={() => selectDocType(DocumentType.RECEIPT)}
                className="w-full p-4 bg-gray-50 rounded-xl text-left active:bg-gray-100 border border-gray-200"
              >
                <p className="font-medium">🧾 Paragon</p>
                <p className="text-xs text-gray-500 mt-0.5">Wydruk fiskalny</p>
              </button>
              <button
                onClick={() => selectDocType(DocumentType.INVOICE)}
                disabled={!selectedOrder.customerId}
                className="w-full p-4 bg-gray-50 rounded-xl text-left active:bg-gray-100 border border-gray-200 disabled:opacity-40"
              >
                <p className="font-medium">📄 Faktura VAT</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedOrder.customerId ? (selectedOrder.customerName || 'Klient') : 'Wymaga danych klienta'}
                </p>
              </button>
              <button
                onClick={() => selectDocType(DocumentType.PROFORMA)}
                className="w-full p-4 bg-gray-50 rounded-xl text-left active:bg-gray-100 border border-gray-200"
              >
                <p className="font-medium">📋 Proforma</p>
                <p className="text-xs text-gray-500 mt-0.5">Nie zamyka zamówienia</p>
              </button>
            </div>
            <button onClick={resetFlow} className="w-full mt-3 py-3 text-gray-400 text-sm">
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* === BOTTOM SHEET: Payment Method === */}
      {showPaymentSheet && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={resetFlow} />
          <div className="relative w-full bg-white rounded-t-2xl p-4 pb-8 animate-slide-up">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-1">Metoda płatności</h3>
            <p className="text-sm text-gray-500 mb-4">
              {formatPrice(discountedTotal)} zł — {selectedDocType === DocumentType.INVOICE ? 'Faktura' : 'Paragon'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => selectPayment('cash')}
                className="p-4 bg-green-50 border-2 border-green-200 rounded-xl text-center active:bg-green-100"
              >
                <span className="text-2xl">💵</span>
                <p className="font-medium text-green-800 mt-2">Gotówka</p>
              </button>
              <button
                onClick={() => selectPayment('card')}
                className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl text-center active:bg-blue-100"
              >
                <span className="text-2xl">💳</span>
                <p className="font-medium text-blue-800 mt-2">Karta</p>
              </button>
              <button
                onClick={() => selectPayment('transfer')}
                className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl text-center active:bg-purple-100"
              >
                <span className="text-2xl">🏦</span>
                <p className="font-medium text-purple-800 mt-2">Przelew</p>
              </button>
              <button
                onClick={() => selectPayment('split')}
                className="p-4 bg-orange-50 border-2 border-orange-200 rounded-xl text-center active:bg-orange-100"
              >
                <span className="text-2xl">➗</span>
                <p className="font-medium text-orange-800 mt-2">Podzielona</p>
              </button>
            </div>
            <button
              onClick={() => { setShowPaymentSheet(false); setShowDocTypeSheet(true); }}
              className="w-full mt-3 py-3 text-gray-400 text-sm"
            >
              ← Wstecz
            </button>
          </div>
        </div>
      )}

      {/* === MODAL: Cash Payment === */}
      {showCashModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <button onClick={() => { setShowCashModal(false); setShowPaymentSheet(true); }} className="p-1">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="font-bold text-gray-900">Płatność gotówką</h3>
            <div className="w-8" />
          </div>
          <div className="flex-1 overflow-auto">
            <div className="text-center py-6">
              <p className="text-sm text-gray-500">Do zapłaty</p>
              <p className="text-3xl font-bold text-gray-900">{formatPrice(discountedTotal)} zł</p>
            </div>
            <div className="text-center px-6">
              <p className="text-sm text-gray-500 mb-2">Otrzymano</p>
              <input
                type="number"
                inputMode="decimal"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="text-center text-2xl font-bold w-full py-2 border-b-2 border-primary-500 outline-none bg-transparent"
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-2 px-6 mt-4">
              {(() => {
                const total = discountedTotal;
                const roundUp = (v: number, step: number) => Math.ceil(v / step) * step;
                const suggestions = new Set<number>();
                suggestions.add(Math.ceil(total));
                [10, 20, 50, 100, 200, 500].forEach(step => {
                  const rounded = roundUp(total, step);
                  if (rounded >= total) suggestions.add(rounded);
                });
                return Array.from(suggestions).sort((a, b) => a - b).slice(0, 6).map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setCashReceived(String(amount))}
                    className={'py-3 rounded-lg font-medium active:bg-gray-200 transition-colors ' + (amount === Math.ceil(total) ? 'bg-primary-100 text-primary-700 border border-primary-300' : 'bg-gray-100')}
                  >
                    {amount} zł
                  </button>
                ));
              })()}
            </div>
            {cashReceived && Number(cashReceived) >= discountedTotal && (
              <div className="text-center mt-4 py-3 mx-6 bg-green-50 rounded-xl border border-green-200">
                <p className="text-sm text-green-600">Reszta</p>
                <p className="text-2xl font-bold text-green-700">
                  {formatPrice(Number(cashReceived) - discountedTotal)} zł
                </p>
              </div>
            )}
          </div>
          {error && <p className="text-red-600 text-sm text-center px-4 mb-2">{error}</p>}
          <div className="p-4 pb-6">
            <button
              onClick={() => handleCheckout(PaymentMethod.CASH, Number(cashReceived))}
              disabled={processing || !cashReceived || Number(cashReceived) < discountedTotal}
              className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 active:bg-green-700 transition-colors"
            >
              {processing ? 'Przetwarzanie...' : 'Potwierdź płatność'}
            </button>
          </div>
        </div>
      )}

      {/* === MODAL: Card Payment === */}
      {showCardModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <button onClick={() => { setShowCardModal(false); setShowPaymentSheet(true); }} className="p-1">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="font-bold text-gray-900">Płatność kartą</h3>
            <div className="w-8" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <span className="text-6xl mb-4">💳</span>
            <p className="text-sm text-gray-500">Kwota do zapłaty</p>
            <p className="text-4xl font-bold text-gray-900 mt-2">{formatPrice(discountedTotal)} zł</p>
            <p className="text-sm text-gray-400 mt-6 text-center">
              Potwierdź po zakończeniu płatności na terminalu
            </p>
          </div>
          {error && <p className="text-red-600 text-sm text-center px-4 mb-2">{error}</p>}
          <div className="p-4 pb-6">
            <button
              onClick={() => handleCheckout(PaymentMethod.CARD)}
              disabled={processing}
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 active:bg-blue-700 transition-colors"
            >
              {processing ? 'Przetwarzanie...' : 'Potwierdź płatność'}
            </button>
          </div>
        </div>
      )}

      {/* === MODAL: Transfer Payment === */}
      {showTransferModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <button onClick={() => { setShowTransferModal(false); setShowPaymentSheet(true); }} className="p-1">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="font-bold text-gray-900">Płatność przelewem</h3>
            <div className="w-8" />
          </div>
          <div className="flex-1 px-6 py-6">
            <div className="text-center mb-8">
              <p className="text-sm text-gray-500">Kwota</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatPrice(discountedTotal)} zł</p>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Termin płatności</label>
            <div className="grid grid-cols-4 gap-2">
              {[7, 14, 21, 30].map((days) => (
                <button
                  key={days}
                  onClick={() => setTransferDeadlineDays(days)}
                  className={`py-3 rounded-lg font-medium text-sm transition-colors ${
                    transferDeadlineDays === days
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                  }`}
                >
                  {days} dni
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-600 text-sm text-center px-4 mb-2">{error}</p>}
          <div className="p-4 pb-6">
            <button
              onClick={() => handleCheckout(PaymentMethod.TRANSFER, undefined, transferDeadlineDays)}
              disabled={processing}
              className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 active:bg-purple-700 transition-colors"
            >
              {processing ? 'Przetwarzanie...' : 'Potwierdź'}
            </button>
          </div>
        </div>
      )}

      {/* === MODAL: Split Payment === */}
      {showSplitModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <button onClick={() => { setShowSplitModal(false); setShowPaymentSheet(true); }} className="p-1">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="font-bold text-gray-900">Płatność podzielona</h3>
            <div className="w-8" />
          </div>
          <div className="flex-1 overflow-auto px-4 py-4">
            <div className="text-center mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-500">Suma: {formatPrice(discountedTotal)} zł</p>
              <p className={`text-lg font-bold ${Math.abs(splitRemaining) < 0.01 ? 'text-green-600' : 'text-orange-600'}`}>
                Pozostało: {formatPrice(splitRemaining)} zł
              </p>
            </div>
            {splitPayments.map((split, index) => (
              <div key={index} className="flex items-center gap-2 mb-3">
                <select
                  value={split.paymentMethod}
                  onChange={(e) => {
                    const updated = [...splitPayments];
                    updated[index] = { ...updated[index], paymentMethod: e.target.value };
                    setSplitPayments(updated);
                  }}
                  className="flex-1 p-3 border border-gray-300 rounded-lg bg-white text-sm"
                >
                  <option value="cash">Gotówka</option>
                  <option value="card">Karta</option>
                  <option value="transfer">Przelew</option>
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  value={split.amount || ''}
                  onChange={(e) => {
                    const updated = [...splitPayments];
                    updated[index] = { ...updated[index], amount: Number(e.target.value) || 0 };
                    setSplitPayments(updated);
                  }}
                  className="w-28 p-3 border border-gray-300 rounded-lg text-right text-sm"
                  placeholder="0.00"
                />
                {splitPayments.length > 2 && (
                  <button
                    onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== index))}
                    className="p-2 text-red-500"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setSplitPayments([...splitPayments, { paymentMethod: 'cash', amount: 0 }])}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-sm active:bg-gray-50"
            >
              + Dodaj płatność
            </button>
          </div>
          {error && <p className="text-red-600 text-sm text-center px-4 mb-2">{error}</p>}
          <div className="p-4 pb-6">
            <button
              onClick={handleSplitCheckout}
              disabled={processing || Math.abs(splitRemaining) > 0.01 || splitPayments.filter(s => s.amount > 0).length < 2}
              className="w-full py-4 bg-orange-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 active:bg-orange-700 transition-colors"
            >
              {processing ? 'Przetwarzanie...' : 'Potwierdź płatność'}
            </button>
          </div>
        </div>
      )}

      {/* === MODAL: Success === */}
      {showSuccessModal && checkoutResult && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-700">Płatność zakończona</h2>
            <p className="text-gray-500 mt-2">{getDocLabel(checkoutResult.documentType)}</p>
            <p className="font-medium text-gray-900 mt-1">{checkoutResult.documentNumber}</p>
            <p className="text-2xl font-bold text-gray-900 mt-3">{formatPrice(checkoutResult.totalAmount)} zł</p>
            {checkoutResult.change !== undefined && checkoutResult.change > 0 && (
              <div className="mt-3 px-4 py-2 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-600">Reszta: <span className="font-bold">{formatPrice(checkoutResult.change)} zł</span></p>
              </div>
            )}
          </div>
          <div className="px-4 pb-6 space-y-2">
            {checkoutResult.documentType === 'invoice' && checkoutResult.documentId && (
            <button
              onClick={async () => {
                try {
                  setPrintLoading(true);
                  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
                  const token = localStorage.getItem('token');
                  const API_URL2 = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
                  printHtmlDirect(API_URL2 + '/ksef/invoices/' + checkoutResult.documentId + '/confirmation-html?format=receipt', 'Potwierdzenie KSeF ' + checkoutResult.documentNumber, API_URL2 + '/ksef/invoices/' + checkoutResult.documentId + '/confirmation-image?token=' + token, API_URL2 + '/ksef/invoices/' + checkoutResult.documentId + '/escpos?token=' + token);
                } catch (err: any) {
                  console.error('Print KSeF confirmation error:', err);
                  setError(err.message || 'Blad drukowania potwierdzenia KSeF');
                } finally {
                  setPrintLoading(false);
                }
              }}
              disabled={printLoading}
              className="w-full py-3.5 bg-green-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 active:bg-green-700"
            >
              {printLoading ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
              Drukuj KSeF
            </button>
            )}
            {checkoutResult.documentType === 'invoice' && checkoutResult.documentId && (
            <button
              onClick={async () => {
                try {
                  setPrintLoading(true);
                  const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
                  const token = localStorage.getItem('token');
                  const API_URL3 = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
                  printHtmlDirect(API_URL3 + '/invoices/' + checkoutResult.documentId + '/invoice-receipt-html', 'Faktura ' + checkoutResult.documentNumber, API_URL3 + '/invoices/' + checkoutResult.documentId + '/invoice-receipt-image?token=' + token);
                } catch (err: any) {
                  console.error('Print invoice receipt error:', err);
                  setError(err.message || 'Blad drukowania');
                } finally {
                  setPrintLoading(false);
                }
              }}
              disabled={printLoading}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 active:bg-blue-700"
            >
              {printLoading ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              Drukuj fakture
            </button>
            )}
            {checkoutResult.documentType === 'receipt' && checkoutResult.documentId && (
            <button
              onClick={() => {
                const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
                printHtmlDirect(API_URL + '/receipts/' + checkoutResult.documentId + '/html', 'Paragon ' + checkoutResult.documentNumber, API_URL + '/receipts/' + checkoutResult.documentId + '/receipt-image?token=' + token, API_URL + '/receipts/' + checkoutResult.documentId + '/escpos?token=' + token);
              }}
              disabled={printLoading}
              className="w-full py-3.5 bg-green-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 active:bg-green-700"
            >
              {printLoading ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              )}
              Drukuj paragon
            </button>
            )}

            {(checkoutResult.documentType === 'invoice' || checkoutResult.documentType === 'proforma') && (
              <>
              {!emailSent && !checkoutResult.customerHasEmail && (
                <div className="flex gap-2 px-0">
                  <input
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="Wpisz adres e-mail klienta"
                    className="flex-1 px-3 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}
              {emailSaved && (
                <p className="text-xs text-green-600 text-center">Email zapisany w danych kontrahenta</p>
              )}
              <button
                onClick={() => handleSendEmail(undefined, undefined, manualEmail || undefined)}
                disabled={emailSending || emailSent}
                className="w-full py-3.5 bg-gray-100 text-gray-800 rounded-xl font-medium flex items-center justify-center gap-2 active:bg-gray-200 disabled:opacity-50"
              >
                {emailSending ? (
                  <div className="animate-spin w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full" />
                ) : emailSent ? (
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
                {emailSent ? 'Wysłano' : 'Wyślij e-mail'}
              </button>
              </>
            )}
            <button onClick={resetFlow} className="w-full py-3.5 text-gray-400 font-medium">
              Zamknij
            </button>
          </div>
        </div>
      )}

      {/* === BOTTOM SHEET: History Actions === */}
      {showHistoryActions && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowHistoryActions(null)} />
          <div className="relative w-full bg-white rounded-t-2xl p-4 pb-8">
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-1">{showHistoryActions.document?.number || showHistoryActions.orderNumber}</h3>
            <p className="text-sm text-gray-500 mb-4">{formatPrice(showHistoryActions.totalAmount)} zł</p>
            <div className="space-y-2">
              {showHistoryActions.document && (
                <>
                  {/* Drukuj ponownie - for invoices prints KSeF paragon, for receipts/proforma uses standard print */}
                  <button
                    onClick={async () => {
                      const tx = showHistoryActions;
                      setShowHistoryActions(null);
                      const docType = tx.document!.type;
                      if (docType === 'invoice') {
                        // Print KSeF confirmation in paragon form
                        try {
                          setPrintLoading(true);
                          const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
                          const token = localStorage.getItem('token');
                          const API_URL4 = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
                          printHtmlDirect(API_URL4 + '/ksef/invoices/' + tx.document!.id + '/confirmation-html?format=receipt', 'Potwierdzenie KSeF ' + tx.document!.number, API_URL4 + '/ksef/invoices/' + tx.document!.id + '/confirmation-image?token=' + token, API_URL4 + '/ksef/invoices/' + tx.document!.id + '/escpos?token=' + token);
                        } catch (err: any) {
                          console.error('Print KSeF error:', err);
                          setError(err.message || 'Błąd drukowania');
                        } finally {
                          setPrintLoading(false);
                        }
                      } else {
                        handlePrint(docType, tx.document!.id, tx.document!.number);
                      }
                    }}
                    disabled={printLoading}
                    className="w-full p-4 bg-gray-50 rounded-xl text-left active:bg-gray-100 border border-gray-200 font-medium disabled:opacity-50"
                  >
                    🖨️ Drukuj ponownie
                  </button>



                  {(showHistoryActions.document.type === 'invoice' || showHistoryActions.document.type === 'proforma') && (
                    <button
                      onClick={async () => {
                        const tx = showHistoryActions;
                        setShowHistoryActions(null);
                        await handleSendEmail(tx.document!.id, tx.document!.type);
                      }}
                      className="w-full p-4 bg-gray-50 rounded-xl text-left active:bg-gray-100 border border-gray-200 font-medium"
                    >
                      ✉️ Wyślij e-mail
                    </button>
                  )}

                                    {/* Wyslij potwierdzenie KSeF mailem */}
                  {showHistoryActions.document.type === 'invoice' && (
                    <div className="w-full p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <div className="font-medium text-blue-800 mb-2">Wyślij potwierdzenie KSeF</div>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          id="history-email-input"
                          defaultValue={showHistoryActions.customerEmail || ''}
                          placeholder="Wpisz adres e-mail"
                          className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={async () => {
                            const tx = showHistoryActions;
                            const emailInput = document.getElementById('history-email-input') as HTMLInputElement;
                            const email = emailInput?.value?.trim();
                            if (!email) { setError('Podaj adres e-mail'); return; }
                            setShowHistoryActions(null);
                            try {
                              setEmailSending(true);
                              await api.sendInvoiceEmail(tx.document!.id, { email });
                              if ((tx as any).customerId) {
                                try { await api.updateCustomer((tx as any).customerId, { email }); } catch(e) {}
                              }
                              setNotification({ type: 'success', message: 'Potwierdzenie wysłane na ' + email });
                            } catch (err: any) {
                              setError(err?.response?.data?.error || err.message || 'Błąd wysyłki');
                            } finally {
                              setEmailSending(false);
                            }
                          }}
                          disabled={emailSending}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {emailSending ? 'Wysyłam...' : 'Wyślij'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <button onClick={() => setShowHistoryActions(null)} className="w-full mt-3 py-3 text-gray-400 text-sm">
              Zamknij
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
